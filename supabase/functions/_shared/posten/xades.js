import { Buffer } from "node:buffer";
import { createHash, createPrivateKey, sign, verify, X509Certificate } from "node:crypto";
import { ZASTEK_BEHANDLER_ORG } from "./constants.js";
import { ASIC_MIME, unzipStore, zipStore } from "./zip.js";

const DS = "http://www.w3.org/2000/09/xmldsig#";
const XADES = "http://uri.etsi.org/01903/v1.3.2#";
const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256";
const SHA1 = "http://www.w3.org/2000/09/xmldsig#sha1";
const SIGNED_PROPS_TYPE = "http://uri.etsi.org/01903#SignedProperties";

function sha256Base64(bytes) {
  return createHash("sha256").update(bytes).digest("base64");
}

function escapeText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function organizationNumberFromSubject(subject) {
  const match = String(subject || "").match(/NTRNO-(\d{9})/i);
  return match ? match[1] : "";
}

export function assertBehandlerCertificate(certificatePem) {
  const subject = new X509Certificate(certificatePem).subject;
  const org = organizationNumberFromSubject(subject);
  if (org && org !== ZASTEK_BEHANDLER_ORG) {
    throw new Error(
      `Virksomhetssertifikatet tilhører org.nr ${org}. Behandler skal være Zastek AS (${ZASTEK_BEHANDLER_ORG}).`,
    );
  }
  return org;
}

function issuerName(certificate) {
  return certificate.issuer.split(/\r?\n/).map((part) => part.trim()).filter(Boolean).join(", ");
}

function serialDecimal(certificate) {
  const hex = certificate.serialNumber.replace(/:/g, "");
  return BigInt(`0x${hex}`).toString(10);
}

function pemBody(pem) {
  return String(pem).replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\s+/g, "");
}

function signedPropertiesCanonical({ signingTime, certDigest, issuer, serial, files }) {
  const formats = files.map((file, index) => (
    `<DataObjectFormat ObjectReference="#ID_${index}"><MimeType>${escapeText(file.mime)}</MimeType></DataObjectFormat>`
  )).join("");
  return [
    `<SignedProperties xmlns="${XADES}" xmlns:ns2="${DS}" Id="SignedProperties">`,
    "<SignedSignatureProperties>",
    `<SigningTime>${escapeText(signingTime)}</SigningTime>`,
    "<SigningCertificate><Cert><CertDigest>",
    `<ns2:DigestMethod Algorithm="${SHA1}"></ns2:DigestMethod>`,
    `<ns2:DigestValue>${certDigest}</ns2:DigestValue>`,
    "</CertDigest><IssuerSerial>",
    `<ns2:X509IssuerName>${escapeText(issuer)}</ns2:X509IssuerName>`,
    `<ns2:X509SerialNumber>${escapeText(serial)}</ns2:X509SerialNumber>`,
    "</IssuerSerial></Cert></SigningCertificate>",
    "</SignedSignatureProperties>",
    `<SignedDataObjectProperties>${formats}</SignedDataObjectProperties>`,
    "</SignedProperties>",
  ].join("");
}

function signedInfoCanonical(files, signedPropsDigest) {
  const references = files.map((file, index) => (
    `<Reference Id="ID_${index}" URI="${file.name}"><DigestMethod Algorithm="${SHA256}"></DigestMethod><DigestValue>${file.digest}</DigestValue></Reference>`
  )).join("");
  const props = [
    `<Reference Type="${SIGNED_PROPS_TYPE}" URI="#SignedProperties">`,
    `<Transforms><Transform Algorithm="${C14N}"></Transform></Transforms>`,
    `<DigestMethod Algorithm="${SHA256}"></DigestMethod>`,
    `<DigestValue>${signedPropsDigest}</DigestValue>`,
    "</Reference>",
  ].join("");
  return [
    `<SignedInfo xmlns="${DS}">`,
    `<CanonicalizationMethod Algorithm="${C14N}"></CanonicalizationMethod>`,
    `<SignatureMethod Algorithm="${RSA_SHA256}"></SignatureMethod>`,
    references,
    props,
    "</SignedInfo>",
  ].join("");
}

export function signingTimeStamp(date = new Date()) {
  const pad = (value, size = 2) => String(value).padStart(size, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}Z`;
}

/**
 * XAdES-BES inside META-INF/signatures.xml, matching the Posten ASiC-E profile:
 * rsa-sha256, sha256 file digests, sha1 certificate digest, no transforms on file references.
 * The package is signed by the behandler certificate (Zastek), which the profile allows
 * for the data processor.
 */
export function buildSignaturesXml({ files, material, signingTime }) {
  const certificate = new X509Certificate(material.certificatePem);
  const digested = files.map((file) => ({
    name: file.name,
    mime: file.mime,
    digest: sha256Base64(file.bytes),
  }));
  const properties = signedPropertiesCanonical({
    signingTime,
    certDigest: createHash("sha1").update(certificate.raw).digest("base64"),
    issuer: issuerName(certificate),
    serial: serialDecimal(certificate),
    files: digested,
  });
  const signedInfo = signedInfoCanonical(digested, sha256Base64(new TextEncoder().encode(properties)));
  const signature = sign("sha256", Buffer.from(signedInfo), createPrivateKey(material.privateKeyPem));
  const certificates = [material.certificatePem, ...(material.chainPem || [])]
    .map((pem) => `<X509Certificate>${pemBody(pem)}</X509Certificate>`)
    .join("");
  const xml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    '<XAdESSignatures xmlns="http://uri.etsi.org/2918/v1.2.1#">',
    '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#" Id="Signature">',
    signedInfo,
    `<SignatureValue>${signature.toString("base64")}</SignatureValue>`,
    `<KeyInfo><X509Data>${certificates}</X509Data></KeyInfo>`,
    `<Object><QualifyingProperties xmlns="${XADES}" xmlns:ns2="${DS}" Target="#Signature">`,
    properties,
    "</QualifyingProperties></Object>",
    "</Signature>",
    "</XAdESSignatures>",
  ].join("");
  return { xml, signedInfo };
}

export function buildAsicePackage({ documentBytes, manifestXml, material, signingTime = signingTimeStamp() }) {
  assertBehandlerCertificate(material.certificatePem);
  const encoder = new TextEncoder();
  const manifestBytes = encoder.encode(manifestXml);
  const mimeBytes = encoder.encode(ASIC_MIME);
  const files = [
    { name: "document.pdf", bytes: documentBytes, mime: "application/pdf" },
    { name: "manifest.xml", bytes: manifestBytes, mime: "application/xml" },
    { name: "mimetype", bytes: mimeBytes, mime: "text/plain" },
  ];
  const signed = buildSignaturesXml({ files, material, signingTime });
  const zip = zipStore([
    { name: "mimetype", bytes: mimeBytes },
    { name: "manifest.xml", bytes: manifestBytes },
    { name: "document.pdf", bytes: documentBytes },
    { name: "META-INF/signatures.xml", bytes: encoder.encode(signed.xml) },
  ]);
  return { zip, signaturesXml: signed.xml, signedInfo: signed.signedInfo };
}

export function verifySignedInfo(signaturesXml, signedInfo, publicKeyPem) {
  const value = signaturesXml.match(/<SignatureValue>([^<]*)<\/SignatureValue>/)?.[1] || "";
  const embedded = signaturesXml.includes(signedInfo);
  const ok = verify(
    "sha256",
    Buffer.from(signedInfo),
    publicKeyPem,
    Buffer.from(value, "base64"),
  );
  return embedded && ok;
}
