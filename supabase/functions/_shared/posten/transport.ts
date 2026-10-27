import forge from "npm:node-forge@1.3.1";
import { signingEnv } from "./env.ts";
import { materialFromPkcs12 } from "./pkcs12.js";
import { postenConfigured } from "./routing.js";

export { signingEnv };

export function loadPostenMaterial() {
  const env = signingEnv();
  if (!postenConfigured(env)) return null;
  return {
    environment: env.POSTEN_SIGNERING_ENV,
    material: materialFromPkcs12(forge, env.POSTEN_SIGNERING_CERT_P12, env.POSTEN_SIGNERING_CERT_PASSWORD),
  };
}

type MtlsFetch = (url: string, init?: RequestInit) => Promise<Response>;

/** mTLS with the virksomhetssertifikat. There is no fetch without the certificate. */
export function mtlsFetch(material: { certificatePem: string; privateKeyPem: string; chainPem?: string[] }): MtlsFetch {
  const runtime = Deno as unknown as {
    createHttpClient?: (options: { certChain: string; privateKey: string }) => { close?: () => void };
  };
  if (typeof runtime.createHttpClient !== "function") {
    throw new Error("Denne kjøringen kan ikke bruke virksomhetssertifikat (mTLS).");
  }
  const client = runtime.createHttpClient({
    certChain: [material.certificatePem, ...(material.chainPem || [])].filter(Boolean).join("\n"),
    privateKey: material.privateKeyPem,
  });
  return (url, init = {}) => fetch(url, { ...init, client } as RequestInit);
}
