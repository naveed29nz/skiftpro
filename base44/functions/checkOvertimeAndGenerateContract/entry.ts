import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function monthBounds(dateStr) {
  const [year, month] = dateStr.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  const fmt = (dt) => dt.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end), days: end.getUTCDate() };
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

    if (worker.ansettelsestype === 'tilkalling') {
      return Response.json({ status: 'skipped', reason: 'ekstrahjelp har ingen stillingsprosent' });
    }
    if (worker.ansettelsestype === 'butikksjef_ledende') {
      return Response.json({ status: 'skipped', reason: 'ledende stilling' });
    }

    const { start: monthStart, end: monthEnd, days } = monthBounds(shiftDate);
    const weekNum = getISOWeek(monthStart);
    const year = Number(monthStart.slice(0, 4));

    const monthShifts = await base44.entities.Shift.filter({
      worker_id: workerId,
      date: { $gte: monthStart, $lte: monthEnd },
      status: { $ne: 'cancelled' }
    });

    const totalHours = monthShifts.reduce((sum, s) => sum + calcShiftHours(s), 0);

    const wpSettings = await base44.entities.WorkplaceSetting.list();
    const wp = wpSettings[0];
    const fullTimeHours = wp?.full_time_hours_per_week || 37.5;
    const weeklyHours = worker.timer_per_uke != null && worker.timer_per_uke !== ''
      ? Number(worker.timer_per_uke)
      : fullTimeHours * ((worker.employment_percentage ?? 100) / 100);
    if (weeklyHours + 0.01 >= fullTimeHours) {
      return Response.json({ status: 'skipped', reason: 'worker already full time' });
    }

    const contractedHours = weeklyHours * (days / 7);
    const overtimeHours = totalHours - contractedHours;

    if (overtimeHours <= 0.01) {
      return Response.json({ status: 'skipped', reason: 'no overtime', totalHours, contractedHours, period: 'maned' });
    }

    const existingContracts = await base44.entities.Contract.filter({
      worker_id: workerId,
      start_date: monthStart,
      end_date: monthEnd
    });

    const activeContract = existingContracts.find(c =>
      c.generated_automatically
      && (c.contract_type === 'merarbeid' || c.contract_type === 'ekstrahjelp')
      && (c.status === 'utkast' || c.status === 'sendt' || c.status === 'apnet' || c.status === 'godkjent')
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
      contract_type: 'merarbeid',
      status: 'utkast',
      org_name: orgName,
      worker_position: worker.position || 'Selger',
      hourly_rate: worker.hourly_rate || 0,
      employment_percentage: worker.employment_percentage ?? null,
      weekly_hours: Math.round((totalHours / (days / 7)) * 100) / 100,
      overtime_hours: Math.round(overtimeHours * 100) / 100,
      full_time_hours_per_week: fullTimeHours,
      start_date: monthStart,
      end_date: monthEnd,
      week_number: weekNum,
      year: year,
      reason: 'sesong',
      notice_period_months: 1,
      generated_automatically: true
    };

    if (activeContract) {
      await base44.entities.Contract.update(activeContract.id, {
        weekly_hours: Math.round((totalHours / (days / 7)) * 100) / 100,
        overtime_hours: Math.round(overtimeHours * 100) / 100,
        start_date: monthStart,
        end_date: monthEnd
      });
      return Response.json({ status: 'updated', contractId: activeContract.id, totalHours, overtimeHours, period: 'maned' });
    } else {
      const created = await base44.entities.Contract.create(contractData);
      return Response.json({ status: 'created', contractId: created.id, totalHours, overtimeHours });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});