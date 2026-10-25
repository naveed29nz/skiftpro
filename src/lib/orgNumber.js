const ORG_WEIGHTS = [3, 2, 7, 6, 5, 4, 3, 2];

export const BRREG_ENHET_URL = 'https://data.brreg.no/enhetsregisteret/api/enheter/';

export function orgNumberDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function checkDigit(digits) {
  const sum = ORG_WEIGHTS.reduce((total, weight, index) => total + weight * Number(digits[index]), 0);
  const rest = 11 - (sum % 11);
  if (rest === 11) return 0;
  if (rest === 10) return null;
  return rest;
}

/** Norwegian organisation number: 9 digits and a mod-11 check digit. */
export function orgNumberValid(value) {
  const digits = orgNumberDigits(value);
  if (!/^\d{9}$/.test(digits)) return false;
  const check = checkDigit(digits);
  if (check == null) return false;
  return digits[8] === String(check);
}

export function storeCountValid(value) {
  if (typeof value === 'string' && value.trim() === '') return false;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 100;
}

export function companyDetailsError(fields) {
  if (!String(fields?.companyName || '').trim()) return 'Firmanavn mangler.';
  if (!orgNumberValid(fields?.orgNumber)) return 'Organisasjonsnummeret må være 9 siffer med gyldig kontrollsiffer.';
  if (!String(fields?.contactName || '').trim()) return 'Kontaktperson mangler.';
  if (!String(fields?.phone || '').trim()) return 'Telefon mangler.';
  if (!storeCountValid(fields?.storeCount)) return 'Antall butikker må være et tall fra 1 til 100.';
  return '';
}

/**
 * Auth metadata for a business signup. full_name is the contact person.
 * The company name is stored separately and becomes organizations.name later.
 */
export function businessSignupMetadata(fields) {
  return {
    signup: 'self_serve',
    signup_kind: 'business',
    terms_accepted: 'true',
    role: 'user',
    full_name: String(fields?.contactName || '').trim(),
    company_name: String(fields?.companyName || '').trim(),
    org_number: orgNumberDigits(fields?.orgNumber),
    contact_phone: String(fields?.phone || '').trim(),
    store_count: String(Number(fields?.storeCount)),
  };
}

export function startOrganizationArgs(fields) {
  const company = String(fields?.companyName || '').trim();
  return {
    p_name: company,
    p_org_number: orgNumberDigits(fields?.orgNumber),
    p_phone: String(fields?.phone || '').trim(),
    p_store_name: company,
    p_contact_name: String(fields?.contactName || '').trim(),
    p_store_count: Number(fields?.storeCount),
  };
}

export function completeOrganizationArgs(fields) {
  const args = startOrganizationArgs(fields);
  return {
    p_name: args.p_name,
    p_org_number: args.p_org_number,
    p_contact_name: args.p_contact_name,
    p_phone: args.p_phone,
    p_store_count: args.p_store_count,
  };
}

/**
 * The completion screen is only for the organization admin, and only while
 * the organisation number is missing or invalid. Employees and impersonation
 * sessions are left alone.
 */
export function needsCompanyDetails(org, { userId, userEmail, impersonating } = {}) {
  if (impersonating || !org) return false;
  const byId = Boolean(userId) && org.admin_user_id === userId;
  const email = String(userEmail || '').trim().toLowerCase();
  const adminEmail = String(org.admin_email || '').trim().toLowerCase();
  const byEmail = Boolean(email) && email === adminEmail;
  if (!byId && !byEmail) return false;
  return !orgNumberValid(org.org_number);
}

export async function lookupCompanyName(orgNumber, fetchImpl = globalThis.fetch) {
  const digits = orgNumberDigits(orgNumber);
  if (!orgNumberValid(digits) || typeof fetchImpl !== 'function') return null;
  try {
    const response = await fetchImpl(`${BRREG_ENHET_URL}${digits}`);
    if (!response?.ok) return null;
    const body = await response.json();
    const name = typeof body?.navn === 'string' ? body.navn.trim() : '';
    return name || null;
  } catch {
    return null;
  }
}
