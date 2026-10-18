export type EmailResult = {
  sent: boolean;
  status?: number;
  id?: string;
  reason?: string;
};

function readResendBody(raw: string): { id?: string; reason: string } {
  try {
    const parsed = JSON.parse(raw) as { id?: unknown; message?: unknown };
    const id = parsed?.id == null ? undefined : String(parsed.id);
    const reason = parsed?.message == null ? raw : String(parsed.message);
    return { id, reason };
  } catch {
    return { reason: raw };
  }
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
  attachments,
}: {
  to?: string | null;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: string }[];
}): Promise<EmailResult> {
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL") || "SkiftPro <noreply@skiftpro.no>";
  if (!key || !to) return { sent: false, reason: "email_not_configured" };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      html,
      attachments,
    }),
  });
  const body = readResendBody(await res.text());
  if (!res.ok) return { sent: false, status: res.status, id: body.id, reason: body.reason };
  return { sent: true, status: res.status, id: body.id };
}
