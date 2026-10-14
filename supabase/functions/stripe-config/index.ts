import { handleOptions, json, requireUser } from "../_shared/auth.ts";
import { stripeEnabled } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  return json({
    enabled: stripeEnabled(),
    currency: "nok",
    trial_days: 30,
    tax: "mva",
  });
});
