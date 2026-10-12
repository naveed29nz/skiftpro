import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';

// Sentinel worker_id brukt for ledige (ubemannede) vakter — de forblir i
// vaktlisten som åpne slotter slik at de kan tas av en annen ansatt.
export const LEDIG_WORKER_ID = 'ledig';
export const LEDIG_WORKER_NAME = 'Ledig vakt';

/**
 * Gjør en ansatts kommende vakter om til ledige (ubemannede) vakter.
 * Tidligere vakter (dato < i dag) og fullførte vakter berøres ikke, slik at
 * vaktlisten beholder personens navn på historiske vakter.
 *
 * @param {string} workerId  Ansatt som slettes/deaktiveres/fjernes fra en avdeling
 * @param {object} [opts]
 * @param {string|null} [opts.teamKey]  Kun vakter tagget til denne avdelingen gjøres ledige
 * @param {string|null} [opts.orgId]   Org-omfang (valgfritt — RLS dekker normalt dette)
 * @returns {Promise<number>} antall vakter som ble gjort ledige
 */
export async function releaseUpcomingShifts(workerId, { teamKey = null, orgId = null } = {}) {
  if (!workerId) return 0;
  const today = format(new Date(), 'yyyy-MM-dd');
  const base = { worker_id: workerId, status: 'scheduled', date: { $gte: today } };
  if (teamKey) base.team = teamKey;
  if (orgId) base.org_id = orgId;
  const shifts = await base44.entities.Shift.filter(base, 'date', 1000);
  if (shifts.length === 0) return 0;
  await base44.entities.Shift.bulkUpdate(
    shifts.map(s => ({ id: s.id, worker_id: LEDIG_WORKER_ID, worker_name: LEDIG_WORKER_NAME }))
  );
  return shifts.length;
}