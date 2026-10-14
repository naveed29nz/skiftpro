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
  const { data: allowed } = await auth.client.rpc("can_assign_roles");
  const { data: inOrg } = await auth.client.rpc("in_org", { org: orgId });
  if (!orgId || !allowed || !inOrg) return json({ error: "Ikke tillatt" }, 403);

  const admin = adminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("stripe_customer_id")
    .eq("id", orgId)
    .maybeSingle();
  if (!org?.stripe_customer_id) return json({ error: "Ingen Stripe-kunde ennå" }, 400);

  const Stripe = (await import("npm:stripe@17.7.0")).default;
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-12-18.acacia" });
  const site = (Deno.env.get("SITE_URL") || "https://skiftpro.com").replace(/\/$/, "");
  const portal = await stripe.billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: `${site}/Settings`,
  });
  return json({ enabled: true, url: portal.url });
});
