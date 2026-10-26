import { orgNumberValid } from "../lib/orgNumber.js";
import {
  POSTEN_REGISTRATION_URL,
  ZASTEK_BEHANDLER_NAME,
  ZASTEK_BEHANDLER_ORG,
} from "../../supabase/functions/_shared/posten/constants.js";

export { POSTEN_REGISTRATION_URL, ZASTEK_BEHANDLER_NAME, ZASTEK_BEHANDLER_ORG };

const SIGNER_STATUS = {
  WAITING: "venter",
  SIGNED: "har signert",
  REJECTED: "har avvist",
  EXPIRED: "frist utløpt",
  CANCELLED: "kansellert",
  BLOCKED: "sperret",
  NOT_APPLICABLE: "ikke aktuell",
  CONTACT_INFORMATION_MISSING: "mangler kontaktinfo",
};

export function postenOptionState({ orgNumber, certConfigured }) {
  if (!orgNumberValid(orgNumber)) {
    return {
      disabled: true,
      reason: "Posten Signering krever gyldig organisasjonsnummer på kundekortet.",
    };
  }
  if (!certConfigured) {
    return {
      disabled: true,
      reason: "Posten Signering er ikke klart: virksomhetssertifikatet (Buypass eller Commfides) er ikke lagt inn på serveren.",
    };
  }
  return { disabled: false, reason: "" };
}

export function postenRegistrationNote() {
  return `Kunden må registrere seg på ${POSTEN_REGISTRATION_URL} og knytte ${ZASTEK_BEHANDLER_NAME} (org.nr ${ZASTEK_BEHANDLER_ORG}) som behandler. Kunden vises som avsender av signeringsoppdraget.`;
}

export function postenStatusText(contract) {
  if (!contract?.posten_job_id && contract?.signing_provider !== "posten") return "";
  const signers = Array.isArray(contract.posten_signer_status) ? contract.posten_signer_status : [];
  const employee = signers.find((row) => row?.role === "ansatt");
  const employer = signers.find((row) => row?.role === "arbeidsgiver");
  const bits = [];
  if (contract.posten_status === "COMPLETED_SUCCESSFULLY" || contract.posten_pades_path) {
    bits.push("Posten: signert PAdES er lagret");
  } else if (contract.posten_status === "FAILED") {
    bits.push("Posten: oppdraget feilet");
  } else if (contract.posten_job_id) {
    bits.push("Posten: venter på signering");
  }
  if (employee?.status) bits.push(`ansatt ${SIGNER_STATUS[employee.status] || employee.status}`);
  if (employer?.status) bits.push(`arbeidsgiver ${SIGNER_STATUS[employer.status] || employer.status}`);
  return bits.join(" · ");
}
