type CountersignEvent = {
  event_type?: string;
  actor_id?: string | null;
  payload?: { name?: string; email?: string; user_id?: string } | null;
};

export function countersignerFromEvents(events: CountersignEvent[] | null | undefined): {
  userId: string | null;
  name: string | null;
  email: string | null;
} {
  const list = events || [];
  let chosen: CountersignEvent | undefined;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i]?.event_type === "motsignert") {
      chosen = list[i];
      break;
    }
  }
  const payload = chosen?.payload || {};
  return {
    userId: String(payload.user_id || chosen?.actor_id || "").trim() || null,
    name: String(payload.name || "").trim() || null,
    email: String(payload.email || "").trim() || null,
  };
}

export async function countersignerIdentity(
  admin: { from: (table: string) => any },
  events: CountersignEvent[] | null | undefined,
  employerSignedBy: string | null | undefined,
): Promise<{ userId: string | null; name: string | null; email: string | null }> {
  const fromEvent = countersignerFromEvents(events);
  const userId = String(employerSignedBy || fromEvent.userId || "").trim() || null;
  let name = fromEvent.name;
  let email = fromEvent.email;
  if ((!name || !email) && userId && !userId.startsWith("guest:")) {
    const profile = await admin.from("profiles").select("full_name, email").eq("id", userId).maybeSingle();
    name = name || String(profile.data?.full_name || "").trim() || null;
    email = email || String(profile.data?.email || "").trim() || null;
  }
  return { userId, name, email };
}
