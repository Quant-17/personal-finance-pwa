import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
const project = "https://fixture.supabase.co";
const csp = `default-src 'self'; connect-src 'self' ${project}; object-src 'none'; frame-ancestors 'none'`;
async function withHost(rootStatus, inspect) {
  const server = createServer((request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    response.setHeader("Content-Security-Policy", csp);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Cache-Control", "no-store");
    if (path === "/folio-build.json") {
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          schemaVersion: 1,
          app: "folio",
          mode: "private",
          sourceRevision: "a".repeat(40),
          dirty: false,
          supabaseOrigin: project,
        }),
      );
    } else if (path === "/" || path === "/index.html") {
      if (path === "/" && rootStatus !== 200) {
        response.writeHead(rootStatus);
        response.end("Missing root");
        return;
      }
      // Working canonical HTML hosting redirects /index.html to /.
      // The broken host deliberately serves index.html while / is absent.
      if (path === "/index.html" && rootStatus === 200) {
        response.writeHead(307, { Location: "/" });
        response.end();
        return;
      }
      response.setHeader("Content-Type", "text/html");
      response.end(
        '<div id="root"></div><script src="/assets/entry.js"></script>',
      );
    } else if (path === "/manifest.webmanifest") {
      response.setHeader("Content-Type", "application/manifest+json");
      response.end(
        JSON.stringify({
          display: "standalone",
          start_url: "/",
          description: "A private workspace",
          icons: [],
        }),
      );
    } else if (path === "/sw.js") {
      response.setHeader("Content-Type", "application/javascript");
      response.end("precacheAndRoute([]);");
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}/`;
  try {
    await inspect(origin);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
test("release preflight rejects a missing root even when index.html exists", async () => {
  await withHost(404, async (origin) => {
    await assert.rejects(
      run(process.execPath, [
        "scripts/verify-release.mjs",
        origin,
        "private",
        project,
      ]),
      (error) => {
        assert.match(error.stderr, /\/: HTTP 404/);
        return true;
      },
    );
  });
});
test("release preflight accepts the root without following the legacy index redirect", async () => {
  await withHost(200, async (origin) => {
    const result = await run(process.execPath, [
      "scripts/verify-release.mjs",
      origin,
      "private",
      project,
    ]);
    assert.match(result.stdout, /PASS: private deployment/);
  });
});
