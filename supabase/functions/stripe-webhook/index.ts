import { adminClient, handleOptions, json } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ error: "Metode ikke tillatt" }, 405);

  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secret || !key) return json({ enabled: false }, 503);

  const Stripe = (await import("npm:stripe@17.7.0")).default;
  const stripe = new Stripe(key, { apiVersion: "2024-12-18.acacia" });
  const raw = await req.text();
  const signature = req.headers.get("stripe-signature") || "";

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature, secret);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Ugyldig signatur" }, 400);
  }

  const admin = adminClient();

  const applySubscription = async (orgId: string | null, subscription: {
    id?: string;
    customer?: string;
    status?: string;
    trial_end?: number | null;
  }) => {
    if (!orgId) return;
    await admin.from("organizations").update({
      stripe_customer_id: typeof subscription.customer === "string" ? subscription.customer : undefined,
      stripe_subscription_id: subscription.id || null,
      subscription_status: subscription.status || null,
      trial_ends_at: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
      status: subscription.status === "canceled" ? "inactive" : "active",
    }).eq("id", orgId);
  };

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as { metadata?: { org_id?: string }; client_reference_id?: string; subscription?: string; customer?: string };
    const orgId = session.metadata?.org_id || session.client_reference_id || null;
    if (orgId && session.subscription) {
      const subscription = await stripe.subscriptions.retrieve(String(session.subscription));
      await applySubscription(orgId, subscription);
    } else if (orgId && session.customer) {
      await admin.from("organizations").update({ stripe_customer_id: String(session.customer) }).eq("id", orgId);
    }
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as { id: string; customer: string; status: string; trial_end: number | null; metadata?: { org_id?: string } };
    let orgId = subscription.metadata?.org_id || null;
    if (!orgId) {
      const { data } = await admin
        .from("organizations")
        .select("id")
        .eq("stripe_customer_id", subscription.customer)
        .maybeSingle();
      orgId = data?.id || null;
    }
    await applySubscription(orgId, subscription);
  }

  return json({ received: true });
});
