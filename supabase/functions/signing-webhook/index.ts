import { handleOptions, json } from "../_shared/auth.ts";
import { NOT_ACTIVATED } from "../_shared/signing/provider.ts";

// Idura and Signicat are not activated. The endpoint refuses the body so a
// webhook cannot mark a contract signed before a provider agreement exists.

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  await req.text().catch(() => "");
  return json({ error: NOT_ACTIVATED }, 501);
});
