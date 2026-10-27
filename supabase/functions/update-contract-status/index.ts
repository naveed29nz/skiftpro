import { adminClient, handleOptions, json, requireUser } from "../_shared/auth.ts";
import { sendSigningInvite } from "../_shared/contractMail.ts";
import { signingEnv } from "../_shared/posten/env.ts";
import { resolveSigningChoice, shouldSendViaPosten } from "../_shared/posten/routing.js";

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
      const posten = await postenSendRoute(auth.client, contractId);
      if (shouldSendViaPosten(posten)) {
        return await sendViaPosten(auth, contractId);
      }
      const { data, error } = await auth.client.rpc("send_contract", { p_contract_id: contractId });
      if (error) {
        const status = /bare admin/i.test(error.message) ? 403 : 400;
        return json({ error: error.message }, status);
      }
      if (data && data.ok === false) return json({ error: data.error || "Kunne ikke sende" }, 400);
      const mailed = await sendSigningInvite(auth.client, contractId);
      return json({
        status: "sent",
        contract_id: contractId,
        emailed: Boolean(mailed.sent),
        already_sent: Boolean(mailed.already_sent),
        email_error: mailed.ok ? undefined : (mailed.error || "E-posten ble ikke sendt"),
      });
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

async function postenSendRoute(client: { from: (table: string) => any }, contractId: string) {
  try {
    const contract = await client.from("contracts").select("org_id").eq("id", contractId).maybeSingle();
    if (contract.error || !contract.data?.org_id) return { name: "simple_otp" as const, active: true };
    const settings = await client.from("employer_settings").select("signing_provider").eq("org_id", contract.data.org_id).maybeSingle();
    if (settings.error) return { name: "simple_otp" as const, active: true };
    return resolveSigningChoice(settings.data?.signing_provider, signingEnv());
  } catch {
    return { name: "simple_otp" as const, active: true };
  }
}

async function sendViaPosten(auth: { client: { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data?: any; error?: { message: string } }> } }, contractId: string) {
  const { cancelPortalJob, createPortalJob } = await import("../_shared/posten/client.js");
  const { prepareEmploymentJob } = await import("../_shared/posten/parties.js");
  const { buildSnapshotPdf } = await import("../_shared/contractPdf.ts");
  const { loadPostenMaterial, mtlsFetch } = await import("../_shared/posten/transport.ts");
  await import("npm:jspdf@4.0.0");
  const gate = await auth.client.rpc("assert_contract_sendable", { p_contract_id: contractId });
  if (gate.error) {
    const status = /bare admin/i.test(gate.error.message) ? 403 : 400;
    return json({ error: gate.error.message }, status);
  }
  if (gate.data?.ok === false) return json({ error: gate.data.error || "Kunne ikke sende" }, 400);

  let loaded;
  try {
    loaded = loadPostenMaterial();
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Virksomhetssertifikatet kunne ikke leses" }, 500);
  }
  if (!loaded) return json({ error: "Posten Signering er ikke konfigurert." }, 501);

  const admin = adminClient();
  const parties = await admin.rpc("posten_signing_parties", { p_contract_id: contractId });
  if (parties.error) return json({ error: parties.error.message }, 500);
  if (!parties.data?.ok) return json({ error: parties.data?.error || "Kunne ikke lese avtalen" }, 400);

  let prepared;
  try {
    prepared = prepareEmploymentJob(parties.data);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Ugyldig signeringsoppdrag" }, 400);
  }

  const pdf = await buildSnapshotPdf({
    id: contractId,
    body: parties.data.body_snapshot,
    workerName: parties.data.worker_name,
    orgName: parties.data.org_name,
  });
  const fetchImpl = mtlsFetch(loaded.material);
  let created;
  try {
    created = await createPortalJob({
      fetchImpl,
      environment: loaded.environment,
      senderOrg: prepared.senderOrg,
      signers: prepared.signers,
      pdfBytes: pdf,
      reference: prepared.reference,
      availableSeconds: prepared.availableSeconds,
      material: loaded.material,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Posten avslo oppdraget" }, 502);
  }

  const marked = await admin.rpc("mark_posten_job_sent", {
    p_contract_id: contractId,
    p_job_id: created.jobId,
    p_sender_org: prepared.senderOrg,
    p_environment: loaded.environment,
    p_signer_status: prepared.signerStatus,
  });
  if (marked.error || marked.data?.ok === false) {
    try {
      await cancelPortalJob({
        fetchImpl,
        environment: loaded.environment,
        cancellationUrl: created.cancellationUrl,
      });
    } catch (cancelError) {
      console.error(JSON.stringify({
        msg: "posten_cancel_failed",
        contract_id: contractId,
        job_id: created.jobId,
        error: cancelError instanceof Error ? cancelError.message : "cancel",
      }));
    }
    return json({ error: marked.error?.message || marked.data?.error || "Kunne ikke lagre oppdraget" }, 500);
  }
  console.log(JSON.stringify({ msg: "posten_job_created", contract_id: contractId, job_id: created.jobId }));
  return json({
    status: "sent",
    contract_id: contractId,
    provider: "posten",
    posten_job_id: created.jobId,
  });
}
