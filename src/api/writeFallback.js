/** Classify PostgREST/Postgres write errors and decide a safe retry. */

const UNUSED_WORKER_BREAK_COLUMNS = ['break_after_hours', 'break_length_minutes'];

/** Drop the unused per-employee break columns before a worker write. */
export function omitUnusedWorkerBreak(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const next = { ...payload };
  let changed = false;
  for (const column of UNUSED_WORKER_BREAK_COLUMNS) {
    if (Object.prototype.hasOwnProperty.call(next, column)) {
      delete next[column];
      changed = true;
    }
  }
  return changed ? next : payload;
}

export function errorMessage(error) {
  return String(error?.message || error?.details?.message || '');
}

export function errorCode(error) {
  return String(error?.code || error?.details?.code || '');
}

/**
 * A column the payload or the select list names is not in the database.
 * PostgREST reports that as PGRST204 ("Could not find the '…' column … schema cache"),
 * which is not the same text as Postgres 42703 ("column … does not exist").
 */
export function isMissingColumnError(error) {
  const message = errorMessage(error);
  const code = errorCode(error);
  return code === '42703'
    || code === 'PGRST204'
    || /column .+ does not exist/i.test(message)
    || /Could not find the '[^']+' column/i.test(message);
}

export function isNotNullViolation(error) {
  const message = errorMessage(error);
  const code = errorCode(error);
  return code === '23502'
    || /not-null constraint/i.test(message)
    || /null value in column/i.test(message);
}

/**
 * Next worker update to try after a failed write.
 * Returns null when there is no safe retry.
 * A payload that still names the unused break columns is retried without them.
 */
export function workerUpdateFallback(payload, error) {
  if (!payload || typeof payload !== 'object') return null;
  const hasBreak = Object.prototype.hasOwnProperty.call(payload, 'break_after_hours')
    || Object.prototype.hasOwnProperty.call(payload, 'break_length_minutes');
  if (isMissingColumnError(error) && hasBreak) {
    const next = { ...payload };
    delete next.break_after_hours;
    delete next.break_length_minutes;
    return { payload: next, warning: '' };
  }
  const message = errorMessage(error);
  if (
    isNotNullViolation(error)
    && message.includes('employment_percentage')
    && payload.employment_percentage == null
    && Object.prototype.hasOwnProperty.call(payload, 'employment_percentage')
  ) {
    const next = { ...payload };
    delete next.employment_percentage;
    return { payload: next, warning: '' };
  }
  return null;
}
