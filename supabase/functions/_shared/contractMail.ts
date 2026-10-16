import { adminClient } from "./auth.ts";
import {
  CONTRACT_EMAILS,
  formatNorwegianDate,
  renderContractEmail,
  signedCopyRecipient,
  signingLink,
} from "./contractEmails.js";
import { sendEmail } from "./email.ts";

type RpcResult = { data: any; error: { message: string } | null };

type RpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<RpcResult>;
};

function messageOf(row: { navn?: string; selskap?: string; lenke?: string; frist?: string; dokument?: string; sha?: string; kode?: string }, kind: "signingInvite" | "reminder" | "signedEmployee" | "signedEmployer" | "otp") {
  const template = CONTRACT_EMAILS[kind];
  return {
    subject: renderContractEmail(template.subject, row),
    text: renderContractEmail(template.body, row),
  };
}

export function otpMessage(code: string) {
  return messageOf({ kode: code }, "otp");
}

export function signedEmployeeMessage(row: { navn: string; selskap: string; dokument: string; sha: string }) {
  return messageOf(row, "signedEmployee");
}

export function signedEmployerMessage(row: { navn: string; selskap: string; dokument: string; sha: string }) {
  return messageOf(row, "signedEmployer");
}

export { signedCopyRecipient };

/**
 * Emails the employee a signing link after an admin has already sent the
 * contract. Idempotent: a second call does not send again. A failed send
 * releases the claim so a later try can send. Does not email old rows.
 */
export async function sendSigningInvite(userClient: RpcClient, contractId: string) {
  if (!contractId) return { ok: false, sent: false, error: "Mangler contract_id", status: 400 };

  const guard = await userClient.rpc("contract_sender_context", { p_contract_id: contractId });
  if (guard.error) return { ok: false, sent: false, error: guard.error.message, status: 403 };
  if (!guard.data?.ok) {
    return { ok: false, sent: false, error: guard.data?.error || "Ikke tillatt", status: 403 };
  }

  const admin = adminClient();
  const prepared = await admin.rpc("prepare_contract_signing_mail", { p_contract_id: contractId });
  if (prepared.error) return { ok: false, sent: false, error: prepared.error.message, status: 500 };
  const row = prepared.data || {};
  if (!row.ok) return { ok: false, sent: false, error: row.error || "Kunne ikke sende", status: 400 };
  if (row.already_sent) return { ok: true, sent: false, already_sent: true };

  const mail = messageOf({
    navn: row.navn || "",
    selskap: row.selskap || "",
    lenke: signingLink(row.id, row.token),
    frist: formatNorwegianDate(row.frist),
  }, "signingInvite");
  const mailed = await sendEmail({ to: row.email, subject: mail.subject, text: mail.text });
  if (!mailed.sent) {
    await admin.rpc("release_contract_signing_mail", {
      p_contract_id: contractId,
      p_claim: row.claim,
    });
    return { ok: false, sent: false, error: "E-posten ble ikke sendt", status: 502 };
  }
  return { ok: true, sent: true, already_sent: false };
}

/** Reminder mail only when the SQL row says a signing email was already sent. */
export async function sendContractReminder(row: {
  contract_id?: string;
  email?: string | null;
  email_allowed?: boolean;
  kind?: string;
  status?: string;
  worker_name?: string;
  selskap?: string;
  expires_at?: string;
}) {
  if (row?.email_allowed !== true || !row?.email || row.kind === "expired" || row.status === "signert_ansatt") {
    return { sent: false, skipped: true };
  }
  const admin = adminClient();
  const created = await admin.rpc("create_contract_access_token", { p_contract_id: row.contract_id });
  if (created.error || !created.data?.ok || !created.data?.token) {
    return { sent: false, skipped: true };
  }
  const mail = messageOf({
    navn: created.data.navn || row.worker_name || "",
    selskap: created.data.selskap || row.selskap || "",
    lenke: signingLink(row.contract_id, created.data.token),
    frist: formatNorwegianDate(created.data.frist || row.expires_at),
  }, "reminder");
  return sendEmail({ to: row.email, subject: mail.subject, text: mail.text });
}
