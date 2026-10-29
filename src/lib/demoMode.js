import {
  DEMO_ORG_ID,
  DEMO_TARGETS,
  isDemoEmail,
  normalizeEmail,
} from "../../supabase/functions/_shared/demoPolicy.js";

export { DEMO_ORG_ID, isDemoEmail };

export const DEMO_ROLE_UI = [
  {
    key: "admin",
    label: "Admin",
    access: "Hele kunden: ansatte, vaktplan, lønn, kontrakter og innstillinger.",
  },
  {
    key: "sub_admin",
    label: "Regionsleder",
    access: "Regionen: ansatte, vaktplan, lønn og kontrakter. Ikke kundeoversikten.",
  },
  {
    key: "butikksjef",
    label: "Butikksjef",
    access: "Egen butikk: vaktplan, kontrakter og innstillinger. Ikke ansatte eller lønn.",
  },
  {
    key: "ansatt",
    label: "Ansatt",
    access: "Egen side: vakter og stempling. Ikke lønn, ansatte eller innstillinger.",
  },
  {
    key: "ekstrahjelp",
    label: "Ekstrahjelp",
    access: "Kun egne vakter og stempling. Ingen fast stilling, lønn eller personal.",
  },
];

export function demoRoles() {
  return DEMO_ROLE_UI.map((role) => {
    const account = DEMO_TARGETS[role.key];
    return {
      ...role,
      email: account.email,
      userId: account.userId,
    };
  });
}

export function shouldShowDemoBar({ email, orgId, impersonating = false } = {}) {
  // Impersonation is a superadmin looking into a customer. It is not membership,
  // and switching would replace the superadmin session.
  if (impersonating) return false;
  return isDemoEmail(email) || String(orgId || "").trim() === DEMO_ORG_ID;
}

export function activeDemoRole(email) {
  const normalized = normalizeEmail(email);
  return demoRoles().find((role) => role.email === normalized) || null;
}

export function demoHomePath(targetKey) {
  return targetKey === "admin" ? "/Dashboard" : "/WorkerPortal";
}

// Applies a session returned by demo-switch. Refuses any user that is not
// the pinned demo account for the requested role.
export async function switchDemoRole(targetKey, { invoke, setSession, reload, clearPassword }) {
  const role = demoRoles().find((item) => item.key === targetKey);
  if (!role) throw new Error("Ukjent demorolle");

  const response = await invoke("demo-switch", { target: targetKey });
  const session = response?.data || response;
  const email = normalizeEmail(session?.user?.email);
  if (
    email !== role.email
    || session?.user?.id !== role.userId
    || typeof session?.access_token !== "string"
    || typeof session?.refresh_token !== "string"
  ) {
    throw new Error("Serveren returnerte feil bruker");
  }

  if (clearPassword) clearPassword();
  const { error } = await setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (error) throw error;
  if (reload) reload(demoHomePath(targetKey));
  return session;
}
