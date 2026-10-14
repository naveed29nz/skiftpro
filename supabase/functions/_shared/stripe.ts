export function stripeEnabled(): boolean {
  return Boolean(Deno.env.get("STRIPE_SECRET_KEY") && Deno.env.get("STRIPE_PRICE_ID"));
}
