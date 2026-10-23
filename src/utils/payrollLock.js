export function activePayrollLocks(locks) {
  return (locks || []).filter((lock) => lock && !lock.unlocked_at);
}

export function isDateLocked(locks, day) {
  if (!day) return false;
  return activePayrollLocks(locks).some((lock) => day >= lock.start_date && day <= lock.end_date);
}
