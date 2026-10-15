import { NOT_ACTIVATED, type SigningProvider } from "./provider.ts";

/**
 * Signicat Sign API stub.
 *
 * TODO: when SIGNICAT_CLIENT_ID, SIGNICAT_CLIENT_SECRET and
 * SIGNICAT_WEBHOOK_SECRET are set and SIGNING_PROVIDER=signicat, start a
 * signing session that stores name and the provider reference only.
 * Do not request fødselsnummer unless a legal basis has been assessed.
 */
export const signicatProvider: SigningProvider = {
  name: "signicat",
  active: false,
  inactiveMessage: NOT_ACTIVATED,
};

export function signicatCreateSession(): never {
  throw new Error(NOT_ACTIVATED);
}
