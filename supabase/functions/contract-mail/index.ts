import { handleOptions, json, requireUser } from "../_shared/auth.ts";
import { sendSigningInvite } from "../_shared/contractMail.ts";

// Sends the signing link after an admin has sent the contract.
// Does not send on deploy, and does not send a second time.

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const body = await req.json().catch(() => ({}));
    const contractId = String(body.contract_id || "");
    const result = await sendSigningInvite(auth.client, contractId);
    const status = result.ok ? 200 : (result.status || 400);
    return json({
      ok: result.ok,
      sent: result.sent,
      already_sent: Boolean(result.already_sent),
      error: result.error,
    }, status);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Ukjent feil" }, 500);
  }
});
