import {
  assertNotifiedSigner,
  assertSignerCount,
  availableSeconds,
  fodselsnummerValid,
  jobReference,
  senderOrganizationNumber,
} from "./identity.js";
import { storedSignerStatus } from "./status.js";

/**
 * Employment contracts use two portal signers. The employee is addressed by
 * the encrypted fødselsnummer. The employer admin is addressed from the
 * customer card (e-mail and phone) and signs on behalf of the company.
 * Both are notified by e-mail and SMS. Callers may pass up to 10 signers.
 */
export function buildSigners({ employee, employer, extra = [] }) {
  const signers = [
    assertNotifiedSigner({
      role: "ansatt",
      order: 1,
      onBehalfOf: "SELF",
      personalIdentificationNumber: employee?.personalIdentificationNumber,
      email: employee?.email,
      phone: employee?.phone,
    }),
    assertNotifiedSigner({
      role: "arbeidsgiver",
      order: 2,
      onBehalfOf: "OTHER",
      email: employer?.email,
      phone: employer?.phone,
    }),
    ...extra.map((signer, index) => assertNotifiedSigner({
      ...signer,
      role: signer.role || "signatar",
      order: signer.order || index + 3,
      onBehalfOf: signer.onBehalfOf || "OTHER",
    })),
  ];
  if (!fodselsnummerValid(signers[0].personalIdentificationNumber)) {
    throw new Error("Ansattkortet mangler et gyldig fødselsnummer. Det brukes for å adressere den ansatte i Posten Signering.");
  }
  assertSignerCount(signers);
  return signers;
}

/** Join key for a status poll. Does not re-check phone or e-mail. */
export function signersForStatusMatch(parties) {
  const nin = String(parties?.employee?.personal_identification_number || "").replace(/\s+/g, "");
  return [
    { role: "ansatt", order: 1, personalIdentificationNumber: nin },
    { role: "arbeidsgiver", order: 2, personalIdentificationNumber: "" },
  ];
}

export function prepareEmploymentJob(parties) {
  if (!parties?.body_snapshot) throw new Error("Avtalen mangler tekst som kan signeres.");
  const senderOrg = senderOrganizationNumber(parties.org_number);
  const signers = buildSigners({
    employee: {
      personalIdentificationNumber: parties.employee?.personal_identification_number,
      email: parties.employee?.email,
      phone: parties.employee?.phone,
    },
    employer: {
      email: parties.employer?.email,
      phone: parties.employer?.phone,
    },
  });
  return {
    senderOrg,
    signers,
    reference: jobReference(parties.contract_id),
    availableSeconds: availableSeconds(parties.available_days),
    signerStatus: storedSignerStatus(signers),
  };
}
