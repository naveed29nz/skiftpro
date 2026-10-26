import { adminClient, handleOptions, json } from "../_shared/auth.ts";
import { sha256Hex } from "../_shared/contractPdf.ts";
import { confirmStatus, ingestStatusChange, pollOnce } from "../_shared/posten/client.js";
import { signersForStatusMatch } from "../_shared/posten/parties.js";
import { contractFieldsFromChange } from "../_shared/posten/status.js";
import { loadPostenMaterial, mtlsFetch } from "../_shared/posten/transport.ts";

const JOB_STATUSES = new Set(["IN_PROGRESS", "COMPLETED_SUCCESSFULLY", "FAILED"]);

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!service || token !== service) return json({ error: "Ikke tillatt" }, 403);

  const loaded = loadPostenMaterial();
  if (!loaded) return json({ skipped: true, reason: "not_configured", changes: 0 });

  try {
    const admin = adminClient();
    const open = await admin
      .from("contracts")
      .select("id, org_id, worker_id, posten_job_id, posten_sender_org")
      .eq("posten_status", "IN_PROGRESS")
      .eq("posten_environment", loaded.environment);
    if (open.error) return json({ error: open.error.message }, 500);

    const bySender = new Map<string, Array<{ id: string; org_id: string; worker_id: string; posten_job_id: string }>>();
    for (const row of open.data || []) {
      if (!row.posten_sender_org || !row.posten_job_id) continue;
      const list = bySender.get(row.posten_sender_org) || [];
      list.push(row);
      bySender.set(row.posten_sender_org, list);
    }

    const fetchImpl = mtlsFetch(loaded.material);
    let changes = 0;
    let stored = 0;
    const errors: string[] = [];

    for (const [senderOrg, jobs] of bySender) {
      const state = await admin
        .from("posten_poll_state")
        .select("next_permitted_poll_at")
        .eq("sender_org", senderOrg)
        .eq("environment", loaded.environment)
        .maybeSingle();
      const nextAt = state.data?.next_permitted_poll_at;
      if (nextAt && new Date(nextAt).getTime() > Date.now()) continue;

      for (let attempt = 0; attempt < 20; attempt += 1) {
        let polled;
        try {
          polled = await pollOnce({ fetchImpl, environment: loaded.environment, senderOrg });
        } catch (error) {
          errors.push(error instanceof Error ? error.message : "poll");
          break;
        }
        if (polled.nextPermittedPollAt) {
          await admin.rpc("touch_posten_poll_state", {
            p_sender_org: senderOrg,
            p_environment: loaded.environment,
            p_next: polled.nextPermittedPollAt,
          });
        }
        if (polled.kind !== "change") break;
        changes += 1;
        const job = jobs.find((row) => row.posten_job_id === polled.jobId);
        try {
          if (!job) {
            console.error(JSON.stringify({ msg: "posten_unknown_job", job_id: polled.jobId, sender_org: senderOrg }));
            if (polled.confirmationUrl) {
              await confirmStatus({
                fetchImpl,
                environment: loaded.environment,
                confirmationUrl: polled.confirmationUrl,
              });
            }
            continue;
          }
          const parties = await admin.rpc("posten_signing_parties", { p_contract_id: job.id });
          if (parties.error || parties.data?.ok === false) {
            throw new Error(parties.error?.message || parties.data?.error || "kunne ikke lese avtalen");
          }
          const fields = contractFieldsFromChange(polled, signersForStatusMatch(parties.data));
          if (!JOB_STATUSES.has(fields.postenStatus)) fields.postenStatus = "IN_PROGRESS";
          const ingested = await ingestStatusChange({
            change: polled,
            environment: loaded.environment,
            fetchImpl,
            persist: async ({ pades }) => {
              let path: string | null = null;
              let sha: string | null = null;
              if (pades) {
                path = `${job.org_id}/${job.worker_id}/${job.id}.pdf`;
                sha = await sha256Hex(pades);
                const uploaded = await admin.storage.from("contracts").upload(path, pades, {
                  contentType: "application/pdf",
                  upsert: true,
                });
                if (uploaded.error) throw new Error(uploaded.error.message);
              }
              const recorded = await admin.rpc("record_posten_status", {
                p_contract_id: job.id,
                p_posten_status: fields.postenStatus,
                p_contract_status: fields.contractStatus,
                p_signer_status: fields.signerStatus,
                p_employee_signed_at: fields.employeeSignedAt || null,
                p_employer_signed_at: fields.employerSignedAt || null,
                p_pades_path: path,
                p_pades_sha256: sha,
              });
              if (recorded.error || recorded.data?.ok === false) {
                throw new Error(recorded.error?.message || recorded.data?.error || "kunne ikke lagre status");
              }
            },
          });
          if (ingested.padesStored) stored += 1;
        } catch (error) {
          errors.push(error instanceof Error ? error.message : "status");
          break;
        }
      }
    }

    return json({ changes, stored, errors, environment: loaded.environment });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Ukjent feil" }, 500);
  }
});
