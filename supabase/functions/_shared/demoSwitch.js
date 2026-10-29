import {
  DEMO_TARGETS,
  callerMaySwitch,
  escapeIlike,
  isDemoEmail,
  normalizeEmail,
  requestedTarget,
  targetMaySignIn,
} from "./demoPolicy.js";

function rowsOf(result) {
  if (!result || result.error) {
    throw new Error("Kunne ikke lese demotilhørighet");
  }
  return result.data || [];
}

export async function organizationAdminOrgIds(db, { userId, email }) {
  const ids = new Set();
  if (userId) {
    const result = await db.from("organizations").select("id").eq("admin_user_id", userId);
    for (const row of rowsOf(result)) {
      if (row?.id) ids.add(row.id);
    }
  }
  const normalized = normalizeEmail(email);
  if (normalized) {
    const result = await db
      .from("organizations")
      .select("id, admin_email")
      .ilike("admin_email", escapeIlike(normalized));
    for (const row of rowsOf(result)) {
      if (row?.id && normalizeEmail(row.admin_email) === normalized) ids.add(row.id);
    }
  }
  return [...ids];
}

export async function workerOrgIds(db, { email }) {
  const normalized = normalizeEmail(email);
  if (!normalized) return [];
  const result = await db.from("workers").select("org_id, email").ilike("email", escapeIlike(normalized));
  const ids = new Set();
  for (const row of rowsOf(result)) {
    const orgId = typeof row?.org_id === "string" ? row.org_id.trim() : "";
    if (orgId && normalizeEmail(row.email) === normalized) ids.add(orgId);
  }
  return [...ids];
}

export async function memberOrgIds(db, identity) {
  const [adminOrgs, staffOrgs] = await Promise.all([
    organizationAdminOrgIds(db, identity),
    workerOrgIds(db, identity),
  ]);
  return [...new Set([...adminOrgs, ...staffOrgs])];
}

// Same rule as public.is_super_admin(): platform admin with no organization link.
export async function accountIsSuperAdmin(db, { userId, email, role }) {
  if (role !== "admin" || !userId) return false;
  const linked = await organizationAdminOrgIds(db, { userId, email });
  return linked.length === 0;
}

export async function loadDemoTarget(db, target) {
  const authResult = await db.auth.admin.getUserById(target.userId);
  const authUser = authResult?.data?.user;
  if (authResult?.error || !authUser) {
    return { error: "Demobrukeren finnes ikke", status: 404 };
  }
  if (authUser.id !== target.userId || normalizeEmail(authUser.email) !== target.email || !isDemoEmail(authUser.email)) {
    return { error: "Demobrukeren er ikke tilgjengelig", status: 403 };
  }

  const profileResult = await db.from("profiles").select("id, email").eq("id", target.userId).maybeSingle();
  if (profileResult?.error || !profileResult?.data) {
    return { error: "Demobrukeren finnes ikke", status: 404 };
  }
  const profile = profileResult.data;
  if (profile.id !== target.userId || normalizeEmail(profile.email) !== target.email) {
    return { error: "Demobrukeren er ikke tilgjengelig", status: 403 };
  }

  const orgIds = await memberOrgIds(db, { userId: target.userId, email: target.email });
  if (!targetMaySignIn({ email: profile.email, userId: profile.id, orgIds })) {
    return { error: "Demobrukeren tilhører ikke demokunden", status: 403 };
  }
  return { email: target.email, userId: target.userId };
}

// Admin generateLink creates the one-time token and does not send email.
// verifyOtp consumes it here, so the link and the code never leave the server.
export async function exchangeDemoSession(admin, anon, email) {
  const normalized = normalizeEmail(email);
  const known = Object.values(DEMO_TARGETS).find((item) => item.email === normalized);
  if (!known || !isDemoEmail(normalized)) return { rejected: true };

  const generated = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: known.email,
  });
  const properties = generated?.data?.properties;
  if (generated?.error || !properties) return { error: true };

  let verified;
  if (properties.hashed_token) {
    const type = properties.verification_type === "email" ? "email" : "magiclink";
    verified = await anon.auth.verifyOtp({
      token_hash: properties.hashed_token,
      type,
    });
  } else if (properties.email_otp) {
    verified = await anon.auth.verifyOtp({
      email: known.email,
      token: properties.email_otp,
      type: "email",
    });
  } else {
    return { error: true };
  }

  const session = verified?.data?.session;
  const sessionUser = session?.user || verified?.data?.user;
  if (
    verified?.error
    || !session
    || typeof session.access_token !== "string"
    || typeof session.refresh_token !== "string"
    || !session.access_token
    || !session.refresh_token
    || sessionUser?.id !== known.userId
    || normalizeEmail(sessionUser?.email) !== known.email
  ) {
    return { rejected: true };
  }

  return {
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in ?? null,
      token_type: typeof session.token_type === "string" ? session.token_type : "bearer",
      user: { id: known.userId, email: known.email },
    },
  };
}

async function readJson(req) {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

export async function handleDemoSwitch(req, deps) {
  try {
    const opt = deps.handleOptions(req);
    if (opt) return opt;
    if (req.method !== "POST") return deps.json({ error: "Metode ikke tillatt" }, 405);

    const auth = await deps.requireUser(req);
    if (auth instanceof Response) return auth;

    const target = requestedTarget(await readJson(req));
    if (!target) return deps.json({ error: "Ukjent demorolle" }, 400);

    const db = deps.adminClient();
    const caller = {
      userId: auth.user?.id || "",
      email: auth.user?.email || auth.profile?.email || "",
      role: auth.profile?.role || "",
    };
    const [callerOrgs, superAdmin] = await Promise.all([
      memberOrgIds(db, caller),
      accountIsSuperAdmin(db, caller),
    ]);
    if (!callerMaySwitch({ isSuperAdmin: superAdmin, orgIds: callerOrgs })) {
      return deps.json({ error: "Demo-modus er bare for demokunden" }, 403);
    }

    const loaded = await loadDemoTarget(db, target);
    if (loaded.error) return deps.json({ error: loaded.error }, loaded.status);

    const exchanged = await exchangeDemoSession(db, deps.anonClient(), loaded.email);
    if (exchanged.rejected) return deps.json({ error: "Demobrukeren er ikke tilgjengelig" }, 403);
    if (!exchanged.session) return deps.json({ error: "Kunne ikke bytte demobruker" }, 500);

    return deps.json({
      ok: true,
      target: target.key,
      access_token: exchanged.session.access_token,
      refresh_token: exchanged.session.refresh_token,
      expires_in: exchanged.session.expires_in,
      token_type: exchanged.session.token_type,
      user: exchanged.session.user,
    });
  } catch {
    return deps.json({ error: "Kunne ikke bytte demobruker" }, 500);
  }
}
