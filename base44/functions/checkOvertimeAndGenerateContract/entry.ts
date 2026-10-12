import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function getWeekStartEnd(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (dt) => dt.toISOString().slice(0, 10);
  return { start: fmt(monday), end: fmt(sunday) };
}

function getISOWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

function calcShiftHours(shift) {
  const [sh, sm] = (shift.start_time || '00:00').split(':').map(Number);
  const [eh, em] = (shift.end_time || '00:00').split(':').map(Number);
  return Math.max(0, ((eh * 60 + em) - (sh * 60 + sm) - (shift.break_minutes || 0)) / 60);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const shiftData = body.data;
    if (!shiftData || !shiftData.worker_id || !shiftData.date) {
      return Response.json({ status: 'skipped', reason: 'no shift data' });
    }

    const workerId = shiftData.worker_id;
    const shiftDate = shiftData.date;

    const worker = (await base44.entities.Worker.filter({ id: workerId }))[0];
    if (!worker || worker.status !== 'active') {
      return Response.json({ status: 'skipped', reason: 'worker not found or inactive' });
    }

    const empPct = worker.employment_percentage || 100;
    if (empPct >= 100) {
      return Response.json({ status: 'skipped', reason: 'worker already 100%+' });
    }

    const { start: weekStart, end: weekEnd } = getWeekStartEnd(shiftDate);
    const weekNum = getISOWeek(shiftDate);
    const year = new Date(shiftDate + 'T00:00:00').getFullYear();
    const todayStr = new Date().toISOString().slice(0, 10);

    const weekShifts = await base44.entities.Shift.filter({
      worker_id: workerId,
      date: { $gte: weekStart, $lte: weekEnd },
      status: { $ne: 'cancelled' }
    });

    const totalHours = weekShifts.reduce((sum, s) => sum + calcShiftHours(s), 0);

    const wpSettings = await base44.entities.WorkplaceSetting.list();
    const wp = wpSettings[0];
    const fullTimeHours = wp?.full_time_hours_per_week || 37.5;

    const contractedHours = fullTimeHours * (empPct / 100);
    const overtimeHours = totalHours - contractedHours;

    if (overtimeHours <= 0) {
      return Response.json({ status: 'skipped', reason: 'no overtime', totalHours, contractedHours });
    }

    const existingContracts = await base44.entities.Contract.filter({
      worker_id: workerId,
      week_number: weekNum,
      year: year,
      contract_type: 'ekstrahjelp'
    });

    const activeContract = existingContracts.find(c =>
      c.status === 'utkast' || c.status === 'sendt' || c.status === 'godkjent'
    );

    const orgs = await base44.entities.Organization.list();
    let orgName = 'Arbeidsgiver';
    let orgId = worker.org_id || '';
    if (orgId) {
      const org = await base44.entities.Organization.filter({ id: orgId });
      if (org[0]) orgName = org[0].name;
    } else if (orgs[0]) {
      orgName = orgs[0].name;
      orgId = orgs[0].id;
    }

    const contractData = {
      org_id: orgId,
      worker_id: workerId,
      worker_name: worker.name,
      contract_type: 'ekstrahjelp',
      status: 'utkast',
      org_name: orgName,
      worker_position: worker.position || 'Selger',
      hourly_rate: worker.hourly_rate || 0,
      employment_percentage: empPct,
      weekly_hours: totalHours,
      overtime_hours: Math.round(overtimeHours * 100) / 100,
      full_time_hours_per_week: fullTimeHours,
      start_date: weekStart,
      end_date: weekEnd,
      week_number: weekNum,
      year: year,
      reason: 'sesong',
      notice_period_months: 1,
      generated_automatically: true
    };

    if (activeContract) {
      await base44.entities.Contract.update(activeContract.id, {
        weekly_hours: totalHours,
        overtime_hours: Math.round(overtimeHours * 100) / 100,
        end_date: weekEnd
      });
      return Response.json({ status: 'updated', contractId: activeContract.id, totalHours, overtimeHours });
    } else {
      const created = await base44.entities.Contract.create(contractData);
      return Response.json({ status: 'created', contractId: created.id, totalHours, overtimeHours });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});