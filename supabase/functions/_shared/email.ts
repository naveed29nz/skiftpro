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
}): Promise<{ sent: boolean; reason?: string }> {
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
  if (!res.ok) return { sent: false, reason: await res.text() };
  return { sent: true };
}
