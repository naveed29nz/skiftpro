import { ZASTEK_BEHANDLER_NAME, ZASTEK_BEHANDLER_ORG } from "./constants.js";

export const POSTEN_NOT_CONFIGURED =
  "Posten Signering er ikke konfigurert. Virksomhetssertifikat og miljø (test eller production) mangler.";

const NOT_ACTIVATED =
  "BankID er ikke aktivert. Leverandøren skal ikke be om fødselsnummer. Aktivering krever avtale med Idura eller Signicat og med Stø.";

export function postenConfigured(env = {}) {
  const name = env.POSTEN_SIGNERING_ENV;
  return Boolean(
    env.POSTEN_SIGNERING_CERT_P12
    && env.POSTEN_SIGNERING_CERT_PASSWORD
    && (name === "test" || name === "production"),
  );
}

/**
 * simple_otp and skiftpro stay on the built-in e-mail code.
 * idura and signicat keep the previous fallback: without platform secrets
 * they resolve to simple_otp. posten never falls back to the e-mail code.
 */
export function resolveSigningChoice(requested, env = {}) {
  const platform = env.SIGNING_PROVIDER || "simple_otp";
  const choice = requested || "simple_otp";
  if (choice === "posten") {
    const active = postenConfigured(env);
    return {
      name: "posten",
      active,
      inactiveMessage: active ? "" : POSTEN_NOT_CONFIGURED,
    };
  }
  if (choice === "idura" && platform === "idura" && env.IDURA_CLIENT_ID && env.IDURA_CLIENT_SECRET) {
    return { name: "idura", active: false, inactiveMessage: NOT_ACTIVATED };
  }
  if (choice === "signicat" && platform === "signicat" && env.SIGNICAT_CLIENT_ID && env.SIGNICAT_CLIENT_SECRET) {
    return { name: "signicat", active: false, inactiveMessage: NOT_ACTIVATED };
  }
  return { name: "simple_otp", active: true, inactiveMessage: "" };
}

export function sendsSkiftproInvite(choiceName) {
  return choiceName !== "posten";
}

/** A portal job is created only when the certificate secrets are present. */
export function shouldSendViaPosten(decision) {
  return decision?.name === "posten" && decision.active === true;
}

export function contractUsesPosten(signingProvider) {
  return signingProvider === "posten";
}

export function postenPublicConfig(env = {}) {
  const configured = postenConfigured(env);
  return {
    cert_configured: configured,
    environment: configured ? env.POSTEN_SIGNERING_ENV : null,
    behandler_name: ZASTEK_BEHANDLER_NAME,
    behandler_org: ZASTEK_BEHANDLER_ORG,
    registration_url: "https://signering.posten.no/registrering",
  };
}
