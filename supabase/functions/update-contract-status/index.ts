import { adminClient, handleOptions, json, requireUser } from "../_shared/auth.ts";

// Port of base44/functions/updateContractStatus.
// Workers may approve or reject their own contract. Managers of the org may send it.

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

    const admin = adminClient();
    const { data: contract, error } = await admin
      .from("contracts")
      .select("id, org_id, worker_id, created_by, status")
      .eq("id", contractId)
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!contract) return json({ error: "Contract not found" }, 404);

    const [{ data: superAdmin }, { data: manager }, { data: inOrg }, { data: ownsWorker }] = await Promise.all([
      auth.client.rpc("is_super_admin"),
      auth.client.rpc("is_manager"),
      auth.client.rpc("in_org", { org: contract.org_id }),
      auth.client.rpc("worker_matches", { worker: contract.worker_id }),
    ]);

    const managerOfOrg = Boolean(superAdmin) || (Boolean(manager) && Boolean(inOrg));
    const isParty = Boolean(ownsWorker) || contract.created_by === auth.user.id;

    if (action === "send") {
      if (!managerOfOrg) return json({ error: "Forbidden" }, 403);
      const { error: updateError } = await admin.from("contracts").update({ status: "sendt" }).eq("id", contractId);
      if (updateError) return json({ error: updateError.message }, 500);
      return json({ status: "sent", contract_id: contractId });
    }

    if (action === "approve" || action === "reject") {
      if (!managerOfOrg && !isParty) return json({ error: "Forbidden" }, 403);
      if (action === "approve") {
        const { error: updateError } = await admin.from("contracts").update({
          status: "godkjent",
          approved_by_worker_id: auth.user.id,
          approved_at: new Date().toISOString(),
        }).eq("id", contractId);
        if (updateError) return json({ error: updateError.message }, 500);
        return json({ status: "approved", contract_id: contractId });
      }
      const { error: updateError } = await admin.from("contracts").update({ status: "avvist" }).eq("id", contractId);
      if (updateError) return json({ error: updateError.message }, 500);
      return json({ status: "rejected", contract_id: contractId });
    }

    return json({ error: "Invalid action. Use: approve, reject, send" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
