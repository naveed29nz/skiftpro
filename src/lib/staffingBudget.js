// Prognose reads staffing_budgets. A row belongs to one organization.
// Week override wins per hour for that ISO week; other hours keep the default plan.

/**
 * @typedef {{
 *   id?: string,
 *   org_id?: string | null,
 *   team?: string,
 *   hour?: number,
 *   mon?: number,
 *   tue?: number,
 *   wed?: number,
 *   thu?: number,
 *   fri?: number,
 *   sat?: number,
 *   sun?: number,
 *   week_override?: number | null,
 *   year_override?: number | null,
 * }} StaffingBudgetRow
 */

export const STAFFING_BUDGET_FETCH_LIMIT = 5000;

export function staffingBudgetQueryKey(orgId) {
  return ['staffing-budget', orgId || null];
}

// Null means "do not query". Callers must not fall back to an unfiltered list:
// team1 in one customer is not team1 in another, and a global newest-500 cut
// drops whichever org was saved earlier.
export function staffingBudgetQuery(orgId) {
  if (!orgId) return null;
  return {
    filters: { org_id: orgId },
    sort: '-created_date',
    limit: STAFFING_BUDGET_FETCH_LIMIT,
  };
}

/**
 * @param {{ org_id?: string | null }} row
 * @param {string | null | undefined} orgId
 */
function sameOrg(row, orgId) {
  return Boolean(orgId) && row?.org_id === orgId;
}

/** @param {{ week_override?: number | null, year_override?: number | null }} row */
function isDefaultPlan(row) {
  return !row.week_override && !row.year_override;
}

/**
 * @param {StaffingBudgetRow[] | null | undefined} records
 * @param {{ team?: string, orgId?: string | null, week?: number, year?: number }} [options]
 */
export function resolveStaffingBudget(records, options = {}) {
  const { team, orgId, week, year } = options;
  if (!team || !orgId) return {};
  const teamRecords = (records || []).filter((row) => row.team === team && sameOrg(row, orgId));
  const overrideRecords = teamRecords.filter(
    (row) => row.week_override === week && row.year_override === year,
  );
  const defaultRecords = teamRecords.filter(isDefaultPlan);

  const merged = {};
  defaultRecords.forEach((row) => { merged[row.hour] = row; });
  overrideRecords.forEach((row) => { merged[row.hour] = row; });

  const result = {};
  Object.entries(merged).forEach(([hour, row]) => {
    result[Number(hour)] = {
      mon: row.mon || 0,
      tue: row.tue || 0,
      wed: row.wed || 0,
      thu: row.thu || 0,
      fri: row.fri || 0,
      sat: row.sat || 0,
      sun: row.sun || 0,
    };
  });
  return result;
}

/**
 * Rows shown in the Prognose grid for one store and one plan type.
 * @param {StaffingBudgetRow[] | null | undefined} records
 * @param {{ orgId?: string | null, team?: string, useWeekOverride?: boolean, week?: number | null, year?: number | null }} [options]
 */
export function filterStaffingPlan(records, options = {}) {
  const {
    orgId,
    team,
    useWeekOverride = false,
    week = null,
    year = null,
  } = options;
  if (!orgId || !team) return [];
  return (records || []).filter((row) => {
    if (!sameOrg(row, orgId) || row.team !== team) return false;
    if (useWeekOverride) return row.week_override === week && row.year_override === year;
    return isDefaultPlan(row);
  });
}
