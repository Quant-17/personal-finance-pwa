import { describe, expect, it, vi } from "vitest";
import { createHandler } from "./handler";
import type { Dependencies } from "./handler";
import { sha256, tokenCipher } from "./crypto";
const encryptionKey = Buffer.alloc(32, 7).toString("base64url");
const env = {
  appUrl: "https://folio.example.invalid/",
  functionUrl: "https://project.example.invalid/functions/v1/gmail-receipts",
  clientId: "synthetic-client",
  clientSecret: "synthetic-secret",
  encryptionKey,
  schedulerSecret: "synthetic-scheduler",
};
const request = (action: string, token = "synthetic-owner") =>
  new Request(env.functionUrl, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      Origin: new URL(env.appUrl).origin,
    },
    body: JSON.stringify({ action }),
  });
const base = (): Dependencies => ({
  env,
  owner: vi.fn(async () => "owner-a"),
  service: vi.fn(async () => null),
  fetch: vi.fn(),
  now: () => new Date("2026-11-21T00:00:00Z"),
});
describe("Gmail server boundary", () => {
  it("denies unverified users and cross-origin requests before accessing storage", async () => {
    const d = base();
    d.owner = async () => null;
    expect((await createHandler(d)(request("connect"))).status).toBe(401);
    expect(d.service).not.toHaveBeenCalled();
    const req = request("connect");
    req.headers.set("Origin", "https://attacker.invalid");
    expect((await createHandler(d)(req)).status).toBe(403);
  });
  it("creates state/PKCE without returning a token or credential to the app", async () => {
    const d = base();
    const res = await createHandler(d)(request("connect"));
    const { url } = await res.json();
    const target = new URL(url);
    expect(target.origin).toBe("https://accounts.google.com");
    expect(target.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/gmail.readonly",
    );
    expect(target.searchParams.get("code_challenge_method")).toBe("S256");
    const call = vi.mocked(d.service).mock.calls[0];
    expect(call[0]).toBe("start");
    expect(call[1]).toBe("owner-a");
    expect(call[2]?.hash).toBe(await sha256(target.searchParams.get("state")!));
    expect(call[2]?.verifier).not.toBe(
      target.searchParams.get("code_challenge"),
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(url).not.toContain("synthetic-secret");
  });
  it("rejects absent/replayed OAuth state without exchanging a code", async () => {
    const d = base();
    const res = await createHandler(d)(
      new Request(
        env.functionUrl + "/callback?state=synthetic-state&code=secret-code",
      ),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      env.appUrl + "?gmail=failed#activity",
    );
    expect(d.fetch).not.toHaveBeenCalled();
  });
  it("encrypts credentials with an owner/purpose binding and detects tampering", async () => {
    const c = await tokenCipher(encryptionKey);
    const sealed = await c.seal("synthetic-refresh", "owner-a:tokens");
    expect(sealed).not.toContain("synthetic-refresh");
    expect(await c.open(sealed, "owner-a:tokens")).toBe("synthetic-refresh");
    await expect(c.open(sealed, "owner-b:tokens")).rejects.toThrow();
    await expect(
      c.open(sealed.slice(0, -3) + "xxx", "owner-a:tokens"),
    ).rejects.toThrow();
  });
  it("exchanges a valid callback with PKCE and stores only encrypted refresh credentials", async () => {
    const d = base(),
      c = await tokenCipher(encryptionKey);
    d.service = vi.fn(async (action) =>
      action === "consume_state"
        ? {
            user_id: "owner-a",
            generation: "synthetic-generation",
            verifier: await c.seal("synthetic-verifier", "owner-a:pkce"),
          }
        : true,
    );
    d.fetch = vi.fn(async (input, init) =>
      String(input).includes("oauth2.googleapis")
        ? (expect(
            new URLSearchParams(init?.body as string).get("code_verifier"),
          ).toBe("synthetic-verifier"),
          Response.json({
            access_token: "synthetic-access",
            refresh_token: "synthetic-refresh",
            scope: "https://www.googleapis.com/auth/gmail.readonly",
          }))
        : Response.json({ emailAddress: "fixture@example.invalid" }),
    );
    const res = await createHandler(d)(
      new Request(
        env.functionUrl + "/callback?state=synthetic-state&code=synthetic-code",
      ),
    );
    expect(res.headers.get("location")).toBe(
      env.appUrl + "?gmail=connected#activity",
    );
    const saved = vi
      .mocked(d.service)
      .mock.calls.find((c) => c[0] === "connect")![2]!;
    expect(
      JSON.parse(await c.open(saved.ciphertext as string, "owner-a:tokens")),
    ).toEqual({ refresh_token: "synthetic-refresh" });
    expect(JSON.stringify(saved)).not.toContain("synthetic-access");
  });
  it("uses server-only scheduler authentication and never accepts a user JWT as scheduler access", async () => {
    const d = base();
    expect((await createHandler(d)(request("scheduled"))).status).toBe(401);
    expect(d.service).not.toHaveBeenCalled();
    d.service = vi.fn(async () => []);
    expect(
      (await createHandler(d)(request("scheduled", env.schedulerSecret)))
        .status,
    ).toBe(200);
  });
  it("syncs one bounded page, retains pagination and never posts an accounting entry", async () => {
    const d = base(),
      c = await tokenCipher(encryptionKey);
    d.service = vi.fn(async (action) =>
      action === "lease"
        ? {
            lease: "synthetic-lease",
            last_synced_at: null,
            ciphertext: await c.seal(
              JSON.stringify({ refresh_token: "synthetic-refresh" }),
              "owner-a:tokens",
            ),
          }
        : true,
    );
    d.fetch = vi.fn(async (input) =>
      String(input).includes("oauth2.googleapis")
        ? Response.json({ access_token: "synthetic-access" })
        : String(input).includes("messages?")
          ? Response.json({
              messages: [{ id: "abc123" }],
              nextPageToken: "synthetic-next-page",
            })
          : Response.json({
              id: "abc123",
              internalDate: String(new Date("2026-11-20").getTime()),
              payload: {
                mimeType: "text/plain",
                headers: [
                  { name: "from", value: "receipts@uber.com" },
                  { name: "subject", value: "Trip receipt" },
                ],
                body: {
                  data: Buffer.from("Paid INR 100.29").toString("base64url"),
                },
              },
            }),
    );
    expect(await (await createHandler(d)(request("sync"))).json()).toEqual({
      status: "ok",
      candidates: 1,
      has_more: true,
    });
    const calls = vi.mocked(d.service).mock.calls;
    expect(calls.find((c) => c[0] === "ingest")?.[2]?.rows).toHaveLength(1);
    expect(calls.map((c) => c[0])).not.toContain("record_entry");
    const checkpoint = calls.filter((c) => c[0] === "token").at(-1)![2]!
      .ciphertext as string;
    expect(
      JSON.parse(await c.open(checkpoint, "owner-a:tokens")).paging.pageToken,
    ).toBe("synthetic-next-page");
    expect(calls.at(-1)?.[2]?.cursor).toBeNull();
  });
  it("keeps the cursor unchanged on provider failures and signals revoked consent without leaking provider details", async () => {
    const d = base(),
      c = await tokenCipher(encryptionKey);
    d.service = vi.fn(async (action) =>
      action === "lease"
        ? {
            lease: "synthetic-lease",
            last_synced_at: "2026-11-20T00:00:00Z",
            ciphertext: await c.seal(
              '{"refresh_token":"synthetic-refresh"}',
              "owner-a:tokens",
            ),
          }
        : true,
    );
    d.fetch = vi.fn(async () =>
      Response.json(
        { error: "invalid_grant", secret: "do-not-display" },
        { status: 400 },
      ),
    );
    const res = await createHandler(d)(request("sync"));
    expect(await res.text()).toBe('{"status":"reconnect_required"}');
    expect(vi.mocked(d.service).mock.calls.at(-1)?.[2]).toEqual({
      lease: "synthetic-lease",
      status: "reconnect_required",
      cursor: "2026-11-20T00:00:00Z",
    });
  });
});
it("resumes a checkpoint and advances the cursor only after its final page", async () => {
  const d = base(),
    c = await tokenCipher(encryptionKey);
  const tokens = {
    refresh_token: "synthetic-refresh",
    paging: {
      after: 100,
      before: 200,
      pageToken: "synthetic-page",
      cursor: "2026-11-20T00:00:00Z",
    },
  };
  d.service = vi.fn(async (action) =>
    action === "lease"
      ? {
          lease: "synthetic-lease",
          last_synced_at: null,
          ciphertext: await c.seal(JSON.stringify(tokens), "owner-a:tokens"),
        }
      : true,
  );
  d.fetch = vi.fn(async (input) =>
    String(input).includes("oauth2.googleapis")
      ? Response.json({ access_token: "synthetic-access" })
      : (expect(new URL(String(input)).searchParams.get("pageToken")).toBe(
          "synthetic-page",
        ),
        Response.json({ messages: [] })),
  );
  expect(await (await createHandler(d)(request("sync"))).json()).toMatchObject({
    status: "ok",
    has_more: false,
  });
  const calls = vi.mocked(d.service).mock.calls;
  expect(calls.at(-1)?.[2]?.cursor).toBe(tokens.paging.cursor);
  const checkpoint = calls.filter((call) => call[0] === "token").at(-1)![2]!
    .ciphertext as string;
  expect(
    JSON.parse(await c.open(checkpoint, "owner-a:tokens")).paging,
  ).toBeUndefined();
});
it("skips oversized email responses without retaining raw content or trapping pagination", async () => {
  const d = base(),
    c = await tokenCipher(encryptionKey);
  d.service = vi.fn(async (action) =>
    action === "lease"
      ? {
          lease: "synthetic-lease",
          last_synced_at: null,
          ciphertext: await c.seal(
            '{"refresh_token":"synthetic-refresh"}',
            "owner-a:tokens",
          ),
        }
      : true,
  );
  d.fetch = vi.fn(async (input) =>
    String(input).includes("oauth2.googleapis")
      ? Response.json({ access_token: "synthetic-access" })
      : String(input).includes("messages?")
        ? Response.json({ messages: [{ id: "abc123" }] })
        : new Response("x".repeat(2_000_001)),
  );
  expect(await (await createHandler(d)(request("sync"))).json()).toMatchObject({
    status: "ok",
    candidates: 0,
    has_more: false,
  });
  expect(
    vi.mocked(d.service).mock.calls.find((c) => c[0] === "ingest")?.[2]?.rows,
  ).toEqual([]);
});
it("bounds a request body before authentication and does not trust the content-length header", async () => {
  const d = base(),
    req = request("connect");
  const oversized = new Request(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify({ action: "connect", extra: "x".repeat(2048) }),
  });
  expect((await createHandler(d)(oversized)).status).toBe(413);
  expect(d.owner).not.toHaveBeenCalled();
  expect(d.service).not.toHaveBeenCalled();
});
