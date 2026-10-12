#!/usr/bin/env node
/**
 * Export Base44 entities and import them into Supabase.
 *
 * Nothing in this script runs unless you execute it. It never embeds secrets.
 *
 * Export from the Base44 API (needs a user access token from the running app):
 *   BASE44_APP_ID=... BASE44_ACCESS_TOKEN=... \
 *   node scripts/import-base44.mjs --from-api --save ./data/base44
 *
 * Import a saved directory (service role stays on your machine):
 *   SUPABASE_URL=https://iobsolszrmigdmdydfbe.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/import-base44.mjs --from-dir ./data/base44
 *
 * Add --dry-run to print counts without writing.
 * Add --invite to email each user an invite instead of creating a confirmed user.
 *
 * Auth users cannot keep Base44 ids. The script creates a Supabase auth user per
 * email, then rewrites admin_user_id and created_by to the new id. Worker, shift,
 * and other entity ids are preserved. Imported users must set a password with
 * "Glemt passord" on /login unless you pass --invite.
 */

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ENTITIES = [
  {
    name: 'User',
    table: 'profiles',
    users: true,
    columns: ['id', 'email', 'full_name', 'role', 'created_date', 'updated_date', 'created_by'],
  },
  {
    name: 'Organization',
    table: 'organizations',
    columns: ['id', 'name', 'org_number', 'customer_number', 'contact_name', 'contact_email', 'contact_phone', 'admin_user_id', 'admin_email', 'status', 'plan', 'notes', 'created_date', 'updated_date', 'created_by'],
  },
  {
    name: 'Worker',
    table: 'workers',
    columns: ['id', 'org_id', 'name', 'email', 'phone', 'hourly_rate', 'position', 'status', 'color', 'teams', 'role', 'team_roles', 'employment_type', 'employment_percentage', 'disabled_extras', 'can_see_resultat', 'created_date', 'updated_date', 'created_by'],
  },
  {
    name: 'WorkplaceSetting',
    table: 'workplace_settings',
    columns: [
      'id', 'org_id', 'workplace_name', 'latitude', 'longitude', 'radius_meters', 'full_time_hours_per_week', 'active_teams_count',
      ...Array.from({ length: 10 }, (_, i) => {
        const n = i + 1;
        return [
          `team${n}_name`,
          `team${n}_sunday_extra_type`, `team${n}_sunday_extra_amount`,
          `team${n}_holiday_extra_type`, `team${n}_holiday_extra_amount`,
          `team${n}_latitude`, `team${n}_longitude`, `team${n}_radius_meters`,
        ];
      }).flat(),
      'created_date', 'updated_date', 'created_by',
    ],
  },
  { name: 'Shift', table: 'shifts', columns: ['id', 'org_id', 'worker_id', 'worker_name', 'date', 'start_time', 'end_time', 'break_minutes', 'notes', 'shift_label', 'status', 'team', 'published', 'created_date', 'updated_date', 'created_by'] },
  { name: 'Contract', table: 'contracts', columns: ['id', 'org_id', 'worker_id', 'worker_name', 'contract_type', 'status', 'org_name', 'worker_position', 'hourly_rate', 'employment_percentage', 'weekly_hours', 'overtime_hours', 'full_time_hours_per_week', 'start_date', 'end_date', 'week_number', 'year', 'reason', 'notice_period_months', 'pdf_url', 'approved_by_worker_id', 'approved_at', 'generated_automatically', 'created_date', 'updated_date', 'created_by'] },
  { name: 'Task', table: 'tasks', columns: ['id', 'org_id', 'title', 'description', 'assigned_worker_id', 'assigned_worker_ids', 'assigned_worker_name', 'assigned_worker_names', 'team', 'due_date', 'priority', 'status', 'completed_by_id', 'completed_at', 'image_url', 'completion_image_url', 'created_date', 'updated_date', 'created_by'] },
  { name: 'RecurringTask', table: 'recurring_tasks', columns: ['id', 'org_id', 'title', 'description', 'team', 'assigned_worker_ids', 'assigned_worker_names', 'priority', 'recurrence', 'day_of_week', 'is_active', 'image_url', 'created_date', 'updated_date', 'created_by'] },
  { name: 'Holiday', table: 'holidays', columns: ['id', 'org_id', 'name', 'date', 'pay_multiplier', 'extra_type', 'extra_amount', 'created_date', 'updated_date', 'created_by'] },
  { name: 'Stamp', table: 'stamps', columns: ['id', 'org_id', 'worker_id', 'worker_name', 'date', 'stamp_in', 'stamp_out', 'stamp_in_lat', 'stamp_in_lng', 'stamp_out_lat', 'stamp_out_lng', 'is_within_range', 'distance_meters', 'created_date', 'updated_date', 'created_by'] },
  { name: 'Availability', table: 'availability', columns: ['id', 'org_id', 'worker_id', 'worker_name', 'date', 'status', 'note', 'created_date', 'updated_date', 'created_by'] },
  { name: 'ShiftSwap', table: 'shift_swaps', columns: ['id', 'org_id', 'requester_worker_id', 'requester_worker_name', 'requester_shift_id', 'requester_shift_date', 'requester_shift_start', 'requester_shift_end', 'target_worker_id', 'target_worker_name', 'target_shift_id', 'target_shift_date', 'target_shift_start', 'target_shift_end', 'status', 'notes', 'team', 'created_date', 'updated_date', 'created_by'] },
  { name: 'Dagsoppgjor', table: 'dagsoppgjor', columns: ['id', 'org_id', 'butikk', 'butikk_nr', 'dato', 'month', 'year', 'pose_nummer', 'skannet_pose_nummer', 'ansatt_navn', 'ansatt_id', 'seddel_1000_antall', 'seddel_1000_sum', 'seddel_500_antall', 'seddel_500_sum', 'seddel_200_antall', 'seddel_200_sum', 'seddel_100_antall', 'seddel_100_sum', 'seddel_50_antall', 'seddel_50_sum', 'mynt_antall', 'mynt_sum', 'kontantsalg_kasse', 'droppet_belop', 'kontrollert_belop', 'bank_mottatt_belop', 'differanse_mot_kontroll', 'differanse_mot_bank', 'total_dagsdifferanse', 'kommentar', 'status', 'updated_by', 'created_date', 'updated_date', 'created_by'] },
  { name: 'Loddtelling', table: 'loddtelling', columns: ['id', 'org_id', 'butikk', 'uke_nummer', 'year', 'loddtype', 'loddtype_label', 'man_inng', 'man_akt', 'man_salg', 'tir_inng', 'tir_akt', 'tir_salg', 'ons_inng', 'ons_akt', 'ons_salg', 'tor_inng', 'tor_akt', 'tor_salg', 'fre_inng', 'fre_akt', 'fre_salg', 'lor_inng', 'lor_akt', 'lor_salg', 'son_inng', 'son_akt', 'son_salg', 'slutt_fysisk', 'differanse', 'kommentar', 'updated_by', 'created_date', 'updated_date', 'created_by'] },
  { name: 'MonthlyResult', table: 'monthly_results', columns: ['id', 'org_id', 'year', 'month', 'team', 'db1', 'svinn', 'svinn_pct', 'vareavskrivning', 'vareavskrivning_pct', 'franchiseavgift', 'franchiseavgift_pct', 'driftskostnader', 'driftskostnader_pct', 'created_date', 'updated_date', 'created_by'] },
  { name: 'StaffingBudget', table: 'staffing_budgets', columns: ['id', 'org_id', 'team', 'week_override', 'year_override', 'hour', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'created_date', 'updated_date', 'created_by'] },
];

const DATE_OR_TS = new Set([
  'date', 'start_date', 'end_date', 'due_date', 'dato',
  'requester_shift_date', 'target_shift_date',
  'stamp_in', 'stamp_out', 'approved_at', 'completed_at',
  'created_date', 'updated_date',
]);

const USER_ID_FIELDS = new Set(['created_by', 'admin_user_id']);
const ROLES = new Set(['admin', 'sub_admin', 'butikksjef', 'user']);

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function asArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.results)) return payload.results;
  throw new Error('Expected a JSON array of records');
}

function blankToNull(value) {
  if (value === '' || value === undefined) return null;
  return value;
}

function cleanRecord(entity, record, userMap) {
  const source = { ...record };
  if (!source.id && source._id) source.id = source._id;
  if (!source.created_by && source.created_by_id) source.created_by = source.created_by_id;
  if (source.full_name == null && source.fullName) source.full_name = source.fullName;

  const row = {};
  for (const column of entity.columns) {
    if (!(column in source)) continue;
    let value = source[column];
    if (DATE_OR_TS.has(column)) value = blankToNull(value);
    if (typeof value === 'string' && value.trim() === '' && column.endsWith('_id')) value = null;
    if (USER_ID_FIELDS.has(column) && value && userMap.has(value)) value = userMap.get(value);
    if (column === 'role' && value && !ROLES.has(value)) value = 'user';
    row[column] = value;
  }
  if (!row.id) return null;
  return row;
}

async function fetchEntity(server, appId, token, name) {
  const rows = [];
  const limit = 500;
  for (let skip = 0; ; skip += limit) {
    const url = new URL(`${server.replace(/\/$/, '')}/api/apps/${appId}/entities/${name}`);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('skip', String(skip));
    url.searchParams.set('sort', 'created_date');
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-App-Id': appId,
      },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${name} export failed (${response.status}): ${text.slice(0, 400)}`);
    }
    const batch = asArray(await response.json());
    rows.push(...batch);
    if (batch.length < limit) break;
  }
  return rows;
}

async function loadDir(dir) {
  const data = {};
  for (const entity of ENTITIES) {
    const file = path.join(dir, `${entity.name}.json`);
    try {
      data[entity.name] = asArray(JSON.parse(await readFile(file, 'utf8')));
    } catch (error) {
      if (error.code === 'ENOENT') {
        data[entity.name] = [];
        continue;
      }
      throw error;
    }
  }
  return data;
}

async function saveDir(dir, data) {
  await mkdir(dir, { recursive: true });
  for (const [name, rows] of Object.entries(data)) {
    await writeFile(path.join(dir, `${name}.json`), JSON.stringify(rows, null, 2));
  }
}

async function listAuthUsers(admin) {
  const users = [];
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    users.push(...(data.users || []));
    if (!data.users || data.users.length < 200) break;
  }
  return users;
}

async function ensureAuthUser(admin, record, { invite, siteUrl, byEmail }) {
  const email = String(record.email || '').trim().toLowerCase();
  if (!email) return null;
  const role = ROLES.has(record.role) ? record.role : 'user';
  const fullName = record.full_name || record.fullName || '';
  const existing = byEmail.get(email);
  if (existing) {
    await admin.from('profiles').update({
      role,
      full_name: fullName || null,
      email,
    }).eq('id', existing.id);
    return existing.id;
  }

  if (invite) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { role, full_name: fullName },
      redirectTo: siteUrl ? `${siteUrl.replace(/\/$/, '')}/login` : undefined,
    });
    if (error) throw new Error(`Invite ${email} failed: ${error.message}`);
    byEmail.set(email, data.user);
    return data.user.id;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: randomBytes(24).toString('base64url'),
    user_metadata: { role, full_name: fullName },
  });
  if (error) throw new Error(`Create ${email} failed: ${error.message}`);
  await admin.from('profiles').update({ role, full_name: fullName || null, email }).eq('id', data.user.id);
  byEmail.set(email, data.user);
  return data.user.id;
}

async function upsertTable(admin, table, rows) {
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await admin.from(table).upsert(chunk, { onConflict: 'id' });
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
  }
}

async function main() {
  const fromApi = hasFlag('--from-api');
  const fromDir = argValue('--from-dir');
  const save = argValue('--save');
  const dryRun = hasFlag('--dry-run');
  const invite = hasFlag('--invite');

  if (!fromApi && !fromDir) {
    console.error('Pass --from-api or --from-dir <folder>. See the header comment.');
    process.exit(1);
  }

  let data = {};
  if (fromApi) {
    const appId = process.env.BASE44_APP_ID;
    const token = process.env.BASE44_ACCESS_TOKEN;
    const server = process.env.BASE44_SERVER_URL || 'https://base44.app';
    if (!appId || !token) {
      throw new Error('BASE44_APP_ID and BASE44_ACCESS_TOKEN are required for --from-api');
    }
    for (const entity of ENTITIES) {
      process.stdout.write(`export ${entity.name}... `);
      data[entity.name] = await fetchEntity(server, appId, token, entity.name);
      console.log(data[entity.name].length);
    }
    if (save) {
      await saveDir(save, data);
      console.log(`saved export to ${save}`);
    }
  } else {
    data = await loadDir(fromDir);
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    if (fromApi && save && !fromDir) {
      console.log('Export saved. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to import.');
      return;
    }
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to import');
  }

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const userMap = new Map();
  const users = data.User || [];
  console.log(`users: ${users.length}`);
  if (!dryRun) {
    const byEmail = new Map();
    for (const user of await listAuthUsers(admin)) {
      if (user.email) byEmail.set(user.email.toLowerCase(), user);
    }
    for (const record of users) {
      const oldId = record.id || record._id;
      const newId = await ensureAuthUser(admin, record, {
        invite,
        siteUrl: process.env.SITE_URL || '',
        byEmail,
      });
      if (oldId && newId) userMap.set(oldId, newId);
    }
    console.log(`auth users mapped: ${userMap.size}`);
  }

  for (const entity of ENTITIES) {
    if (entity.users) continue;
    const rows = (data[entity.name] || [])
      .map((record) => cleanRecord(entity, record, userMap))
      .filter(Boolean);
    console.log(`${entity.table}: ${rows.length}`);
    if (!dryRun && rows.length) await upsertTable(admin, entity.table, rows);
  }

  console.log(dryRun ? 'dry run complete' : 'import complete');
  if (!invite && !dryRun && users.length) {
    console.log('Imported users have no password. Ask them to use "Glemt passord" on /login, or rerun with --invite.');
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
