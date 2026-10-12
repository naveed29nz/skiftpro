import { adminClient, handleOptions, json, requireUser } from "../_shared/auth.ts";

// Manual entry point for the daily job. pg_cron calls public.generate_recurring_tasks()
// directly at 04:00 UTC. This function is the same work, restricted to platform/org admins.

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    if (auth.profile.role !== "admin") return json({ error: "Forbidden" }, 403);

    const admin = adminClient();
    const { data, error } = await admin.rpc("generate_recurring_tasks");
    if (error) return json({ error: error.message }, 500);
    return json(data ?? { ok: true, created: 0 });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
