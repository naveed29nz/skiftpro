import { createClient } from "npm:@supabase/supabase-js@2";
import { adminClient, handleOptions, json, requireUser } from "../_shared/auth.ts";
import { handleDemoSwitch } from "../_shared/demoSwitch.js";

// Session for a Narvesen Demo AS role, without sending email.
// generateLink (admin API) only mints a one-time token. verifyOtp consumes
// that token in this function. Do not call signInWithOtp, inviteUserByEmail,
// or the mailer — those deliver a real message.
//
// Deploy by hand when this change is approved. The pull request does not
// deploy the function:
//   supabase functions deploy demo-switch --project-ref iobsolszrmigdmdydfbe

function anonClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

Deno.serve((req) =>
  handleDemoSwitch(req, {
    handleOptions,
    json,
    requireUser,
    adminClient,
    anonClient,
  })
);
