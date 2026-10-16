import { adminClient, handleOptions, json, requireUser } from "../_shared/auth.ts";
import { buildSnapshotPdf, bytesToBase64, sha256Hex } from "../_shared/contractPdf.ts";
import { sendEmail } from "../_shared/email.ts";
import { resolveProvider } from "../_shared/signing/index.ts";

function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return req.headers.get("cf-connecting-ip");
}

function roleOf(value: unknown): "ansatt" | "arbeidsgiver" {
  return value === "arbeidsgiver" ? "arbeidsgiver" : "ansatt";
}

async function archiveSignedPdf(contractId: string) {
  const admin = adminClient();
  const { data: contract, error } = await admin
    .from("contracts")
    .select("id, org_id, worker_id, worker_name, org_name, template_key, template_version, body_snapshot, content_sha256, employee_signed_at, employee_signed_by, employer_signed_at, employer_signed_by, status, pdf_path")
    .eq("id", contractId)
    .maybeSingle();
  if (error || !contract || contract.status !== "signert" || contract.pdf_path) return;
  if (!contract.body_snapshot) return;

  const { data: events } = await admin
    .from("contract_events")
    .select("event_type, actor_id, actor_role, ip, user_agent, created_at")
    .eq("contract_id", contractId)
    .order("created_at", { ascending: true });

  const { data: employerSettings } = await admin
    .from("employer_settings")
    .select("selskap")
    .eq("org_id", contract.org_id)
    .maybeSingle();
  const { data: organization } = await admin
    .from("organizations")
    .select("name")
    .eq("id", contract.org_id)
    .maybeSingle();
  const employerName = String(employerSettings?.selskap || "").trim()
    || String(organization?.name || "").trim()
    || contract.org_name
    || null;

  const bytes = buildSnapshotPdf({
    id: contract.id,
    body: contract.body_snapshot,
    templateKey: contract.template_key,
    templateVersion: contract.template_version,
    contentSha256: contract.content_sha256,
    workerName: contract.worker_name,
    orgName: contract.org_name,
    employeeSignedAt: contract.employee_signed_at,
    employeeSignedBy: contract.employee_signed_by,
    employerSignedAt: contract.employer_signed_at,
    employerSignedBy: contract.employer_signed_by,
    employerName,
    events: events || [],
  });
  const pdfSha = await sha256Hex(bytes);
  const path = `${contract.org_id}/${contract.worker_id}/${contract.id}.pdf`;
  const uploaded = await admin.storage.from("contracts").upload(path, bytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (uploaded.error) {
    console.error("contract pdf upload", uploaded.error.message);
    return;
  }
  const { error: updateError } = await admin
    .from("contracts")
    .update({ pdf_path: path, pdf_sha256: pdfSha })
    .eq("id", contract.id);
  if (updateError) console.error("contract pdf columns", updateError.message);

  const { data: worker } = await admin
    .from("workers")
    .select("email, name")
    .eq("id", contract.worker_id)
    .maybeSingle();
  await sendEmail({
    to: worker?.email,
    subject: "Signert arbeidsavtale",
    text: `Hei ${worker?.name || ""}. Avtalen er signert av begge parter. PDF-kopien ligger vedlagt. Dokument ${contract.id}. SHA-256 av PDF-filen: ${pdfSha}.`,
    attachments: [{ filename: `arbeidsavtale-${contract.id}.pdf`, content: bytesToBase64(bytes) }],
  });
}

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
    if (!contractId || !action) return json({ error: "Mangler contract_id eller action" }, 400);

    if (action === "open") {
      const { data, error } = await auth.client.rpc("open_contract", { p_contract_id: contractId });
      if (error) return json({ error: error.message }, 403);
      const doc = await auth.client.rpc("contract_document", { p_id: contractId });
      return json({ ...(data || {}), document: doc.data || null });
    }

    if (action === "request_otp") {
      const role = roleOf(body.role);
      const ctx = await auth.client.rpc("contract_sign_context", {
        p_contract_id: contractId,
        p_role: role,
      });
      if (ctx.error) return json({ error: ctx.error.message }, 400);
      if (!ctx.data?.ok) return json({ error: ctx.data?.error || "Ikke tillatt" }, 403);

      const { data: settings } = await auth.client
        .from("employer_settings")
        .select("signing_provider")
        .eq("org_id", ctx.data.org_id)
        .maybeSingle();
      const provider = resolveProvider(settings?.signing_provider);
      if (!provider.active) return json({ error: provider.inactiveMessage }, 501);

      const admin = adminClient();
      const issued = await admin.rpc("issue_contract_otp", {
        p_user_id: auth.user.id,
        p_contract_id: contractId,
        p_role: role,
        p_ip: clientIp(req),
        p_user_agent: req.headers.get("user-agent"),
      });
      if (issued.error) return json({ error: issued.error.message }, 500);
      const code = String(issued.data || "");
      const mailed = await sendEmail({
        to: ctx.data.email,
        subject: "Engangskode for signering i SkiftPro",
        text: `Koden din er ${code}. Den er gyldig i 10 minutter og kan brukes fem ganger.`,
      });
      const dev = Deno.env.get("SIGNING_DEV_OTP") === "true";
      return json({
        ok: true,
        sent: mailed.sent,
        email: ctx.data.email,
        ...(dev ? { dev_code: code } : {}),
      });
    }

    if (action === "verify") {
      const role = roleOf(body.role);
      const { data, error } = await auth.client.rpc("complete_contract_signature", {
        p_contract_id: contractId,
        p_role: role,
        p_code: String(body.code || "").trim(),
        p_ip: clientIp(req),
        p_user_agent: req.headers.get("user-agent"),
      });
      if (error) return json({ error: error.message }, 400);
      if (data?.status === "signert") {
        await archiveSignedPdf(contractId);
      }
      return json(data);
    }

    if (action === "reject") {
      const { data, error } = await auth.client.rpc("reject_contract", {
        p_contract_id: contractId,
        p_reason: body.reason || "",
      });
      if (error) return json({ error: error.message }, 403);
      if (data && data.ok === false) return json({ error: data.error || "Kunne ikke avvise" }, 400);
      return json(data);
    }

    return json({ error: "Ukjent handling" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Ukjent feil" }, 500);
  }
});
