import { adminClient, handleOptions, json, requireUser } from "../_shared/auth.ts";

const ROLES = new Set(["admin", "sub_admin", "butikksjef", "user"]);

// Replaces base44.users.inviteUser. Managers invite a colleague; the auth
// trigger copies metadata.role onto public.profiles.

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    const [{ data: superAdmin }, { data: manager }] = await Promise.all([
      auth.client.rpc("is_super_admin"),
      auth.client.rpc("is_manager"),
    ]);
    if (!superAdmin && !manager) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || body.user_email || "").trim().toLowerCase();
    const role = ROLES.has(body.role) ? body.role : "user";
    if (!email) return json({ error: "Missing email" }, 400);

    const admin = adminClient();
    const site = (Deno.env.get("SITE_URL") || "").replace(/\/$/, "");
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { role, full_name: body.full_name || "" },
      redirectTo: site ? `${site}/login` : undefined,
    });

    if (!error && data?.user) {
      return json({ ok: true, id: data.user.id, email });
    }

    const { data: existing, error: lookupError } = await admin
      .from("profiles")
      .select("id, email")
      .ilike("email", email)
      .maybeSingle();
    if (lookupError) return json({ error: error?.message || lookupError.message }, 400);
    if (!existing) return json({ error: error?.message || "Invite failed" }, 400);

    const { error: roleError } = await admin.from("profiles").update({ role }).eq("id", existing.id);
    if (roleError) return json({ error: roleError.message }, 500);
    await admin.auth.admin.updateUserById(existing.id, { user_metadata: { role } });
    return json({ ok: true, already_exists: true, id: existing.id, email });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
