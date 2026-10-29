// Narvesen Demo AS. These accounts exist only for live meetings.
// The domain is reserved (.invalid) and cannot receive mail.

export const DEMO_ORG_ID = "de30000000000000000000a1";
export const DEMO_EMAIL_SUFFIX = "@demo.skiftpro.invalid";

export const DEMO_TARGETS = {
  admin: {
    userId: "02582093-44f8-4db6-91d1-295c6b062d80",
    email: "demo.admin@demo.skiftpro.invalid",
  },
  sub_admin: {
    userId: "09e0fbd5-df2b-420c-a8a1-e7462278bd16",
    email: "demo.subadmin@demo.skiftpro.invalid",
  },
  butikksjef: {
    userId: "8baa0464-d9fe-40e3-bf9f-95c7e7cb204c",
    email: "demo.butikksjef@demo.skiftpro.invalid",
  },
  ansatt: {
    userId: "61c7440a-6555-48ed-a6f0-3783e68377ef",
    email: "demo.ansatt@demo.skiftpro.invalid",
  },
  ekstrahjelp: {
    userId: "03d1b167-7dd8-4ad0-be0e-c93bc9932be7",
    email: "demo.ekstrahjelp@demo.skiftpro.invalid",
  },
};

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

// The domain must be exactly @demo.skiftpro.invalid. A longer host such as
// demo.skiftpro.invalid.evil.com does not qualify.
export function isDemoEmail(email) {
  const value = normalizeEmail(email);
  const at = value.lastIndexOf("@");
  if (at <= 0) return false;
  return value.slice(at) === DEMO_EMAIL_SUFFIX;
}

export function requestedTarget(body) {
  if (!body || typeof body !== "object") return null;
  const key = String(body.target || "").trim().toLowerCase();
  const known = DEMO_TARGETS[key];
  if (!known || !isDemoEmail(known.email)) return null;
  return { key, email: known.email, userId: known.userId };
}

export function callerMaySwitch({ isSuperAdmin, orgIds }) {
  if (isSuperAdmin === true) return true;
  return Array.isArray(orgIds) && orgIds.includes(DEMO_ORG_ID);
}

// Target must be one of the pinned demo accounts, on the reserved domain,
// and actually a member of the demo organization.
export function targetMaySignIn({ email, userId, orgIds }) {
  const normalized = normalizeEmail(email);
  if (!isDemoEmail(normalized)) return false;
  const known = Object.values(DEMO_TARGETS).find((item) => item.email === normalized);
  if (!known || known.userId !== userId) return false;
  return Array.isArray(orgIds) && orgIds.includes(DEMO_ORG_ID);
}

export function escapeIlike(value) {
  return String(value).replace(/[\\%_]/g, (char) => `\\${char}`);
}
