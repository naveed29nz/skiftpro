import { API_HOSTS, POLLING_QUEUE } from "./constants.js";
import { buildAsicePackage } from "./xades.js";
import { buildPortalManifest, buildPortalRequestXml, formatApiError, parseCreateResponse, parseStatusChange } from "./manifest.js";

export function apiBase(environment) {
  const host = API_HOSTS[environment];
  if (!host) throw new Error("POSTEN_SIGNERING_ENV må være test eller production.");
  return `https://${host}`;
}

export function portalJobsUrl(environment, senderOrg, queue) {
  const url = new URL(`${apiBase(environment)}/api/${senderOrg}/portal/signature-jobs`);
  if (queue) url.searchParams.set("polling_queue", queue);
  return url.toString();
}

export function assertPostenUrl(value, environment) {
  const url = new URL(value);
  const expected = new URL(apiBase(environment)).host;
  if (url.protocol !== "https:" || url.host !== expected) {
    throw new Error("Posten-URL peker ikke på konfigurert miljø.");
  }
  return url.toString();
}

function requireFetch(fetchImpl) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Posten-klienten kan ikke kalles uten en eksplisitt HTTP-transport.");
  }
}

function header(response, name) {
  if (!response?.headers?.get) return "";
  return response.headers.get(name) || response.headers.get(name.toLowerCase()) || "";
}

export function multipartMixed({ boundary, documentBytes, requestXml }) {
  const encoder = new TextEncoder();
  const chunks = [
    encoder.encode(`--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
    documentBytes,
    encoder.encode("\r\n"),
    encoder.encode(`--${boundary}\r\nContent-Type: application/xml\r\n\r\n`),
    encoder.encode(requestXml),
    encoder.encode(`\r\n--${boundary}--\r\n`),
  ];
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return body;
}

export async function createPortalJob({
  fetchImpl,
  environment,
  senderOrg,
  signers,
  pdfBytes,
  reference,
  availableSeconds,
  material,
  queue = POLLING_QUEUE,
  signingTime,
  boundary = `skiftpro-${reference}`,
}) {
  requireFetch(fetchImpl);
  const manifestXml = buildPortalManifest({ senderOrg, signers, availableSeconds });
  const requestXml = buildPortalRequestXml({ reference, queue });
  const packed = buildAsicePackage({
    documentBytes: pdfBytes,
    manifestXml,
    material,
    signingTime,
  });
  const url = portalJobsUrl(environment, senderOrg);
  const body = multipartMixed({ boundary, documentBytes: packed.zip, requestXml });
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Accept: "application/xml",
      "Content-Type": `multipart/mixed; boundary=${boundary}`,
    },
    body,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(formatApiError(text, response.status));
  const created = parseCreateResponse(text);
  return { ...created, url, manifestXml, requestXml };
}

export async function cancelPortalJob({ fetchImpl, environment, cancellationUrl }) {
  requireFetch(fetchImpl);
  if (!cancellationUrl) return;
  const url = assertPostenUrl(cancellationUrl, environment);
  const response = await fetchImpl(url, { method: "POST" });
  if (!response.ok && response.status !== 204) {
    throw new Error(`Kunne ikke kansellere oppdraget (${response.status}).`);
  }
}

export async function pollOnce({ fetchImpl, environment, senderOrg, queue = POLLING_QUEUE }) {
  requireFetch(fetchImpl);
  const url = portalJobsUrl(environment, senderOrg, queue);
  const response = await fetchImpl(url, {
    method: "GET",
    headers: { Accept: "application/xml" },
  });
  const nextPermittedPollAt = header(response, "X-Next-permitted-poll-time");
  if (response.status === 204) return { kind: "empty", nextPermittedPollAt, url };
  if (response.status === 429) return { kind: "backoff", nextPermittedPollAt, url };
  const text = await response.text();
  if (!response.ok) throw new Error(formatApiError(text, response.status));
  return {
    kind: "change",
    ...parseStatusChange(text),
    nextPermittedPollAt,
    url,
  };
}

export function shouldFetchPades(change) {
  if (!change?.padesUrl) return false;
  if (change.status === "COMPLETED_SUCCESSFULLY") return true;
  const signatures = change.signatures || [];
  return signatures.length > 0 && signatures.every((signature) => signature.status === "SIGNED");
}

export async function downloadPades({ fetchImpl, environment, padesUrl }) {
  requireFetch(fetchImpl);
  const url = assertPostenUrl(padesUrl, environment);
  const response = await fetchImpl(url, {
    method: "GET",
    headers: { Accept: "application/pdf" },
  });
  if (!response.ok) throw new Error(`Kunne ikke hente PAdES (${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const head = String.fromCharCode(bytes[0] || 0, bytes[1] || 0, bytes[2] || 0, bytes[3] || 0);
  if (head !== "%PDF") throw new Error("PAdES-svaret er ikke en PDF.");
  return bytes;
}

export async function confirmStatus({ fetchImpl, environment, confirmationUrl }) {
  requireFetch(fetchImpl);
  const url = assertPostenUrl(confirmationUrl, environment);
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Length": "0" },
  });
  if (!response.ok && response.status !== 204) {
    throw new Error(`Kunne ikke bekrefte status (${response.status}).`);
  }
}

/**
 * Download the signed PDF before confirming. Confirming the last update can
 * delete the documents when long-term storage is not enabled.
 */
export async function ingestStatusChange({ change, environment, fetchImpl, persist }) {
  let pades = null;
  if (shouldFetchPades(change)) {
    pades = await downloadPades({ fetchImpl, environment, padesUrl: change.padesUrl });
  }
  await persist({ change, pades });
  if (change.confirmationUrl) {
    await confirmStatus({ fetchImpl, environment, confirmationUrl: change.confirmationUrl });
  }
  return { padesStored: Boolean(pades) };
}
