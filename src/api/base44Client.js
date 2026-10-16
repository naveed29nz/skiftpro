import { supabase } from '@/api/supabaseClient';
import { applyClauses, compileFilter, parseSort } from '@/api/entityQuery';

/**
 * Drop-in replacement for the Base44 client used across the app.
 * Pages keep calling base44.entities.X.list/filter/get/create/update/delete.
 */

export const ENTITY_TABLES = {
  User: 'profiles',
  Organization: 'organizations',
  Worker: 'workers',
  Shift: 'shifts',
  WorkplaceSetting: 'workplace_settings',
  Contract: 'contracts',
  EmployerSetting: 'employer_settings',
  Task: 'tasks',
  RecurringTask: 'recurring_tasks',
  Holiday: 'holidays',
  Stamp: 'stamps',
  StampCorrection: 'stamp_corrections',
  PushSubscription: 'push_subscriptions',
  ShiftSwap: 'shift_swaps',
  Dagsoppgjor: 'dagsoppgjor',
  Loddtelling: 'loddtelling',
  Availability: 'availability',
  MonthlyResult: 'monthly_results',
  StaffingBudget: 'staffing_budgets',
};

const FUNCTION_NAMES = {
  updateContractStatus: 'update-contract-status',
  generateContractPDF: 'generate-contract-pdf',
  generateRecurringTasks: 'generate-recurring-tasks',
  checkOvertimeAndGenerateContract: 'check-overtime-and-generate-contract',
  signContract: 'sign-contract',
};

const DATE_FIELDS = new Set([
  'date',
  'start_date',
  'end_date',
  'due_date',
  'dato',
  'requester_shift_date',
  'target_shift_date',
  'birth_date',
  'tiltredelsesdato',
  'opphorsdato',
]);

const TIMESTAMP_FIELDS = new Set([
  'stamp_in',
  'stamp_out',
  'approved_at',
  'completed_at',
  'created_date',
  'updated_date',
]);

const PAGE_SIZE = 1000;

function apiError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function toError(error, status = 400) {
  if (!error) return apiError('Forespørselen feilet', status);
  if (error instanceof Error && error.status) return error;
  const err = apiError(error.message || 'Forespørselen feilet', error.code === 'PGRST116' ? 404 : status);
  err.details = error;
  return err;
}

export function normalizeRow(row) {
  if (!row || typeof row !== 'object') return row;
  return {
    ...row,
    _id: row.id,
    created_by_id: row.created_by ?? null,
  };
}

function withImpersonatedOrg(table, payload) {
  if (table === 'profiles' || table === 'organizations') return payload;
  if (payload.org_id) return payload;
  if (typeof localStorage === 'undefined') return payload;
  const orgId = localStorage.getItem('impersonate_org_id');
  if (!orgId) return payload;
  return { ...payload, org_id: orgId };
}

export function sanitizeWrite(data, { isUpdate = false } = {}) {
  const out = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (value === undefined) continue;
    if (key === '_id' || key === 'created_by_id') continue;
    if (isUpdate && ['id', 'created_by', 'created_date', 'updated_date'].includes(key)) continue;
    if (!isUpdate && key === 'updated_date') continue;
    if (!isUpdate && key === 'id' && (value === '' || value == null)) continue;
    let next = value;
    if ((DATE_FIELDS.has(key) || TIMESTAMP_FIELDS.has(key)) && next === '') next = null;
    out[key] = next;
  }
  return out;
}

const STORE_WORKPLACE_COLUMNS = [];
for (let i = 1; i <= 10; i += 1) {
  STORE_WORKPLACE_COLUMNS.push(
    `team${i}_address`,
    `team${i}_apningstid_fra`,
    `team${i}_apningstid_til`,
    `team${i}_apningstider`,
    `team${i}_notes`,
  );
}

function withoutStoreWorkplaceColumns(payload) {
  const next = { ...payload };
  for (const column of STORE_WORKPLACE_COLUMNS) delete next[column];
  return next;
}

function withoutEmployerSignatory(payload) {
  const next = { ...payload };
  delete next.employer_signatory_user_id;
  delete next.admin_signerer_navn;
  return next;
}

function workplaceColumns() {
  const cols = ['id', 'org_id', 'workplace_name', 'workplace_address', 'apningstid_fra', 'apningstid_til', 'latitude', 'longitude', 'radius_meters', 'full_time_hours_per_week', 'active_teams_count'];
  for (let i = 1; i <= 10; i += 1) {
    cols.push(
      `team${i}_name`,
      `team${i}_sunday_extra_type`,
      `team${i}_sunday_extra_amount`,
      `team${i}_holiday_extra_type`,
      `team${i}_holiday_extra_amount`,
      `team${i}_latitude`,
      `team${i}_longitude`,
      `team${i}_radius_meters`,
      `team${i}_address`,
      `team${i}_apningstid_fra`,
      `team${i}_apningstid_til`,
      `team${i}_apningstider`,
      `team${i}_notes`,
    );
  }
  cols.push('created_date', 'updated_date', 'created_by');
  return cols;
}

const workplaceWageFields = workplaceColumns().filter((col) => /_(sunday|holiday)_extra_/.test(col));

// Columns the wage migration stops butikksjef and employees from selecting.
const WAGE_FIELDS = {
  workers: ['hourly_rate'],
  contracts: ['hourly_rate'],
  holidays: ['pay_multiplier', 'extra_type', 'extra_amount'],
  workplace_settings: workplaceWageFields,
};

const SAFE_COLUMNS = {
  workers: ['id', 'org_id', 'name', 'email', 'phone', 'position', 'status', 'color', 'teams', 'role', 'team_roles', 'employment_type', 'employment_percentage', 'disabled_extras', 'can_see_resultat', 'address', 'ansettelsestype', 'tiltredelsesdato', 'opphorsdato', 'timer_per_uke', 'timer_per_dag', 'arbeidsoppgaver', 'provetid_mnd', 'created_date', 'updated_date', 'created_by'],
  contracts: ['id', 'org_id', 'worker_id', 'worker_name', 'contract_type', 'status', 'org_name', 'worker_position', 'employment_percentage', 'weekly_hours', 'overtime_hours', 'full_time_hours_per_week', 'start_date', 'end_date', 'week_number', 'year', 'reason', 'notice_period_months', 'approved_by_worker_id', 'approved_at', 'generated_automatically', 'created_date', 'updated_date', 'created_by', 'template_key', 'template_version', 'contract_kind', 'parent_contract_id', 'employee_signed_at', 'employee_signed_by', 'employer_signed_at', 'employer_signed_by', 'content_sha256', 'pdf_sha256', 'rejection_reason', 'expires_at', 'opened_at', 'sent_at', 'signing_provider'],
  holidays: ['id', 'org_id', 'name', 'date', 'created_date', 'updated_date', 'created_by'],
  workplace_settings: workplaceColumns().filter((col) => !workplaceWageFields.includes(col)),
};

const LEGACY_SAFE_COLUMNS = {
  workers: ['id', 'org_id', 'name', 'email', 'phone', 'position', 'status', 'color', 'teams', 'role', 'team_roles', 'employment_type', 'employment_percentage', 'disabled_extras', 'can_see_resultat', 'created_date', 'updated_date', 'created_by'],
  contracts: ['id', 'org_id', 'worker_id', 'worker_name', 'contract_type', 'status', 'org_name', 'worker_position', 'employment_percentage', 'weekly_hours', 'overtime_hours', 'full_time_hours_per_week', 'start_date', 'end_date', 'week_number', 'year', 'reason', 'notice_period_months', 'pdf_url', 'approved_by_worker_id', 'approved_at', 'generated_automatically', 'created_date', 'updated_date', 'created_by'],
  workplace_settings: ['id', 'org_id', 'workplace_name', 'latitude', 'longitude', 'radius_meters', 'full_time_hours_per_week', 'active_teams_count', 'created_date', 'updated_date', 'created_by'].concat(
    Array.from({ length: 10 }, (_, index) => {
      const n = index + 1;
      return [`team${n}_name`, `team${n}_latitude`, `team${n}_longitude`, `team${n}_radius_meters`];
    }).flat(),
  ),
};

const WAGE_RPC = {
  workers: 'worker_hourly_rates',
  contracts: 'contract_hourly_rates',
  holidays: 'holiday_wage_rules',
  workplace_settings: 'workplace_wage_rules',
};

const rpcState = new Map();

function isColumnPrivilegeError(error) {
  const message = error?.message || '';
  return error?.code === '42501' || /permission denied for column/i.test(message);
}

function isMissingColumn(error) {
  const message = error?.message || '';
  return error?.code === '42703' || /column .* does not exist/i.test(message);
}

function isMissingRpc(error) {
  const message = error?.message || '';
  return error?.code === 'PGRST202'
    || /schema cache/i.test(message)
    || /could not find the function/i.test(message)
    || /does not exist/i.test(message);
}

async function loadWageOverlay(table) {
  const rpc = WAGE_RPC[table];
  if (!rpc || rpcState.get(rpc) === 'no') return null;
  const { data, error } = await supabase.rpc(rpc);
  if (error) {
    if (isMissingRpc(error)) {
      rpcState.set(rpc, 'no');
      return null;
    }
    throw toError(error);
  }
  rpcState.set(rpc, 'yes');
  return data || [];
}

function applyOverlay(table, data, overlay) {
  if (!overlay || data == null) return data;
  const fields = WAGE_FIELDS[table];
  const rows = Array.isArray(data) ? data : [data];
  const byId = new Map(overlay.map((row) => [row.id, row]));
  const merged = rows.map((row) => {
    if (!row) return row;
    const extra = byId.get(row.id);
    const next = { ...row };
    for (const field of fields) next[field] = extra ? extra[field] ?? null : null;
    return next;
  });
  return Array.isArray(data) ? merged : merged[0];
}

let selfWageRows = null;
let selfWageStatus = 'unknown';

async function loadSelfWages() {
  if (selfWageStatus === 'no') return null;
  if (selfWageStatus === 'yes') return selfWageRows;
  const { data, error } = await supabase.rpc('my_wage_info');
  if (error) {
    if (isMissingRpc(error)) {
      selfWageStatus = 'no';
      return null;
    }
    throw toError(error);
  }
  selfWageStatus = 'yes';
  selfWageRows = data || [];
  return selfWageRows;
}

function applySelfWages(table, data, selfRows) {
  if (!selfRows || data == null) return data;
  const rows = Array.isArray(data) ? data : [data];
  let merged = rows;
  if (table === 'workers' || table === 'contracts') {
    const kind = table === 'workers' ? 'worker' : 'contract';
    const byId = new Map(selfRows.filter((row) => row.kind === kind).map((row) => [row.id, row]));
    merged = rows.map((row) => {
      if (!row) return row;
      const own = byId.get(row.id);
      if (!own) return row;
      return { ...row, hourly_rate: own.hourly_rate };
    });
  } else if (table === 'holidays') {
    const byId = new Map(selfRows.filter((row) => row.kind === 'holiday').map((row) => [row.id, row]));
    merged = rows.map((row) => {
      if (!row) return row;
      const own = byId.get(row.id);
      if (!own) return row;
      return {
        ...row,
        pay_multiplier: own.pay_multiplier,
        extra_type: own.extra_type,
        extra_amount: own.extra_amount,
      };
    });
  } else if (table === 'workplace_settings') {
    const byId = new Map(selfRows.filter((row) => row.kind === 'workplace').map((row) => [row.id, row]));
    merged = rows.map((row) => {
      if (!row) return row;
      const extras = ownWorkplaceExtras(byId.get(row.id));
      if (!extras) return row;
      return { ...row, ...extras };
    });
  } else {
    return data;
  }
  return Array.isArray(data) ? merged : merged[0];
}

function ownWorkplaceExtras(row) {
  const extras = row?.workplace_extras;
  if (!extras || typeof extras !== 'object') return null;
  return extras;
}

async function withWageColumns(table, data, overlay) {
  const overlaid = applyOverlay(table, data, overlay);
  if (!WAGE_FIELDS[table]) return overlaid;
  const selfRows = await loadSelfWages();
  return applySelfWages(table, overlaid, selfRows);
}

async function runRead(table, build) {
  let result = await build('*');
  if (result.error && WAGE_FIELDS[table] && isColumnPrivilegeError(result.error)) {
    rpcState.set(WAGE_RPC[table], 'yes');
    result = await build(SAFE_COLUMNS[table].join(','));
    if (result.error && isMissingColumn(result.error) && LEGACY_SAFE_COLUMNS[table]) {
      result = await build(LEGACY_SAFE_COLUMNS[table].join(','));
    }
    if (result.error) throw toError(result.error);
    const overlay = await loadWageOverlay(table);
    return withWageColumns(table, result.data, overlay || []);
  }
  if (result.error) throw toError(result.error);
  const overlay = await loadWageOverlay(table);
  return withWageColumns(table, result.data, overlay);
}

async function selectRows(table, { sort, limit, filters } = {}) {
  const compiled = compileFilter(filters);
  if (compiled.empty) return [];
  const cap = Number.isFinite(limit) && limit > 0 ? limit : 1000;
  const ordering = parseSort(sort);
  const rows = [];

  for (let from = 0; rows.length < cap; from += PAGE_SIZE) {
    const end = Math.min(from + PAGE_SIZE, cap) - 1;
    const batch = await runRead(table, (columns) => {
      let query = supabase.from(table).select(columns);
      query = applyClauses(query, compiled.clauses);
      query = query.order(ordering.column, { ascending: ordering.ascending });
      return query.range(from, end);
    }) || [];
    rows.push(...batch);
    if (batch.length < end - from + 1) break;
  }

  return rows.slice(0, cap).map(normalizeRow);
}

async function writeRow(table, payload, run) {
  try {
    return await runRead(table, (columns) => run(columns, payload));
  } catch (error) {
    if (table === 'workplace_settings' && isMissingColumn(error)) {
      return runRead(table, (columns) => run(columns, withoutStoreWorkplaceColumns(payload)));
    }
    if (table === 'organizations' && isMissingColumn(error) && (
      Object.prototype.hasOwnProperty.call(payload, 'employer_signatory_user_id')
      || Object.prototype.hasOwnProperty.call(payload, 'admin_signerer_navn')
    )) {
      return runRead(table, (columns) => run(columns, withoutEmployerSignatory(payload)));
    }
    throw error;
  }
}

function entityApi(table) {
  return {
    list(sort, limit) {
      return selectRows(table, { sort, limit });
    },
    filter(filters, sort, limit) {
      return selectRows(table, { sort, limit, filters });
    },
    async get(id) {
      const data = await runRead(table, (columns) => supabase.from(table).select(columns).eq('id', id).maybeSingle());
      if (!data) throw apiError(`${table} ${id} not found`, 404);
      return normalizeRow(data);
    },
    async create(data) {
      const payload = withImpersonatedOrg(table, sanitizeWrite(data, { isUpdate: false }));
      const row = await writeRow(table, payload, (columns, body) => (
        supabase.from(table).insert(body).select(columns).single()
      ));
      return normalizeRow(row);
    },
    async update(id, data) {
      const payload = sanitizeWrite(data, { isUpdate: true });
      const row = await writeRow(table, payload, (columns, body) => (
        supabase.from(table).update(body).eq('id', id).select(columns).maybeSingle()
      ));
      if (!row) throw apiError(`${table} ${id} not found`, 404);
      return normalizeRow(row);
    },
    async delete(id) {
      const { data, error } = await supabase.from(table).delete().eq('id', id).select('id').maybeSingle();
      if (error) throw toError(error);
      if (!data) throw apiError(`${table} ${id} not found`, 404);
      return { id: data.id };
    },
    async bulkCreate(rows) {
      const payload = (rows || []).map((row) => withImpersonatedOrg(table, sanitizeWrite(row, { isUpdate: false })));
      if (payload.length === 0) return [];
      const created = [];
      for (let i = 0; i < payload.length; i += 200) {
        const chunk = payload.slice(i, i + 200);
        const data = await runRead(table, (columns) => supabase.from(table).insert(chunk).select(columns));
        created.push(...(data || []).map(normalizeRow));
      }
      return created;
    },
    async bulkUpdate(rows) {
      const updated = [];
      for (const row of rows || []) {
        const id = row.id || row._id;
        if (!id) throw apiError('bulkUpdate row is missing id');
        updated.push(await this.update(id, row));
      }
      return updated;
    },
    async updateMany(filters, data) {
      const compiled = compileFilter(filters);
      if (compiled.empty) return [];
      if (compiled.clauses.length === 0) {
        throw apiError('updateMany requires a filter');
      }
      const patch = sanitizeWrite(data?.$set ?? data, { isUpdate: true });
      const rows = await runRead(table, (columns) => {
        let query = supabase.from(table).update(patch).select(columns);
        query = applyClauses(query, compiled.clauses);
        return query;
      });
      return (rows || []).map(normalizeRow);
    },
    async deleteMany(filters) {
      const compiled = compileFilter(filters);
      if (compiled.empty) return { deleted: 0 };
      if (compiled.clauses.length === 0) {
        throw apiError('deleteMany requires a filter');
      }
      let query = supabase.from(table).delete();
      query = applyClauses(query, compiled.clauses);
      const { data, error } = await query.select('id');
      if (error) throw toError(error);
      return { deleted: (data || []).length };
    },
  };
}

let pendingMe = null;

function clearPendingMe() {
  pendingMe = null;
}

async function me() {
  const request = pendingMe ?? (async () => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getUser();
    if (sessionError || !sessionData?.user) {
      throw apiError('Authentication required', 401);
    }
    const user = sessionData.user;
    const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) throw toError(error, 401);
    if (!data) throw apiError('User not registered', 403);
    return normalizeRow({ ...data, email: data.email || user.email || null });
  })().finally(() => {
    if (pendingMe === request) pendingMe = null;
  });
  pendingMe = request;
  return request;
}

export const base44 = {
  entities: new Proxy({}, {
    get(_target, entityName) {
      if (typeof entityName !== 'string' || entityName === 'then' || entityName.startsWith('_')) {
        return undefined;
      }
      const table = ENTITY_TABLES[entityName];
      if (!table) {
        throw apiError(`Unknown entity ${entityName}`);
      }
      return entityApi(table);
    },
  }),
  auth: {
    me,
    async isAuthenticated() {
      try {
        await me();
        return true;
      } catch {
        return false;
      }
    },
    async updateMe(data) {
      const current = await me();
      return entityApi('profiles').update(current.id, data);
    },
    redirectToLogin(nextUrl) {
      if (typeof window === 'undefined') {
        throw new Error('Innlogging kan bare brukes i nettleseren');
      }
      const from = nextUrl || window.location.href;
      const url = new URL('/login', window.location.origin);
      url.searchParams.set('from', from);
      window.location.assign(url.toString());
    },
    logout() {
      clearPendingMe();
      return supabase.auth.signOut().finally(() => {
        if (typeof window !== 'undefined') {
          window.location.assign('/login');
        }
      });
    },
  },
  users: {
    async inviteUser(email, role) {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: { email, role },
      });
      if (error) throw toError({ message: error.message || 'Invitasjonen feilet' }, 400);
      if (data?.error) throw apiError(data.error, 400);
      return data;
    },
  },
  functions: {
    async invoke(functionName, payload) {
      if (typeof payload === 'string') {
        throw apiError(`Funksjonen ${functionName} må få et objekt`);
      }
      const name = FUNCTION_NAMES[functionName] || functionName;
      const { data, error } = await supabase.functions.invoke(name, { body: payload ?? {} });
      if (error) {
        const err = apiError(error.message || `Funksjonen ${functionName} feilet`, 500);
        if (error.context && typeof error.context.status === 'number') {
          err.status = error.context.status;
        }
        throw err;
      }
      return { data };
    },
  },
  integrations: {
    Core: {
      async UploadFile({ file }) {
        if (!file) throw apiError('Filen mangler');
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData?.user) throw apiError('Authentication required', 401);
        const safeName = String(file.name || 'upload').replace(/[^\w.\-]+/g, '_');
        const path = `${userData.user.id}/${Date.now()}-${safeName}`;
        const { error } = await supabase.storage.from('uploads').upload(path, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || undefined,
        });
        if (error) throw toError(error);
        const { data } = supabase.storage.from('uploads').getPublicUrl(path);
        return { file_url: data.publicUrl };
      },
    },
  },
};
