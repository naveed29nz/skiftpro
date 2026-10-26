import test from "node:test";
import assert from "node:assert/strict";
import forge from "node-forge";
import { fodselsnummerValid as uiNin } from "./fodselsnummer.js";
import { orgNumberValid as uiOrg } from "../lib/orgNumber.js";
import { postenOptionState, postenRegistrationNote, postenStatusText } from "./postenSigning.js";
import { ZASTEK_BEHANDLER_ORG } from "../../supabase/functions/_shared/posten/constants.js";
import { fodselsnummerValid, orgNumberValid, senderOrganizationNumber } from "../../supabase/functions/_shared/posten/identity.js";
import { buildSigners, prepareEmploymentJob } from "../../supabase/functions/_shared/posten/parties.js";
import { buildPortalManifest } from "../../supabase/functions/_shared/posten/manifest.js";
import { materialFromPkcs12 } from "../../supabase/functions/_shared/posten/pkcs12.js";
import { unzipStore } from "../../supabase/functions/_shared/posten/zip.js";
import { buildAsicePackage, verifySignedInfo } from "../../supabase/functions/_shared/posten/xades.js";
import {
  cancelPortalJob,
  confirmStatus,
  createPortalJob,
  ingestStatusChange,
  pollOnce,
} from "../../supabase/functions/_shared/posten/client.js";
import { contractFieldsFromChange } from "../../supabase/functions/_shared/posten/status.js";
import {
  contractUsesPosten,
  postenPublicConfig,
  resolveSigningChoice,
  sendsSkiftproInvite,
} from "../../supabase/functions/_shared/posten/routing.js";

const NIN = "15059000060";
const CUSTOMER_ORG = "123456785";
const EMPLOYEE = { personalIdentificationNumber: NIN, email: "ansatt@example.com", phone: "+47 400 00 001" };
const EMPLOYER = { email: "admin@kunde.no", phone: "90000002" };

function certificateMaterial(orgToken = `NTRNO-${ZASTEK_BEHANDLER_ORG}`) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date("2026-01-01T00:00:00Z");
  cert.validity.notAfter = new Date("2028-01-01T00:00:00Z");
  const subject = [
    { name: "commonName", value: "Zastek AS" },
    { name: "organizationName", value: "Zastek AS" },
    { name: "countryName", value: "NO" },
    { name: "serialNumber", value: orgToken },
  ];
  cert.setSubject(subject);
  cert.setIssuer(subject);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const password = "test-pass";
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: "3des" });
  const p12Base64 = forge.util.encode64(forge.asn1.toDer(p12Asn1).getBytes());
  const material = materialFromPkcs12(forge, p12Base64, password);
  material.publicKeyPem = forge.pki.publicKeyToPem(keys.publicKey);
  return { material, password, p12Base64 };
}

const fixture = certificateMaterial();

function parties(overrides = {}) {
  return {
    contract_id: "contract-1",
    org_number: CUSTOMER_ORG,
    body_snapshot: "Arbeidsavtale tekst",
    available_days: 14,
    employee: {
      personal_identification_number: NIN,
      email: "ansatt@example.com",
      phone: "40000001",
    },
    employer: { email: "admin@kunde.no", phone: "90000002" },
    ...overrides,
  };
}

function headerBag(value) {
  return { get: (name) => (name.toLowerCase() === "x-next-permitted-poll-time" ? value : null) };
}

test("identity checks match the existing org-number and fødselsnummer helpers", () => {
  assert.equal(orgNumberValid(CUSTOMER_ORG), uiOrg(CUSTOMER_ORG));
  assert.equal(orgNumberValid("123"), uiOrg("123"));
  assert.equal(fodselsnummerValid(NIN), uiNin(NIN));
  assert.equal(fodselsnummerValid("12345678901"), false);
  assert.throws(() => senderOrganizationNumber(ZASTEK_BEHANDLER_ORG), /behandler/);
});

test("skiftpro and simple_otp stay on the e-mail code, and posten does not fall back", () => {
  for (const choice of ["simple_otp", "skiftpro", null, undefined, "ukjent"]) {
    const route = resolveSigningChoice(choice, {});
    assert.equal(route.name, "simple_otp");
    assert.equal(route.active, true);
  }
  const iduraWithoutSecrets = resolveSigningChoice("idura", { SIGNING_PROVIDER: "idura" });
  assert.equal(iduraWithoutSecrets.name, "simple_otp");
  const posten = resolveSigningChoice("posten", {});
  assert.equal(posten.name, "posten");
  assert.equal(posten.active, false);
  assert.equal(sendsSkiftproInvite("simple_otp"), true);
  assert.equal(sendsSkiftproInvite("posten"), false);
  assert.equal(contractUsesPosten("simple_otp"), false);
  assert.equal(contractUsesPosten("posten"), true);
  const ready = resolveSigningChoice("posten", {
    POSTEN_SIGNERING_CERT_P12: "YQ==",
    POSTEN_SIGNERING_CERT_PASSWORD: "secret",
    POSTEN_SIGNERING_ENV: "test",
  });
  assert.equal(ready.active, true);
  assert.equal(postenPublicConfig({}).cert_configured, false);
  assert.equal(postenPublicConfig({
    POSTEN_SIGNERING_CERT_P12: "YQ==",
    POSTEN_SIGNERING_CERT_PASSWORD: "secret",
    POSTEN_SIGNERING_ENV: "production",
  }).environment, "production");
});

test("posten is disabled without an org number or a configured certificate", () => {
  assert.equal(postenOptionState({ orgNumber: "", certConfigured: true }).disabled, true);
  assert.match(postenOptionState({ orgNumber: "123", certConfigured: true }).reason, /organisasjonsnummer/);
  assert.match(postenOptionState({ orgNumber: CUSTOMER_ORG, certConfigured: false }).reason, /virksomhetssertifikat/);
  assert.equal(postenOptionState({ orgNumber: CUSTOMER_ORG, certConfigured: true }).disabled, false);
  assert.match(postenRegistrationNote(), /938291144/);
  assert.match(postenRegistrationNote(), /signering\.posten\.no/);
});

test("a portal manifest addresses two signers by e-mail and SMS and names the customer as sender", () => {
  const signers = buildSigners({ employee: EMPLOYEE, employer: EMPLOYER });
  const xml = buildPortalManifest({
    senderOrg: CUSTOMER_ORG,
    signers,
    availableSeconds: 14 * 86400,
  });
  assert.match(xml, new RegExp(`<organization-number>${CUSTOMER_ORG}</organization-number>`));
  assert.doesNotMatch(xml, new RegExp(ZASTEK_BEHANDLER_ORG));
  assert.match(xml, /<personal-identification-number>15059000060<\/personal-identification-number>/);
  assert.match(xml, /<identified-by-contact-information\/>/);
  assert.match(xml, /address="ansatt@example.com"/);
  assert.match(xml, /address="admin@kunde.no"/);
  assert.match(xml, /number="40000001"/);
  assert.match(xml, /number="90000002"/);
  assert.match(xml, /order="1"/);
  assert.match(xml, /order="2"/);
  assert.match(xml, /<on-behalf-of>SELF<\/on-behalf-of>/);
  assert.match(xml, /<on-behalf-of>OTHER<\/on-behalf-of>/);
  const nonsensitive = xml.match(/<nonsensitive-title>([^<]*)<\/nonsensitive-title>/)[1];
  assert.equal(nonsensitive, "Arbeidsavtale");
  assert.equal(nonsensitive.includes(NIN), false);
  const reference = "skiftpro-contract-1";
  assert.equal(reference.includes(NIN), false);
  assert.match(xml, /<identifier-in-signed-documents>NAME<\/identifier-in-signed-documents>/);
  assert.throws(() => buildSigners({
    employee: EMPLOYEE,
    employer: EMPLOYER,
    extra: Array.from({ length: 9 }, () => ({ email: "x@example.com", phone: "40000003" })),
  }), /10/);
});

test("create, poll and PAdES download use the mocked transport and the test host", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (init.method === "POST" && String(url).endsWith("/portal/signature-jobs")) {
      return {
        ok: true,
        status: 200,
        text: async () => `<portal-signature-job-response xmlns="http://signering.posten.no/schema/v1"><signature-job-id>job-42</signature-job-id><cancellation-url>https://api.difitest.signering.posten.no/api/${CUSTOMER_ORG}/portal/signature-jobs/job-42/cancel</cancellation-url></portal-signature-job-response>`,
      };
    }
    return { ok: false, status: 500, text: async () => "" };
  };
  const prepared = prepareEmploymentJob(parties());
  const created = await createPortalJob({
    fetchImpl,
    environment: "test",
    senderOrg: prepared.senderOrg,
    signers: prepared.signers,
    pdfBytes: new TextEncoder().encode("%PDF-1.4\n"),
    reference: prepared.reference,
    availableSeconds: prepared.availableSeconds,
    material: fixture.material,
    signingTime: "2026-10-26T12:00:00Z",
  });
  assert.equal(created.jobId, "job-42");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://api.difitest.signering.posten.no/api/${CUSTOMER_ORG}/portal/signature-jobs`);
  assert.match(calls[0].init.headers["Content-Type"], /multipart\/mixed/);
  const body = new TextDecoder().decode(calls[0].init.body);
  assert.match(body, /application\/octet-stream/);
  assert.match(body, /application\/xml/);
  assert.match(body, new RegExp(`<organization-number>${CUSTOMER_ORG}</organization-number>`));
  assert.match(body, /<polling-queue>skiftpro<\/polling-queue>/);
  assert.doesNotMatch(body, /api\.signering\.posten\.no/);
  const packed = buildAsicePackage({
    documentBytes: new TextEncoder().encode("%PDF-1.4\n"),
    manifestXml: created.manifestXml,
    material: fixture.material,
    signingTime: "2026-10-26T12:00:00Z",
  });
  const files = unzipStore(packed.zip);
  assert.equal(files[0].name, "mimetype");
  assert.equal(new TextDecoder().decode(files[0].bytes), "application/vnd.etsi.asic-e+zip");
  assert.deepEqual(files.map((file) => file.name), ["mimetype", "manifest.xml", "document.pdf", "META-INF/signatures.xml"]);
  const signatures = new TextDecoder().decode(files[3].bytes);
  assert.equal(verifySignedInfo(signatures, packed.signedInfo, fixture.material.publicKeyPem), true);
  assert.match(signatures, /rsa-sha256/);
});

test("a certificate for another organization is refused before any request", async () => {
  const other = certificateMaterial("NTRNO-111111111");
  let called = false;
  await assert.rejects(() => createPortalJob({
    fetchImpl: async () => {
      called = true;
      return { ok: true, status: 200, text: async () => "" };
    },
    environment: "production",
    senderOrg: CUSTOMER_ORG,
    signers: buildSigners({ employee: EMPLOYEE, employer: EMPLOYER }),
    pdfBytes: new TextEncoder().encode("%PDF-1.4\n"),
    reference: "skiftpro-contract-1",
    availableSeconds: 86400,
    material: other.material,
  }), /938291144/);
  assert.equal(called, false);
  await assert.rejects(() => createPortalJob({
    environment: "test",
    senderOrg: CUSTOMER_ORG,
    signers: buildSigners({ employee: EMPLOYEE, employer: EMPLOYER }),
    pdfBytes: new TextEncoder().encode("%PDF-1.4\n"),
    reference: "skiftpro-contract-1",
    material: fixture.material,
  }), /eksplisitt HTTP-transport/);
});

test("polling honours empty and backoff responses and confirms only after the PAdES is stored", async () => {
  const signers = buildSigners({ employee: EMPLOYEE, employer: EMPLOYER });
  const empty = await pollOnce({
    fetchImpl: async () => ({ ok: true, status: 204, headers: headerBag("2026-10-26T12:10:00Z"), text: async () => "" }),
    environment: "test",
    senderOrg: CUSTOMER_ORG,
  });
  assert.equal(empty.kind, "empty");
  assert.equal(empty.nextPermittedPollAt, "2026-10-26T12:10:00Z");
  const backoff = await pollOnce({
    fetchImpl: async () => ({ ok: false, status: 429, headers: headerBag("2026-10-26T12:20:00Z"), text: async () => "" }),
    environment: "test",
    senderOrg: CUSTOMER_ORG,
  });
  assert.equal(backoff.kind, "backoff");

  const changeXml = `<?xml version="1.0"?>
    <portal-signature-job-status-change-response xmlns="http://signering.posten.no/schema/v1">
      <signature-job-id>job-42</signature-job-id>
      <status>COMPLETED_SUCCESSFULLY</status>
      <confirmation-url>https://api.difitest.signering.posten.no/api/${CUSTOMER_ORG}/portal/signature-jobs/job-42/complete</confirmation-url>
      <signatures>
        <signature><status since="2026-10-26T11:00:00Z">SIGNED</status><personal-identification-number>${NIN}</personal-identification-number></signature>
        <signature><status since="2026-10-26T12:00:00Z">SIGNED</status></signature>
        <pades-url>https://api.difitest.signering.posten.no/api/${CUSTOMER_ORG}/portal/signature-jobs/job-42/pades</pades-url>
      </signatures>
    </portal-signature-job-status-change-response>`;
  const change = await pollOnce({
    fetchImpl: async (url) => ({
      ok: true,
      status: 200,
      headers: headerBag(""),
      text: async () => changeXml,
      url,
    }),
    environment: "test",
    senderOrg: CUSTOMER_ORG,
  });
  assert.equal(change.status, "COMPLETED_SUCCESSFULLY");
  const fields = contractFieldsFromChange(change, signers);
  assert.equal(fields.contractStatus, "signert");
  assert.equal(fields.employeeSignedAt, "2026-10-26T11:00:00.000Z");
  assert.equal(fields.employerSignedAt, "2026-10-26T12:00:00.000Z");
  assert.equal(JSON.stringify(fields).includes(NIN), false);

  const order = [];
  await ingestStatusChange({
    change,
    environment: "test",
    fetchImpl: async (url, init) => {
      order.push(`${init?.method || "GET"} ${url}`);
      if (String(url).endsWith("/pades")) {
        return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode("%PDF-signed").buffer };
      }
      return { ok: true, status: 200, text: async () => "" };
    },
    persist: async ({ pades }) => {
      order.push(`persist ${new TextDecoder().decode(pades)}`);
    },
  });
  assert.deepEqual(order, [
    `GET https://api.difitest.signering.posten.no/api/${CUSTOMER_ORG}/portal/signature-jobs/job-42/pades`,
    "persist %PDF-signed",
    `POST https://api.difitest.signering.posten.no/api/${CUSTOMER_ORG}/portal/signature-jobs/job-42/complete`,
  ]);

  await assert.rejects(() => ingestStatusChange({
    change,
    environment: "test",
    fetchImpl: async () => ({ ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode("%PDF-signed").buffer }),
    persist: async () => {
      throw new Error("database nede");
    },
  }), /database nede/);

  await assert.rejects(() => confirmStatus({
    fetchImpl: async () => ({ ok: true, status: 200 }),
    environment: "test",
    confirmationUrl: "https://evil.example/complete",
  }), /konfigurert miljø/);
  await cancelPortalJob({
    fetchImpl: async () => ({ ok: true, status: 204 }),
    environment: "production",
    cancellationUrl: `https://api.signering.posten.no/api/${CUSTOMER_ORG}/portal/signature-jobs/job-42/cancel`,
  });
});

test("partial signatures move the contract to signed-by-employee and a rejection closes it", () => {
  const signers = buildSigners({ employee: EMPLOYEE, employer: EMPLOYER });
  const waiting = contractFieldsFromChange({
    status: "IN_PROGRESS",
    signatures: [
      { status: "SIGNED", since: "2026-10-26T11:00:00Z", personalIdentificationNumber: NIN },
      { status: "WAITING", personalIdentificationNumber: "" },
    ],
  }, signers);
  assert.equal(waiting.contractStatus, "signert_ansatt");
  assert.equal(waiting.signerStatus[1].role, "arbeidsgiver");
  const rejected = contractFieldsFromChange({
    status: "FAILED",
    signatures: [
      { status: "REJECTED", personalIdentificationNumber: NIN },
      { status: "NOT_APPLICABLE" },
    ],
  }, signers);
  assert.equal(rejected.contractStatus, "avvist");
  const expired = contractFieldsFromChange({
    status: "FAILED",
    signatures: [{ status: "EXPIRED", personalIdentificationNumber: NIN }, { status: "NOT_APPLICABLE" }],
  }, signers);
  assert.equal(expired.contractStatus, "utlopt");
  assert.equal(postenStatusText({
    signing_provider: "posten",
    posten_job_id: "job-42",
    posten_status: "IN_PROGRESS",
    posten_signer_status: waiting.signerStatus,
  }), "Posten: venter på signering · ansatt har signert · arbeidsgiver venter");
  assert.equal(postenStatusText({ status: "sendt", signing_provider: "simple_otp" }), "");
});

test("a bad PKCS#12 password is rejected and the employment job is not sent without a fødselsnummer", () => {
  assert.throws(() => materialFromPkcs12(forge, fixture.p12Base64, "feil"), /passordet/);
  assert.throws(() => prepareEmploymentJob(parties({
    employee: { personal_identification_number: "", email: "ansatt@example.com", phone: "40000001" },
  })), /fødselsnummer/);
  assert.throws(() => prepareEmploymentJob(parties({
    employer: { email: "admin@kunde.no", phone: "" },
  })), /mobilnummer/);
});
