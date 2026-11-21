import { GMAIL_SCOPE, MERCHANT_QUERY, parseReceipt } from "./receipts.ts";
import type { GmailMessage } from "./receipts.ts";
import { randomSecret, sha256, tokenCipher } from "./crypto.ts";

export type Dependencies = {
  env: {
    appUrl: string;
    functionUrl: string;
    clientId: string;
    clientSecret: string;
    encryptionKey: string;
    schedulerSecret: string;
  };
  owner: (token: string) => Promise<string | null>;
  service: (
    action: string,
    user: string | null,
    data?: Record<string, unknown>,
  ) => Promise<unknown>;
  fetch: typeof fetch;
  now?: () => Date;
};
type Tokens = {
  refresh_token: string;
  paging?: { after: number; before: number; pageToken: string; cursor: string };
};
class Reconnect extends Error {}
class OversizedMessage extends Error {}
export function createHandler(deps: Dependencies) {
  const { env, service } = deps;
  const app = new URL(env.appUrl);
  if (
    (app.protocol !== "https:" && app.hostname !== "localhost") ||
    app.pathname !== "/" ||
    app.search ||
    app.hash
  )
    throw new Error("Invalid app origin.");
  const origin = app.origin;
  const callback = env.functionUrl.replace(/\/$/, "") + "/callback";
  const now = deps.now ?? (() => new Date());
  const headers = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    Pragma: "no-cache",
    Vary: "Origin",
    "Referrer-Policy": "no-referrer",
  };
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  const redirect = (status: string) =>
    new Response(null, {
      status: 303,
      headers: { ...headers, Location: `${origin}/?gmail=${status}#activity` },
    });
  async function google(url: string, init: RequestInit = {}) {
    const res = await deps.fetch(url, {
      ...init,
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
      redirect: "error",
    });
    if (!res.ok) {
      if (res.status === 400 || res.status === 401)
        throw new Reconnect("Reconnect required.");
      throw new Error("Provider unavailable.");
    }
    const reader = res.body?.getReader();
    if (!reader) throw new Error("Empty provider response.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) {
        await reader.cancel();
        throw new OversizedMessage();
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  const cipher = () => tokenCipher(env.encryptionKey);
  async function sync(user: string) {
    const claimed = (await service("lease", user)) as {
      lease: string;
      last_synced_at: string | null;
      ciphertext: string;
    } | null;
    if (!claimed)
      return {
        status: "busy",
        message:
          "A sync is running or was recently attempted. Retry after a minute.",
      };
    const { lease } = claimed;
    try {
      const crypt = await cipher();
      const tokens: Tokens = JSON.parse(
        await crypt.open(claimed.ciphertext, user + ":tokens"),
      );
      const refreshed = await google("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: new URLSearchParams({
          client_id: env.clientId,
          client_secret: env.clientSecret,
          refresh_token: tokens.refresh_token,
          grant_type: "refresh_token",
        }),
      });
      if (typeof refreshed.access_token !== "string") throw new Reconnect();
      if (
        refreshed.scope &&
        !(refreshed.scope as string).split(" ").includes(GMAIL_SCOPE)
      )
        throw new Reconnect();
      if (refreshed.refresh_token)
        tokens.refresh_token = refreshed.refresh_token;
      // Persist any provider refresh-token rotation before processing receipts.
      await service("token", user, {
        lease,
        ciphertext: await crypt.seal(JSON.stringify(tokens), user + ":tokens"),
      });
      const cutoff = now();
      const window = tokens.paging ?? {
        after: Math.floor(
          (claimed.last_synced_at
            ? new Date(claimed.last_synced_at).getTime() - 48 * 3600_000
            : cutoff.getTime() - 30 * 86400_000) / 1000,
        ),
        before: Math.floor(cutoff.getTime() / 1000) + 1,
        pageToken: "",
        cursor: cutoff.toISOString(),
      };
      const params = new URLSearchParams({
        q: `${MERCHANT_QUERY} after:${window.after} before:${window.before}`,
        maxResults: "20",
      });
      if (window.pageToken) params.set("pageToken", window.pageToken);
      const auth = { Authorization: `Bearer ${refreshed.access_token}` };
      const list = await google(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages?" + params,
        { headers: auth },
      );
      const ids = ((list.messages ?? []) as { id: string }[])
        .slice(0, 20)
        .map((m) => m.id)
        .filter((id) => /^[a-f0-9]{1,40}$/i.test(id));
      const rows = [];
      // Bounded concurrency; a partial failure retains the checkpoint and safely repeats this page.
      for (let i = 0; i < ids.length; i += 5) {
        const messages: (GmailMessage | null)[] = await Promise.all(
          ids.slice(i, i + 5).map((id) =>
            google(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
              { headers: auth },
            ).catch((error) => {
              if (error instanceof OversizedMessage) return null;
              throw error;
            }),
          ),
        );
        for (const message of messages) {
          const row = message && parseReceipt(message);
          if (row) rows.push(row);
        }
      }
      await service("ingest", user, { lease, rows });
      const hasMore =
        typeof list.nextPageToken === "string" && !!list.nextPageToken;
      tokens.paging = hasMore
        ? { ...window, pageToken: list.nextPageToken }
        : undefined;
      await service("token", user, {
        lease,
        ciphertext: await crypt.seal(JSON.stringify(tokens), user + ":tokens"),
      });
      await service("finish", user, {
        lease,
        status: "connected",
        cursor: hasMore ? claimed.last_synced_at : window.cursor,
        has_more: hasMore,
      });
      return { status: "ok", candidates: rows.length, has_more: hasMore };
    } catch (error) {
      // Never send provider bodies, mailbox text, codes or credentials to logs/client.
      await service("finish", user, {
        lease,
        status: error instanceof Reconnect ? "reconnect_required" : "error",
        cursor: claimed.last_synced_at,
      });
      return {
        status: error instanceof Reconnect ? "reconnect_required" : "error",
      };
    }
  }
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    try {
      if (url.pathname.endsWith("/callback")) {
        if (req.method !== "GET")
          return json({ error: "Method not allowed." }, 405);
        const state = url.searchParams.get("state");
        if (!state || state.length > 200) return redirect("failed");
        const saved = (await service("consume_state", null, {
          hash: await sha256(state),
        })) as { user_id: string; generation: string; verifier: string } | null;
        if (
          !saved ||
          url.searchParams.has("error") ||
          !url.searchParams.get("code")
        )
          return redirect("failed");
        const crypt = await cipher();
        const verifier = await crypt.open(
          saved.verifier,
          saved.user_id + ":pkce",
        );
        const tokens = await google("https://oauth2.googleapis.com/token", {
          method: "POST",
          body: new URLSearchParams({
            client_id: env.clientId,
            client_secret: env.clientSecret,
            code: url.searchParams.get("code")!,
            code_verifier: verifier,
            grant_type: "authorization_code",
            redirect_uri: callback,
          }),
        });
        if (
          typeof tokens.refresh_token !== "string" ||
          typeof tokens.access_token !== "string" ||
          typeof tokens.scope !== "string" ||
          !tokens.scope.split(" ").includes(GMAIL_SCOPE)
        )
          return redirect("failed");
        const profile = await google(
          "https://gmail.googleapis.com/gmail/v1/users/me/profile",
          { headers: { Authorization: `Bearer ${tokens.access_token}` } },
        );
        await service("connect", saved.user_id, {
          generation: saved.generation,
          mailbox: profile.emailAddress,
          ciphertext: await crypt.seal(
            JSON.stringify({ refresh_token: tokens.refresh_token }),
            saved.user_id + ":tokens",
          ),
        });
        return redirect("connected");
      }
      if (req.method !== "POST")
        return json({ error: "Method not allowed." }, 405);
      if (req.headers.get("Origin") && req.headers.get("Origin") !== origin)
        return json({ error: "Origin unavailable." }, 403);
      if (Number(req.headers.get("Content-Length") ?? 0) > 2048)
        return json({ error: "Request too large." }, 413);
      const reader = req.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader)
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 2048) {
            await reader.cancel();
            return json({ error: "Request too large." }, 413);
          }
          chunks.push(value);
        }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const raw = new TextDecoder().decode(bytes);
      const body = JSON.parse(raw) as { action?: string };
      const bearer =
        req.headers.get("Authorization")?.replace(/^Bearer /i, "") ?? "";
      if (body.action === "scheduled") {
        // A random scheduler secret is separate from user JWTs and never shipped to the app.
        if (
          !env.schedulerSecret ||
          (await sha256(bearer)) !== (await sha256(env.schedulerSecret))
        )
          return json({ error: "Unauthorized." }, 401);
        const users = (await service("due", null)) as string[];
        // One invocation handles one owner; order/fairness comes from oldest last_attempt_at.
        const results = [];
        for (const user of users.slice(0, 1)) results.push(await sync(user));
        return json({ processed: results.length });
      }
      const user = bearer && (await deps.owner(bearer));
      if (!user)
        return json({ error: "Sign in with a verified account." }, 401);
      if (body.action === "connect") {
        const state = randomSecret(),
          verifier = randomSecret();
        await service("start", user, {
          hash: await sha256(state),
          verifier: await (await cipher()).seal(verifier, user + ":pkce"),
        });
        const params = new URLSearchParams({
          client_id: env.clientId,
          redirect_uri: callback,
          response_type: "code",
          scope: GMAIL_SCOPE,
          access_type: "offline",
          prompt: "consent",
          state,
          code_challenge: await sha256(verifier),
          code_challenge_method: "S256",
        });
        return json({
          url: "https://accounts.google.com/o/oauth2/v2/auth?" + params,
        });
      }
      if (body.action === "sync") return json(await sync(user));
      if (body.action === "disconnect") {
        await service("disconnect", user);
        return json({ disconnected: true });
      }
      if (body.action === "forget") {
        await service("forget", user);
        return json({ forgotten: true });
      }
      return json({ error: "Unknown action." }, 400);
    } catch {
      return url.pathname.endsWith("/callback")
        ? redirect("failed")
        : json(
            {
              error:
                "Gmail is unavailable. Check server configuration or retry later.",
            },
            503,
          );
    }
  };
}
