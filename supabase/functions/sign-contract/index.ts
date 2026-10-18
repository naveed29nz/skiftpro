// contractPdf.js loads jsPDF through a dynamic import whose specifier is a
// variable. The deploy bundler does not follow that, so jsPDF was left out
// of the bundle. Countersign PDF archiving then failed with HTTP 500 and
// no signed copies were sent. This static import keeps the package in.
import "npm:jspdf@4.0.0";
import { adminClient, handleOptions, json, requireUser } from "../_shared/auth.ts";
import { countersignerIdentity } from "../_shared/countersigner.ts";
import { buildSnapshotPdf, bytesToBase64, sha256Hex } from "../_shared/contractPdf.ts";
import { otpMessage, signedCopyRecipient, signedEmployeeMessage, signedEmployerMessage } from "../_shared/contractMail.ts";
import { sendEmail, type EmailResult } from "../_shared/email.ts";
import { resolveProvider } from "../_shared/signing/index.ts";

function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return req.headers.get("cf-connecting-ip");
}

function roleOf(value: unknown): "ansatt" | "arbeidsgiver" {
  return value === "arbeidsgiver" ? "arbeidsgiver" : "ansatt";
}

// Resend is not given an Idempotency-Key, and the two messages contain
// different codes, so a second call is not a deduped retry. A non-2xx
// (often 429 when two messages leave close together) used to be returned
// to the browser as success with sent:false, after the previous code had
// already been invalidated. Surface the failure instead.
function otpDeliveryError(result: EmailResult): string {
  const reason = result.reason || "";
  if (!reason || reason === "email_not_configured") {
    return "E-post er ikke satt opp. Be admin sjekke at e-postutsending virker.";
  }
  if (result.status === 429 || reason.includes("429") || /rate limit|too many requests/i.test(reason)) {
    return "E-posttjeneren tok ikke imot en ny kode nå. Bruk koden du allerede har fått, eller vent et øyeblikk.";
  }
  return "E-posten med koden kom ikke fram. Prøv igjen om litt. En kode du allerede har fått, virker fortsatt.";
}

// The phone often leaves for the mail app after the code row is stored.
// Without waitUntil the isolate is shut down with the request, so Resend
// never runs and the function logs no response. The promise is started
// and pinned before we wait for it.
function pinUntilDone(task: Promise<unknown>) {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
  if (typeof runtime?.waitUntil === "function") runtime.waitUntil(task);
}

async function deliverOtpEmail(input: {
  contractId: string;
  role: string;
  actor: string;
  to: string;
  code: string;
  ip: string | null;
  userAgent: string | null;
}): Promise<EmailResult> {
  console.log(JSON.stringify({
    msg: "otp_email_start",
    contract_id: input.contractId,
    role: input.role,
  }));
  let result: EmailResult;
  try {
    const otp = otpMessage(input.code);
    result = await sendEmail({ to: input.to, subject: otp.subject, text: otp.text });
  } catch (error) {
    result = {
      sent: false,
      status: 0,
      reason: error instanceof Error ? error.message : "send_threw",
    };
  }
  console.log(JSON.stringify({
    msg: "otp_email_result",
    contract_id: input.contractId,
    role: input.role,
    resend_status: result.status ?? null,
    resend_id: result.id ?? null,
    sent: result.sent,
    error: result.sent ? null : (result.reason || "unknown").slice(0, 500),
  }));
  if (!result.sent) {
    const admin = adminClient();
    const recorded = await admin.rpc("record_otp_email_failure", {
      p_contract_id: input.contractId,
      p_role: input.role,
      p_actor: input.actor,
      p_status: result.status ?? null,
      p_resend_id: result.id ?? null,
      p_error: (result.reason || "unknown").slice(0, 500),
      p_ip: input.ip,
      p_user_agent: input.userAgent,
    });
    if (recorded.error) console.error(JSON.stringify({ msg: "otp_epost_feilet_rpc", error: recorded.error.message }));
  }
  return result;
}

async function archiveSignedPdf(contractId: string) {
  const admin = adminClient();
  const { data: contract, error } = await admin
    .from("contracts")
    .select("id, org_id, worker_id, worker_name, org_name, template_key, template_version, body_snapshot, field_values, content_sha256, employee_signed_at, employee_signed_by, employer_signed_at, employer_signed_by, status, pdf_path")
    .eq("id", contractId)
    .maybeSingle();
  if (error || !contract || contract.status !== "signert" || contract.pdf_path) return;
  if (!contract.body_snapshot) return;

  const { data: events } = await admin
    .from("contract_events")
    .select("event_type, actor_id, actor_role, ip, user_agent, payload, created_at")
    .eq("contract_id", contractId)
    .order("created_at", { ascending: true });
  const signer = await countersignerIdentity(admin, events || [], contract.employer_signed_by);

  const fields = (contract.field_values || {}) as { selskap?: string; signatur_navn?: string };
  const { data: organization } = await admin
    .from("organizations")
    .select("name, signert_kopi_epost, admin_email, contact_email")
    .eq("id", contract.org_id)
    .maybeSingle();
  const orgName = String(fields.selskap || "").trim()
    || String(organization?.name || "").trim()
    || contract.org_name
    || "";
  const employerName = String(fields.signatur_navn || "").trim() || null;

  const bytes = await buildSnapshotPdf({
    id: contract.id,
    body: contract.body_snapshot,
    workerName: contract.worker_name,
    employeeSignedAt: contract.employee_signed_at,
    orgName: orgName || null,
    employerName: signer.name || employerName,
    employerSignedAt: contract.employer_signed_at,
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
  const workerEmail = String(worker?.email || "").trim();
  const workerName = String(worker?.name || contract.worker_name || "").trim();
  const attachment = [{ filename: `arbeidsavtale-${contract.id}.pdf`, content: bytesToBase64(bytes) }];
  const employeeMail = signedEmployeeMessage({
    navn: workerName,
    selskap: orgName,
    dokument: contract.id,
    sha: pdfSha,
  });
  await sendEmail({
    to: workerEmail,
    subject: employeeMail.subject,
    text: employeeMail.text,
    attachments: attachment,
  });
  const employerEmail = signedCopyRecipient(organization || {});
  if (employerEmail && employerEmail.toLowerCase() !== workerEmail.toLowerCase()) {
    const employerMail = signedEmployerMessage({
      navn: workerName,
      selskap: orgName,
      dokument: contract.id,
      sha: pdfSha,
    });
    await sendEmail({
      to: employerEmail,
      subject: employerMail.subject,
      text: employerMail.text,
      attachments: attachment,
    });
  }
}

async function handleGuest(req: Request, body: Record<string, unknown>) {
  const contractId = String(body.contract_id || "");
  const token = String(body.access_token || "");
  const action = String(body.action || "");
  if (!contractId || !action) return json({ error: "Mangler contract_id eller action" }, 400);
  if (body.role === "arbeidsgiver") {
    return json({ error: "Arbeidsgiver må logge inn for å motsignere" }, 403);
  }
  const admin = adminClient();
  const ip = clientIp(req);
  const userAgent = req.headers.get("user-agent");

  if (action === "open") {
    const opened = await admin.rpc("open_guest_contract", {
      p_contract_id: contractId,
      p_token: token,
      p_ip: ip,
      p_user_agent: userAgent,
    });
    if (opened.error) return json({ error: opened.error.message }, 400);
    if (opened.data?.ok === false) return json({ error: opened.data.error || "Kunne ikke åpne" }, 400);
    return json({ status: opened.data?.status, document: opened.data });
  }

  if (action === "request_otp") {
    const issued = await admin.rpc("issue_guest_contract_otp", {
      p_contract_id: contractId,
      p_token: token,
      p_ip: ip,
      p_user_agent: userAgent,
    });
    if (issued.error) return json({ error: issued.error.message }, 400);
    if (!issued.data?.ok) return json({ error: issued.data?.error || "Kunne ikke sende kode" }, 400);
    const delivery = deliverOtpEmail({
      contractId,
      role: "ansatt",
      actor: "",
      to: String(issued.data.email || ""),
      code: String(issued.data.code || ""),
      ip,
      userAgent,
    });
    pinUntilDone(delivery);
    const mailed = await delivery;
    console.log(JSON.stringify({
      msg: "otp_email_response",
      contract_id: contractId,
      http_status: mailed.sent ? 200 : 502,
      resend_status: mailed.status ?? null,
      resend_id: mailed.id ?? null,
    }));
    if (!mailed.sent) return json({ error: otpDeliveryError(mailed), sent: false }, 502);
    const dev = Deno.env.get("SIGNING_DEV_OTP") === "true";
    return json({
      ok: true,
      sent: true,
      email: issued.data.email,
      ...(dev ? { dev_code: issued.data.code } : {}),
    });
  }

  if (action === "verify") {
    const { data, error } = await admin.rpc("complete_guest_contract_signature", {
      p_contract_id: contractId,
      p_token: token,
      p_code: String(body.code || "").trim(),
      p_ip: ip,
      p_user_agent: userAgent,
    });
    if (error) return json({ error: error.message }, 400);
    if (data?.status === "signert") {
      try {
        await archiveSignedPdf(contractId);
      } catch (archiveError) {
        console.error("contract pdf archive", archiveError instanceof Error ? archiveError.message : archiveError);
      }
    }
    return json(data);
  }

  if (action === "reject") {
    const { data, error } = await admin.rpc("reject_guest_contract", {
      p_contract_id: contractId,
      p_token: token,
      p_reason: String(body.reason || ""),
      p_ip: ip,
      p_user_agent: userAgent,
    });
    if (error) return json({ error: error.message }, 400);
    if (data?.ok === false) return json({ error: data.error || "Kunne ikke avvise" }, 400);
    return json(data);
  }

  return json({ error: "Ukjent handling" }, 400);
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    if (body?.access_token) return await handleGuest(req, body);

    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
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
      const delivery = deliverOtpEmail({
        contractId: String(contractId),
        role,
        actor: auth.user.id,
        to: String(ctx.data.email || ""),
        code,
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent"),
      });
      pinUntilDone(delivery);
      const mailed = await delivery;
      console.log(JSON.stringify({
        msg: "otp_email_response",
        contract_id: contractId,
        http_status: mailed.sent ? 200 : 502,
        resend_status: mailed.status ?? null,
        resend_id: mailed.id ?? null,
      }));
      if (!mailed.sent) return json({ error: otpDeliveryError(mailed), sent: false }, 502);
      const dev = Deno.env.get("SIGNING_DEV_OTP") === "true";
      return json({
        ok: true,
        sent: true,
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
        try {
          await archiveSignedPdf(contractId);
        } catch (archiveError) {
          console.error("contract pdf archive", archiveError instanceof Error ? archiveError.message : archiveError);
        }
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
