import { handleOptions, json, requireUser } from "../_shared/auth.ts";

// Sending stays with an admin. The employee's signature can only be given
// by the employee, with a one-time code, in sign-contract. A manager must
// not be stored as approved_by_worker_id.

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    const body = await req.json().catch(() => ({}));
    const contractId = body.contract_id;
    const action = body.action;
    if (!contractId || !action) {
      return json({ error: "Missing contract_id or action" }, 400);
    }

    if (action === "approve") {
      return json({
        error: "Ansattens signatur kan bare avgis av den ansatte selv, med engangskode. En leder kan ikke godkjenne på vegne av den ansatte.",
      }, 403);
    }

    if (action === "send") {
      const { data, error } = await auth.client.rpc("send_contract", { p_contract_id: contractId });
      if (error) {
        const status = /bare admin/i.test(error.message) ? 403 : 400;
        return json({ error: error.message }, status);
      }
      if (data && data.ok === false) return json({ error: data.error || "Kunne ikke sende" }, 400);
      return json({ status: "sent", contract_id: contractId });
    }

    if (action === "reject") {
      const { data, error } = await auth.client.rpc("reject_contract", {
        p_contract_id: contractId,
        p_reason: body.reason || "",
      });
      if (error) {
        const status = /ansatte selv/i.test(error.message) ? 403 : 400;
        return json({ error: error.message }, status);
      }
      if (data && data.ok === false) return json({ error: data.error || "Kunne ikke avvise" }, 400);
      return json({ status: "rejected", contract_id: contractId });
    }

    return json({ error: "Invalid action. Use: send, reject. Signering skjer i sign-contract." }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
