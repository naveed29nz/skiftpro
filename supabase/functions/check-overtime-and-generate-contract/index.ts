import { adminClient, handleOptions, json, requireUser } from "../_shared/auth.ts";

// Port of base44/functions/checkOvertimeAndGenerateContract.
// The shift trigger calls the same SQL function on insert/update. This HTTP
// entry point remains so the app (or a manual replay) can invoke it.

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
