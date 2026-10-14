import { adminClient } from "./auth.ts";

type OutboxRow = {
  id: string;
  user_id: string | null;
  title: string;
  body: string;
};

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string | null;
  auth: string | null;
};

export function pushConfigured(): boolean {
  return Boolean(Deno.env.get("VAPID_PUBLIC_KEY") && Deno.env.get("VAPID_PRIVATE_KEY"));
}

export async function sendPendingNotifications(): Promise<{ enabled: boolean; sent: number }> {
  if (!pushConfigured()) return { enabled: false, sent: 0 };

  const webpush = (await import("npm:web-push@3.6.7")).default;
  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") || "mailto:post@zastek.no",
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!,
  );

  const admin = adminClient();
  const { data: rows, error } = await admin
    .from("notification_outbox")
    .select("id, user_id, title, body")
    .is("sent_at", null)
    .order("created_date", { ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);

  let sent = 0;
  for (const row of (rows || []) as OutboxRow[]) {
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", row.user_id || "");

    for (const sub of (subs || []) as SubscriptionRow[]) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh || "", auth: sub.auth || "" },
          },
          JSON.stringify({ title: row.title, body: row.body, url: "/WorkerPortal" }),
        );
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    }

    await admin.from("notification_outbox").update({ sent_at: new Date().toISOString() }).eq("id", row.id);
  }

  return { enabled: true, sent };
}
