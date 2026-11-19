import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { validateClientConfiguration } from "./config";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configurationError = validateClientConfiguration({
  mode: "private",
  url,
  key,
});
export const authStorageKey =
  "folio-auth-" +
  (!configurationError && url
    ? new URL(url).hostname.split(".")[0]
    : "unconfigured");
// Capture recovery intent before SDK initialization consumes its PKCE verifier.
// This only chooses a screen; getUser() remains the authorization gate.
let recovering = false;
try {
  recovering =
    new URL(window.location.href).searchParams.has("code") &&
    Object.keys(localStorage).some(
      (storageKey) =>
        storageKey.startsWith(authStorageKey + "-") &&
        storageKey.endsWith("-code-verifier") &&
        String(JSON.parse(localStorage.getItem(storageKey) ?? "null")).endsWith(
          "/recovery",
        ),
    );
} catch {
  /* A missing/invalid verifier cannot authorize a recovery session. */
}
export const isRecovering = () => recovering;
export const finishRecovery = () => {
  recovering = false;
};
export const client = configurationError
  ? null
  : createClient<Database>(url, key, {
      auth: {
        flowType: "pkce",
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
        storageKey: authStorageKey,
      },
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    });
// Subscribe at module initialization: a fast callback can finish before React mounts.
client?.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") recovering = true;
  if (event === "SIGNED_OUT") recovering = false;
});
export function clearDeviceSession() {
  try {
    for (const storageKey of Object.keys(localStorage))
      if (
        storageKey === authStorageKey ||
        storageKey.startsWith(authStorageKey + "-")
      )
        localStorage.removeItem(storageKey);
  } catch {
    /* Device storage may be unavailable. */
  }
}
