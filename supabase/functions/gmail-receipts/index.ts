import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { createHandler } from "./handler.ts";
const required = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error("Missing server configuration: " + name);
  return value;
};
const supabaseUrl = required("SUPABASE_URL");
const schedulerSecret = required("GMAIL_SCHEDULER_SECRET");
if (schedulerSecret.length < 43)
  throw new Error("Use a random scheduler secret of at least 32 bytes.");
const admin = createClient(supabaseUrl, required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
  },
});
Deno.serve(
  createHandler({
    env: {
      appUrl: required("FOLIO_APP_URL"),
      functionUrl: supabaseUrl + "/functions/v1/gmail-receipts",
      clientId: required("GOOGLE_GMAIL_CLIENT_ID"),
      clientSecret: required("GOOGLE_GMAIL_CLIENT_SECRET"),
      encryptionKey: required("GMAIL_TOKEN_ENCRYPTION_KEY"),
      schedulerSecret,
    },
    owner: async (token) => {
      const { data, error } = await admin.auth.getUser(token);
      const u = data.user;
      return !error && u?.email_confirmed_at && !u.is_anonymous ? u.id : null;
    },
    service: async (action, user, data = {}) => {
      const { data: result, error } = await admin.rpc("gmail_service", {
        p_action: action,
        p_user: user,
        p_data: data,
      });
      if (error) throw new Error("Private Gmail operation failed.");
      return result;
    },
    fetch,
  }),
);
