// Shared by desktop drag and mobile tap so both write the same shift fields.

export function shiftMoveFields({
  shift,
  newWorkerId,
  newDate,
  newWorker,
  filterTeam,
  ledigWorkerId,
  ledigWorkerName,
}) {
  const fields = {
    date: newDate,
    worker_id: newWorkerId,
    worker_name: newWorkerId === ledigWorkerId
      ? ledigWorkerName
      : (newWorker?.name || shift.worker_name),
  };
  if (filterTeam !== 'all') fields.team = filterTeam;
  return fields;
}

export function shiftCopyRecord(shift, fields) {
  return {
    org_id: shift.org_id,
    worker_id: fields.worker_id,
    worker_name: fields.worker_name,
    date: fields.date,
    start_time: shift.start_time,
    end_time: shift.end_time,
    break_minutes: shift.break_minutes || 0,
    notes: shift.notes || '',
    shift_label: shift.shift_label || '',
    status: 'scheduled',
    published: false,
    team: Object.prototype.hasOwnProperty.call(fields, 'team') ? fields.team : (shift.team || ''),
  };
}

export function isShiftDropTarget(worker) {
  return Boolean(worker) && !worker.isInactive && !worker.isFormer;
}

export function sameShiftCell(shift, workerId, dayStr) {
  return Boolean(shift) && shift.worker_id === workerId && shift.date === dayStr;
}
