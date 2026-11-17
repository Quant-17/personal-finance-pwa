export type ClientConfiguration = {
  mode: "demo" | "private";
  url?: string;
  key?: string;
};
export function validateClientConfiguration(value: ClientConfiguration) {
  if (value.mode === "demo") return null;
  if (!value.url || !value.key)
    return "Private workspace configuration is missing. Set the Supabase project URL and publishable key.";
  try {
    const url = new URL(value.url);
    if (
      url.username ||
      url.password ||
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname)
        ))
    )
      return "Use an HTTPS Supabase project URL.";
    if (url.pathname !== "/" || url.search || url.hash)
      return "Use the project origin, without an API path.";
  } catch {
    return "The Supabase project URL is invalid.";
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(value.key))
    return "Use a modern Supabase publishable key. Secret, service-role and legacy keys are not accepted.";
  return null;
}
