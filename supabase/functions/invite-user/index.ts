import { adminClient, handleOptions, json, requireUser } from "../_shared/auth.ts";
import { sendEmail } from "../_shared/email.ts";

const ROLES = new Set(["admin", "sub_admin", "butikksjef", "user"]);

// Replaces base44.users.inviteUser. Managers invite a colleague; the auth
// trigger copies metadata.role onto public.profiles.

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ error: "Metode ikke tillatt" }, 405);

  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    const [{ data: allowed }, { data: effectiveRole }] = await Promise.all([
      auth.client.rpc("can_assign_roles"),
      auth.client.rpc("effective_role"),
    ]);
    if (!allowed) return json({ error: "Bare administrator kan invitere og tildele roller" }, 403);

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || body.user_email || "").trim().toLowerCase();
    const role = ROLES.has(body.role) ? body.role : "user";
    if (role === "admin" && effectiveRole !== "admin") {
      return json({ error: "Bare administrator kan tildele administratorrollen" }, 403);
    }
    if (!email) return json({ error: "Mangler e-post" }, 400);

    const admin = adminClient();
    const site = (Deno.env.get("SITE_URL") || "").replace(/\/$/, "");
    // Supabase sin innebygde e-post har en grense på 2 e-poster i timen og
    // leverer bare til teammedlemmer. Lag invitasjonslenken uten at Supabase
    // sender noe, og send den selv via Resend.
    const { data, error } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        data: { role, full_name: body.full_name || "" },
        redirectTo: site ? `${site}/reset-password` : undefined,
      },
    });

    if (!error && data?.user && data.properties?.action_link) {
      const name = String(body.full_name || "").trim();
      const link = data.properties.action_link;
      const mailed = await sendEmail({
        to: email,
        subject: "Du er invitert til SkiftPro",
        text: `Hei${name ? " " + name : ""}!\n\nDu er invitert til SkiftPro. Trykk på lenken under for å velge passord og logge inn:\n\n${link}\n\nLenken er gyldig i 24 timer. Hvis den har gått ut, be lederen din sende en ny invitasjon.\n\nHilsen SkiftPro`,
      });
      if (!mailed.sent) {
        // Fjern brukeren som aldri fikk e-post, så et nytt forsøk kan lage ny lenke.
        await admin.auth.admin.deleteUser(data.user.id).catch(() => {});
        return json({ error: `E-posten ble ikke sendt (${mailed.reason || mailed.status || "ukjent"})` }, 502);
      }
      return json({ ok: true, id: data.user.id, email });
    }

    const { data: existing, error: lookupError } = await admin
      .from("profiles")
      .select("id, email")
      .ilike("email", email)
      .maybeSingle();
    if (lookupError) return json({ error: error?.message || lookupError.message }, 400);
    if (!existing) return json({ error: error?.message || "Invitasjonen feilet" }, 400);

    const { error: roleError } = await admin.from("profiles").update({ role }).eq("id", existing.id);
    if (roleError) return json({ error: roleError.message }, 500);
    await admin.auth.admin.updateUserById(existing.id, { user_metadata: { role } });
    return json({ ok: true, already_exists: true, id: existing.id, email });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Ukjent feil" }, 500);
  }
});
