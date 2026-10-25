import { adminClient, handleOptions, json, requireUser } from "../_shared/auth.ts";

// Calls check_overtime_for_shift. The shift trigger uses the same SQL.
// The period comes from employer_settings.ekstratimer_periode (default
// maaned). A monthly agreement is one utkast for the calendar month and is
// not sent. This HTTP entry point remains for a manual replay.

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    const body = await req.json().catch(() => ({}));
    const shiftData = body.data ?? body;
    if (!shiftData?.worker_id || !shiftData?.date) {
      return json({ status: "skipped", reason: "no shift data" });
    }

    const admin = adminClient();
    const { data, error } = await admin.rpc("check_overtime_for_shift", {
      p_worker_id: shiftData.worker_id,
      p_date: shiftData.date,
    });
    if (error) return json({ error: error.message }, 500);
    return json(data ?? { status: "skipped" });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
