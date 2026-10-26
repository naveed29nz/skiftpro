import { handleOptions, json, requireUser } from "../_shared/auth.ts";
import { signingEnv } from "../_shared/posten/env.ts";
import { postenPublicConfig } from "../_shared/posten/routing.js";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST" && req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  return json(postenPublicConfig(signingEnv()));
});
