import { adminClient, handleOptions, json } from "../_shared/auth.ts";

// Service-role only. Schedule daily if pg_cron is not available.
Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ error: "Metode ikke tillatt" }, 405);

  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "");
  if (!token || token !== (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "")) {
    return json({ error: "Ikke tillatt" }, 403);
  }

  try {
    const admin = adminClient();
    const { data, error } = await admin.rpc("purge_stamp_locations");
    if (error) return json({ error: error.message }, 500);
    return json({ purged: data ?? 0 });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Ukjent feil" }, 500);
  }
});
