import { adminClient, handleOptions, json, requireUser } from "../_shared/auth.ts";
import { sendPendingNotifications } from "../_shared/push.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ error: "Metode ikke tillatt" }, 405);

  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (token !== service) {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const { data: allowed } = await auth.client.rpc("can_assign_roles");
    if (!allowed) return json({ error: "Ikke tillatt" }, 403);
  }

  try {
    const admin = adminClient();
    const { data, error } = await admin.rpc("enqueue_clock_in_reminders");
    if (error) return json({ error: error.message }, 500);
    const sent = await sendPendingNotifications();
    return json({ queued: data ?? 0, ...sent });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Ukjent feil" }, 500);
  }
});
