/** Zastek AS is the behandler (technical broker). The customer is the sender. */
export const ZASTEK_BEHANDLER_NAME = "Zastek AS";
export const ZASTEK_BEHANDLER_ORG = "938291144";

export const POSTEN_REGISTRATION_URL = "https://signering.posten.no/registrering";

export const POLLING_QUEUE = "skiftpro";

/** Portal jobs accept at most 10 signers. */
export const MAX_SIGNERS = 10;

/** Posten rejects available-seconds above 90 days. */
export const MAX_AVAILABLE_SECONDS = 7776000;

export const NS = "http://signering.posten.no/schema/v1";

export const API_HOSTS = {
  test: "api.difitest.signering.posten.no",
  production: "api.signering.posten.no",
};

export const JOB_TITLE = "Arbeidsavtale";
export const JOB_DESCRIPTION = "Arbeidsavtale til signering.";
