import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const [target = "dist", expectedMode = "private", expectedProject] = process.argv.slice(2);
if (!["demo", "private"].includes(expectedMode)) throw new Error("Expected mode must be demo or private.");
const hosted = /^https?:\/\//.test(target);
const origin = hosted ? new URL(target) : null;
if (origin && origin.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(origin.hostname)) throw new Error("Production deployments must use HTTPS.");
if (origin && (origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password)) throw new Error("Pass a deployment origin without a path, credentials, query or fragment.");
if (origin && origin.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(origin.hostname)) throw new Error("Hosted deployments require HTTPS.");
async function read(path) {
  if (!origin) return { text: await readFile(resolve(target, path), "utf8"), headers: null };
  const response = await fetch(new URL(path, origin), { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return { text: await response.text(), headers: response.headers };
}
function assert(condition, message) { if (!condition) throw new Error(message); }
const info = JSON.parse((await read("folio-build.json")).text);
assert(info.schemaVersion === 1 && info.app === "folio", "Missing Folio build identity; this may be an older deployment.");
assert(info.mode === expectedMode, `Expected ${expectedMode} mode, found ${info.mode}.`);
assert(/^[a-f0-9]{40}$/.test(info.sourceRevision), "Build has no verifiable Git source revision.");
assert(!info.dirty, "Build contains uncommitted source changes. Commit and rebuild before release.");
if (expectedMode === "private") {
  assert(expectedProject, "Pass the expected Supabase HTTPS origin as the third argument for private mode.");
  assert(info.supabaseOrigin === new URL(expectedProject).origin, "Build targets a different Supabase project.");
} else assert(info.supabaseOrigin === null, "Demo build must not declare a private project.");
const index = await read("index.html");
assert(index.text.includes('id="root"') && /src="\/assets\/[^\"]+\.js"/.test(index.text), "App entry is missing.");
const manifest = JSON.parse((await read("manifest.webmanifest")).text);
assert(manifest.display === "standalone" && manifest.start_url === "/", "Manifest is not a standalone root app.");
assert(expectedMode === "private" ? manifest.description.includes("private") : manifest.description.includes("synthetic"), "Manifest mode differs from the build identity.");
const worker = await read("sw.js");
assert(worker.text.includes("precacheAndRoute") && !worker.text.includes("supabase.co"), "Service worker must precache static files without private API URLs.");
let csp;
if (hosted) {
  csp = index.headers.get("content-security-policy") ?? "";
  assert(index.headers.get("x-content-type-options") === "nosniff", "Missing nosniff header.");
  assert(index.headers.get("x-frame-options") === "DENY", "Missing frame protection.");
  assert(/no-cache|no-store/.test(worker.headers.get("cache-control") ?? ""), "Service worker must revalidate.");
  assert(/javascript/.test(worker.headers.get("content-type") ?? ""), "Service worker is not JavaScript.");
  assert(/json/.test((await read("manifest.webmanifest")).headers.get("content-type") ?? ""), "Manifest has the wrong content type.");
  assert(/no-store/.test((await read("folio-build.json")).headers.get("cache-control") ?? ""), "Build identity must not be cached.");
} else {
  csp = (await read("_headers")).text.split("Content-Security-Policy:")[1]?.split("\n")[0] ?? "";
  for (const icon of manifest.icons) assert((await stat(resolve(target, icon.src.replace(/^\//, "")))).size > 0, `Missing icon ${icon.src}`);
}
const connect = csp.split(";").map(s => s.trim()).find(s => s.startsWith("connect-src "));
const expectedConnect = "connect-src 'self'" + (expectedMode === "private" ? " " + info.supabaseOrigin : "");
assert(connect === expectedConnect, "CSP must allow only self and the expected project origin.");
assert(csp.includes("object-src 'none'") && csp.includes("frame-ancestors 'none'"), "CSP protections are missing.");
console.log(`PASS: ${expectedMode} ${hosted ? "deployment" : "artifact"}, source ${info.sourceRevision.slice(0, 7)}, manifest, shell, service worker and exact-origin CSP.`);
