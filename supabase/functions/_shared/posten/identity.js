import { MAX_AVAILABLE_SECONDS, MAX_SIGNERS, ZASTEK_BEHANDLER_ORG } from "./constants.js";

const ORG_WEIGHTS = [3, 2, 7, 6, 5, 4, 3, 2];
const NIN_WEIGHTS_1 = [3, 7, 6, 1, 8, 9, 4, 5, 2];
const NIN_WEIGHTS_2 = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

function mod11(digits, weights) {
  const sum = weights.reduce((total, weight, index) => total + weight * Number(digits[index]), 0);
  const rest = 11 - (sum % 11);
  if (rest === 11) return 0;
  if (rest === 10) return null;
  return rest;
}

export function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

/** Same mod-11 rule as src/lib/orgNumber.js. Kept local so the edge bundle stays inside supabase/functions. */
export function orgNumberValid(value) {
  const digits = digitsOnly(value);
  if (!/^\d{9}$/.test(digits)) return false;
  const check = mod11(digits, ORG_WEIGHTS);
  if (check == null) return false;
  return digits[8] === String(check);
}

/** Same mod-11 rule as src/contracts/fodselsnummer.js. */
export function fodselsnummerValid(value) {
  const digits = String(value || "").replace(/\s+/g, "");
  if (!/^\d{11}$/.test(digits)) return false;
  const first = mod11(digits, NIN_WEIGHTS_1);
  const second = mod11(digits, NIN_WEIGHTS_2);
  if (first == null || second == null) return false;
  return digits[9] === String(first) && digits[10] === String(second);
}

export function senderOrganizationNumber(value) {
  const digits = digitsOnly(value);
  if (!orgNumberValid(digits)) {
    throw new Error("Kundekortet mangler et gyldig organisasjonsnummer. Kunden er avsender i Posten Signering.");
  }
  if (digits === ZASTEK_BEHANDLER_ORG) {
    throw new Error(`Avsender skal være kundens organisasjonsnummer. ${ZASTEK_BEHANDLER_ORG} er Zastek, som er behandler.`);
  }
  return digits;
}

export function normalizeEmail(value) {
  return String(value || "").trim();
}

/** Norwegian mobile numbers as 8 digits, which is what the portal examples use. */
export function normalizePhone(value) {
  let digits = digitsOnly(value);
  if (digits.startsWith("0047")) digits = digits.slice(4);
  else if (digits.startsWith("47") && digits.length === 10) digits = digits.slice(2);
  return digits;
}

export function availableSeconds(days) {
  const parsed = Number(days);
  const safeDays = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 14;
  return Math.min(safeDays * 86400, MAX_AVAILABLE_SECONDS);
}

export function jobReference(contractId) {
  const clean = String(contractId || "").replace(/[^A-Za-z0-9-]/g, "");
  if (!clean) throw new Error("Avtalen mangler id.");
  return `skiftpro-${clean}`.slice(0, 80);
}

export function assertSignerCount(signers) {
  if (!Array.isArray(signers) || signers.length < 1) {
    throw new Error("Signeringsoppdraget mangler signatarer.");
  }
  if (signers.length > MAX_SIGNERS) {
    throw new Error(`Posten Signering støtter høyst ${MAX_SIGNERS} signatarer.`);
  }
}

export function assertNotifiedSigner(signer) {
  const email = normalizeEmail(signer?.email);
  const phone = normalizePhone(signer?.phone);
  if (!email.includes("@")) {
    throw new Error("Hver signatar må ha e-post. Posten varsler på e-post og SMS.");
  }
  if (!/^\d{8}$/.test(phone)) {
    throw new Error("Hver signatar må ha et norsk mobilnummer på 8 siffer. Posten varsler på e-post og SMS.");
  }
  if (signer?.onBehalfOf !== "SELF" && signer?.onBehalfOf !== "OTHER") {
    throw new Error("on-behalf-of må være SELF eller OTHER.");
  }
  const nin = signer?.personalIdentificationNumber
    ? String(signer.personalIdentificationNumber).replace(/\s+/g, "")
    : "";
  if (nin && !fodselsnummerValid(nin)) {
    throw new Error("Fødselsnummeret må være 11 siffer med gyldig kontrollsiffer.");
  }
  return { ...signer, email, phone, personalIdentificationNumber: nin };
}
