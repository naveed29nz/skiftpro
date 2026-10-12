const FILTER_OPS = {
  $eq: 'eq',
  $ne: 'neq',
  $gte: 'gte',
  $lte: 'lte',
  $gt: 'gt',
  $lt: 'lt',
  $in: 'in',
};

const COLUMN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function parseSort(sort) {
  if (sort == null || sort === '') {
    return { column: 'created_date', ascending: false };
  }
  if (typeof sort !== 'string') {
    throw new Error('Sort must be a column name, prefixed with "-" for descending');
  }
  const descending = sort.startsWith('-');
  const column = (descending ? sort.slice(1) : sort).trim();
  if (!COLUMN.test(column)) {
    throw new Error(`Invalid sort column: ${sort}`);
  }
  return { column, ascending: !descending };
}

/**
 * Compile a Base44 filter object into PostgREST clauses.
 * Supports equality, null, and {$gte,$lte,$gt,$lt,$ne,$in}.
 * An empty $in matches nothing.
 */
export function compileFilter(filters) {
  const clauses = [];
  if (filters == null) return { clauses, empty: false };
  if (typeof filters !== 'object' || Array.isArray(filters)) {
    throw new Error('Filter must be an object');
  }

  for (const [rawKey, value] of Object.entries(filters)) {
    const column = rawKey === 'created_by_id' ? 'created_by' : rawKey;
    if (!COLUMN.test(column)) {
      throw new Error(`Invalid filter column: ${rawKey}`);
    }

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const [op, operand] of Object.entries(value)) {
        const mapped = FILTER_OPS[op];
        if (!mapped) throw new Error(`Unsupported filter operator ${op}`);
        if (mapped === 'in') {
          if (!Array.isArray(operand) || operand.length === 0) {
            return { clauses: [], empty: true };
          }
          clauses.push({ column, op: 'in', value: operand });
        } else {
          clauses.push({ column, op: mapped, value: operand });
        }
      }
    } else if (value === null) {
      clauses.push({ column, op: 'is', value: null });
    } else {
      clauses.push({ column, op: 'eq', value });
    }
  }

  return { clauses, empty: false };
}

export function applyClauses(query, clauses) {
  let next = query;
  for (const clause of clauses) {
    if (clause.op === 'eq') next = next.eq(clause.column, clause.value);
    else if (clause.op === 'neq') next = next.neq(clause.column, clause.value);
    else if (clause.op === 'gte') next = next.gte(clause.column, clause.value);
    else if (clause.op === 'lte') next = next.lte(clause.column, clause.value);
    else if (clause.op === 'gt') next = next.gt(clause.column, clause.value);
    else if (clause.op === 'lt') next = next.lt(clause.column, clause.value);
    else if (clause.op === 'in') next = next.in(clause.column, clause.value);
    else if (clause.op === 'is') next = next.is(clause.column, clause.value);
    else throw new Error(`Unsupported clause ${clause.op}`);
  }
  return next;
}
