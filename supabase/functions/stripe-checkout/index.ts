import { adminClient, handleOptions, json, requireUser } from "../_shared/auth.ts";
import { stripeEnabled } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ error: "Metode ikke tillatt" }, 405);

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  if (!stripeEnabled()) return json({ enabled: false, error: "Betaling er ikke aktivert" }, 503);

  const body = await req.json().catch(() => ({}));
  const orgId = String(body.org_id || "");
  if (!orgId) return json({ error: "Mangler organisasjon" }, 400);

  const { data: allowed } = await auth.client.rpc("can_assign_roles");
  const { data: inOrg } = await auth.client.rpc("in_org", { org: orgId });
  if (!allowed || !inOrg) return json({ error: "Ikke tillatt" }, 403);

  const admin = adminClient();
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .select("id, name, admin_email, stripe_customer_id")
    .eq("id", orgId)
    .maybeSingle();
  if (orgError || !org) return json({ error: "Finner ikke organisasjonen" }, 404);

  const { data: workplace } = await admin
    .from("workplace_settings")
    .select("active_teams_count")
    .eq("org_id", orgId)
    .limit(1)
    .maybeSingle();
  const quantity = Math.max(1, Number(body.quantity || workplace?.active_teams_count || 1));

  const Stripe = (await import("npm:stripe@17.7.0")).default;
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-12-18.acacia" });
  const site = (Deno.env.get("SITE_URL") || "").replace(/\/$/, "");

  let customerId = org.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: org.admin_email || auth.profile.email,
      name: org.name,
      metadata: { org_id: orgId },
    });
    customerId = customer.id;
    await admin.from("organizations").update({ stripe_customer_id: customerId }).eq("id", orgId);
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: orgId,
    line_items: [{ price: Deno.env.get("STRIPE_PRICE_ID")!, quantity }],
    subscription_data: {
      trial_period_days: 30,
      metadata: { org_id: orgId },
    },
    // Price in Stripe must be NOK. Set the price as inkl. MVA, or enable
    // Stripe Tax on the price. The amount is not hard-coded here.
    success_url: `${site || "https://skiftpro.com"}/Settings?billing=ok`,
    cancel_url: `${site || "https://skiftpro.com"}/Settings?billing=cancel`,
    locale: "nb",
    metadata: { org_id: orgId },
  });

  await admin.from("organizations").update({ store_quantity: quantity }).eq("id", orgId);
  return json({ enabled: true, url: session.url });
});
