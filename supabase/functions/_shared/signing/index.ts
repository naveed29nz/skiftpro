import { iduraProvider } from "./idura.ts";
import type { SigningProvider, SigningProviderName } from "./provider.ts";
import { signicatProvider } from "./signicat.ts";
import { simpleOtpProvider } from "./simpleOtp.ts";

function secretPair(idName: string, secretName: string): boolean {
  return Boolean(Deno.env.get(idName) && Deno.env.get(secretName));
}

/**
 * simple_otp always works. idura and signicat are used only when the
 * organization chose that provider, SIGNING_PROVIDER matches, and the
 * secrets exist. Otherwise the call stays on the built-in e-mail code.
 */
export function resolveProvider(requested: string | null | undefined): SigningProvider {
  const env = (Deno.env.get("SIGNING_PROVIDER") || "simple_otp") as SigningProviderName;
  const choice = requested || "simple_otp";
  if (choice === "idura" && env === "idura" && secretPair("IDURA_CLIENT_ID", "IDURA_CLIENT_SECRET")) {
    return iduraProvider;
  }
  if (
    choice === "signicat"
    && env === "signicat"
    && secretPair("SIGNICAT_CLIENT_ID", "SIGNICAT_CLIENT_SECRET")
  ) {
    return signicatProvider;
  }
  return simpleOtpProvider;
}
