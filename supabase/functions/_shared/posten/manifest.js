import { JOB_DESCRIPTION, JOB_TITLE, NS, POLLING_QUEUE } from "./constants.js";
import { assertNotifiedSigner, assertSignerCount } from "./identity.js";

export function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function signerXml(signer) {
  const identity = signer.personalIdentificationNumber
    ? `<personal-identification-number>${signer.personalIdentificationNumber}</personal-identification-number>`
    : "<identified-by-contact-information/>";
  return [
    `<signer order="${signer.order}">`,
    identity,
    "<notifications>",
    `<email address="${escapeXml(signer.email)}"/>`,
    `<sms number="${escapeXml(signer.phone)}"/>`,
    "</notifications>",
    `<on-behalf-of>${signer.onBehalfOf}</on-behalf-of>`,
    "</signer>",
  ].join("");
}

/**
 * Portal manifest. The sender organization is the customer.
 * The non-sensitive title is fixed so e-mail and SMS never carry a name or id-number.
 */
export function buildPortalManifest({
  senderOrg,
  signers,
  documentName = "document.pdf",
  title = JOB_TITLE,
  description = JOB_DESCRIPTION,
  availableSeconds,
}) {
  assertSignerCount(signers);
  const ready = signers.map(assertNotifiedSigner);
  const identified = ready.every((signer) => signer.personalIdentificationNumber);
  const identifier = identified ? "PERSONAL_IDENTIFICATION_NUMBER_AND_NAME" : "NAME";
  const availability = availableSeconds
    ? `<availability><available-seconds>${availableSeconds}</available-seconds></availability>`
    : "";
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<portal-signature-job-manifest xmlns="${NS}">`,
    "<signers>",
    ...ready.map(signerXml),
    "</signers>",
    "<sender>",
    `<organization-number>${senderOrg}</organization-number>`,
    "</sender>",
    `<title>${escapeXml(title)}</title>`,
    `<nonsensitive-title>${escapeXml(title)}</nonsensitive-title>`,
    `<description>${escapeXml(description)}</description>`,
    "<documents>",
    `<document href="${escapeXml(documentName)}" mime="application/pdf"><title>${escapeXml(title)}</title></document>`,
    "</documents>",
    availability,
    `<identifier-in-signed-documents>${identifier}</identifier-in-signed-documents>`,
    "</portal-signature-job-manifest>",
  ].join("");
}

export function buildPortalRequestXml({ reference, queue = POLLING_QUEUE }) {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<portal-signature-job-request xmlns="${NS}">`,
    `<reference>${escapeXml(reference)}</reference>`,
    `<polling-queue>${escapeXml(queue)}</polling-queue>`,
    "</portal-signature-job-request>",
  ].join("");
}

export function decodeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function xmlText(xml, tag) {
  const match = String(xml || "").match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? decodeXml(match[1].trim()) : "";
}

export function parseCreateResponse(xml) {
  const jobId = xmlText(xml, "signature-job-id");
  const cancellationUrl = xmlText(xml, "cancellation-url");
  if (!jobId) {
    const code = xmlText(xml, "error-code");
    const message = xmlText(xml, "error-message");
    throw new Error(message || code || "Posten returnerte ikke en oppdrags-id.");
  }
  return { jobId, cancellationUrl };
}

export function parseStatusChange(xml) {
  const signatures = [];
  const pattern = /<signature(?:\s[^>]*)?>([\s\S]*?)<\/signature>/gi;
  let match = pattern.exec(String(xml || ""));
  while (match) {
    const block = match[1];
    const statusMatch = block.match(/<status\b([^>]*)>([^<]*)<\/status>/i);
    signatures.push({
      status: statusMatch ? statusMatch[2].trim() : "",
      since: statusMatch ? (statusMatch[1].match(/since="([^"]*)"/i)?.[1] || "") : "",
      personalIdentificationNumber: xmlText(block, "personal-identification-number"),
    });
    match = pattern.exec(String(xml || ""));
  }
  return {
    jobId: xmlText(xml, "signature-job-id"),
    status: xmlText(xml, "status"),
    confirmationUrl: xmlText(xml, "confirmation-url"),
    padesUrl: xmlText(xml, "pades-url"),
    signatures,
  };
}

export function formatApiError(xml, status) {
  const code = xmlText(xml, "error-code");
  const message = xmlText(xml, "error-message");
  if (code || message) return [code, message].filter(Boolean).join(": ");
  return `Posten svarte ${status}.`;
}
