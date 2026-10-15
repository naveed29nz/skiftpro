import { adminClient, handleOptions, json, requireUser } from "../_shared/auth.ts";
import { sendEmail } from "../_shared/email.ts";
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
    const { data: allowed } = await auth.client.rpc("can_read_wages");
    if (!allowed) return json({ error: "Ikke tillatt" }, 403);
  }

  try {
    const admin = adminClient();
    const { data, error } = await admin.rpc("enqueue_contract_reminders");
    if (error) return json({ error: error.message }, 500);
    const reminders = data?.reminders || [];
    let emailed = 0;
    for (const row of reminders) {
      if (!row?.email || row.kind === "expired" || row.status === "signert_ansatt") continue;
      const result = await sendEmail({
        to: row.email,
        subject: "Påminnelse: arbeidsavtale venter på signering",
        text: "Du har en arbeidsavtale i SkiftPro som venter på signering. Logg inn og åpne avtalen for å lese og signere.",
      });
      if (result.sent) emailed += 1;
    }
    const sent = await sendPendingNotifications();
    return json({ reminders: reminders.length, emailed, ...sent });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Ukjent feil" }, 500);
  }
});
