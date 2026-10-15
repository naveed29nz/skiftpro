import { NOT_ACTIVATED, type SigningProvider } from "./provider.ts";

/**
 * Idura (Criipto) Signatures. The GraphQL client (`@criipto/signatures`)
 * and PAdES-LTA sealing are intentionally not called.
 *
 * TODO: when IDURA_CLIENT_ID, IDURA_CLIENT_SECRET and IDURA_WEBHOOK_SECRET
 * are set and SIGNING_PROVIDER=idura, create a signature order that asks
 * only for name and a BankID reference. Do not request fødselsnummer unless
 * a legal basis has been assessed.
 */
export const iduraProvider: SigningProvider = {
  name: "idura",
  active: false,
  inactiveMessage: NOT_ACTIVATED,
};

export function iduraCreateOrder(): never {
  throw new Error(NOT_ACTIVATED);
}
