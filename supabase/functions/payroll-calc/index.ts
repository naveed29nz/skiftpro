import { handleOptions, json, requireUser } from "../_shared/auth.ts";
import { payrollBreakdowns } from "../../../src/payroll/computePayroll.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function teamColumns(): string {
  const cols = ["id", "org_id", "full_time_hours_per_week"];
  for (let n = 1; n <= 10; n += 1) {
    cols.push(
      `team${n}_auto_break`,
      `team${n}_break_rules`,
      `team${n}_night_enabled`,
      `team${n}_night_from`,
      `team${n}_night_to`,
    );
  }
  return cols.join(",");
}

function overlay(rows: Record<string, unknown>[] | null, extra: Record<string, unknown>[] | null) {
  if (!rows) return [];
  if (!extra?.length) return rows;
  const byId = new Map(extra.map((row) => [row.id, row]));
  return rows.map((row) => ({ ...row, ...(byId.get(row.id) || {}) }));
}

async function readRows(
  client: { from: (table: string) => any },
  table: string,
  columns: string,
  filter: (query: any) => any,
) {
  const first = await filter(client.from(table).select(columns));
  if (!first.error) return first.data || [];
  return [];
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ error: "Metode ikke tillatt" }, 405);

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
  const orgId = typeof body.orgId === "string" ? body.orgId : "";
  const start = typeof body.start === "string" ? body.start : "";
  const end = typeof body.end === "string" ? body.end : "";
  if (!orgId || !DATE.test(start) || !DATE.test(end) || start > end) {
    return json({ error: "orgId, start og end må være datoer" }, 400);
  }

  const { client } = auth;

  const shiftQuery = await client
    .from("shifts")
    .select("id, org_id, worker_id, date, start_time, end_time, break_minutes, break_manual, shift_label, all_day, team, status")
    .eq("org_id", orgId)
    .gte("date", start)
    .lte("date", end)
    .limit(5000);
  if (shiftQuery.error) return json({ error: shiftQuery.error.message }, 400);

  let workers = await readRows(
    client,
    "workers",
    "id, org_id, name, position, status, teams, disabled_extras, hourly_rate",
    (query) => query.eq("org_id", orgId),
  );
  if (workers.length === 0) {
    workers = await readRows(
      client,
      "workers",
      "id, org_id, name, position, status, teams, disabled_extras",
      (query) => query.eq("org_id", orgId),
    );
  }

  const { data: rates } = await client.rpc("worker_hourly_rates");
  const { data: ownWages } = await client.rpc("my_wage_info");
  workers = overlay(workers, rates || []);
  const ownRate = (ownWages || []).find((row: { kind?: string }) => row.kind === "worker");
  if (ownRate?.id) {
    workers = workers.map((worker) => worker.id === ownRate.id
      ? { ...worker, hourly_rate: ownRate.hourly_rate ?? worker.hourly_rate }
      : worker);
  }

  let holidays = await readRows(
    client,
    "holidays",
    "id, org_id, name, date",
    (query) => query.eq("org_id", orgId),
  );
  const { data: holidayRules } = await client.rpc("holiday_wage_rules");
  holidays = overlay(holidays, holidayRules || []);
  for (const row of ownWages || []) {
    if (row.kind === "holiday" && row.id) {
      holidays = holidays.map((holiday) => holiday.id === row.id
        ? { ...holiday, pay_multiplier: row.pay_multiplier, extra_type: row.extra_type, extra_amount: row.extra_amount }
        : holiday);
    }
  }

  let settingsRows = await readRows(
    client,
    "workplace_settings",
    teamColumns(),
    (query) => query.eq("org_id", orgId).limit(1),
  );
  const { data: wageRules } = await client.rpc("workplace_wage_rules");
  settingsRows = overlay(settingsRows, wageRules || []);
  const ownWorkplace = (ownWages || []).find((row: { kind?: string }) => row.kind === "workplace");
  if (ownWorkplace?.workplace_extras && settingsRows[0]) {
    settingsRows = [{ ...settingsRows[0], ...ownWorkplace.workplace_extras }];
  }

  const breakdowns = payrollBreakdowns({
    shifts: shiftQuery.data || [],
    workers,
    holidays,
    workplace: settingsRows[0] || null,
  });

  return json({
    breakdowns,
    truncated: (shiftQuery.data || []).length >= 5000,
  });
});
