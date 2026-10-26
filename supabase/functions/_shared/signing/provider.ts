export type SigningProviderName = "simple_otp" | "idura" | "signicat" | "posten";

export interface SigningProvider {
  name: SigningProviderName;
  /** True only when this provider can complete a signature in this environment. */
  active: boolean;
  /** Norwegian message when the provider is selected but not switched on. */
  inactiveMessage: string;
}

export const NOT_ACTIVATED =
  "BankID er ikke aktivert. Leverandøren skal ikke be om fødselsnummer. Aktivering krever avtale med Idura eller Signicat og med Stø.";
