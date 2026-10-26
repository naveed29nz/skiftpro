import { signingEnv } from "../posten/env.ts";
import { resolveSigningChoice } from "../posten/routing.js";
import { iduraProvider } from "./idura.ts";
import type { SigningProvider } from "./provider.ts";
import { postenProvider } from "./posten.ts";
import { signicatProvider } from "./signicat.ts";
import { simpleOtpProvider } from "./simpleOtp.ts";

/**
 * simple_otp and skiftpro always use the built-in e-mail code.
 * idura and signicat stay on that code unless the platform secrets exist.
 * posten is used only when the organization chose it, and it does not fall
 * back to the e-mail code when the certificate is missing.
 */
export function resolveProvider(requested: string | null | undefined): SigningProvider {
  const decision = resolveSigningChoice(requested, signingEnv());
  if (decision.name === "posten") {
    return { ...postenProvider, active: decision.active, inactiveMessage: decision.inactiveMessage };
  }
  if (decision.name === "idura") return iduraProvider;
  if (decision.name === "signicat") return signicatProvider;
  return simpleOtpProvider;
}
