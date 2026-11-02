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

// When a superadmin in support mode switches into a demo role, their own
// session is parked here so they can come back without logging in again.
export const SUPERADMIN_RETURN_KEY = "skiftpro_demo_superadmin_return";

export function saveSuperadminReturn(storage, session) {
  if (!storage || typeof session?.refresh_token !== "string") return false;
  if (isDemoEmail(session?.user?.email)) return false;
  storage.setItem(SUPERADMIN_RETURN_KEY, JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    email: normalizeEmail(session?.user?.email),
  }));
  return true;
}

export function readSuperadminReturn(storage) {
  try {
    const raw = storage?.getItem(SUPERADMIN_RETURN_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (typeof value?.refresh_token !== "string" || isDemoEmail(value?.email)) return null;
    return value;
  } catch {
    return null;
  }
}

// Restores the parked superadmin session and puts them back in support
// mode for the demo org. The parked token is removed whatever happens.
export async function returnToSuperadmin({ storage, setSession, signOut, reload }) {
  const saved = readSuperadminReturn(storage);
  storage?.removeItem(SUPERADMIN_RETURN_KEY);
  if (!saved) throw new Error("Fant ingen superadmin-økt å gå tilbake til");
  const { data, error } = await setSession({
    access_token: saved.access_token,
    refresh_token: saved.refresh_token,
  });
  if (error || normalizeEmail(data?.user?.email || data?.session?.user?.email) !== saved.email) {
    if (signOut) await signOut();
    if (reload) reload("/login");
    throw new Error("Superadmin-økten var utløpt. Logg inn på nytt.");
  }
  storage?.setItem("impersonate_org_id", DEMO_ORG_ID);
  if (reload) reload("/Dashboard");
  return true;
}

export function shouldShowDemoBar({ email, orgId, impersonating = false } = {}) {
  // Impersonation is a superadmin looking into a customer. It is not membership,
  // and switching would replace the superadmin session.
  // Exception: a superadmin in support mode for the demo org itself.
  if (impersonating) return String(orgId || "").trim() === DEMO_ORG_ID;
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
