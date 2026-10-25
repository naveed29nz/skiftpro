import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Legacy Base44 entry. The live path is the Postgres trigger
// check_overtime_for_shift. This copy follows the same period rule so an old
// invoke cannot keep creating one contract per week. It never sends.

function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthBounds(dateStr) {
  const [year, month] = dateStr.split('-').map(Number);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: isoDate(year, month, 1),
    end: isoDate(year, month, days),
    weeks: days / 7,
  };
}

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

function round2(value) {
  return Math.round(value * 100) / 100;
}

function spanDays(start, end) {
  if (!start || !end) return 0;
  return Math.round((Date.parse(end) - Date.parse(start)) / 86400000);
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
    if (worker.ansettelsestype === 'butikksjef_ledende') {
      return Response.json({ status: 'skipped', reason: 'ledende stilling' });
    }

    let period = 'maaned';
    let fullTimeHours = null;
    try {
      const settings = await base44.entities.EmployerSetting.filter({ org_id: worker.org_id });
      const row = settings[0];
      if (row?.alminnelig_ukentlig_arbeidstid) fullTimeHours = Number(row.alminnelig_ukentlig_arbeidstid);
      if (String(row?.ekstratimer_periode || '').trim().toLowerCase() === 'uke') period = 'uke';
    } catch {
      period = 'maaned';
    }
    if (!(fullTimeHours > 0)) {
      const wpSettings = await base44.entities.WorkplaceSetting.list();
      fullTimeHours = Number(wpSettings[0]?.full_time_hours_per_week) || 37.5;
    }

    let contractedHours = worker.timer_per_uke != null && worker.timer_per_uke !== ''
      ? Number(worker.timer_per_uke)
      : fullTimeHours * ((worker.employment_percentage == null ? 100 : Number(worker.employment_percentage)) / 100);
    if (worker.ansettelsestype === 'tilkalling') {
      const ramme = await base44.entities.Contract.filter({
        worker_id: workerId,
        contract_type: 'tilkalling_ramme',
        status: 'signert',
      });
      if (!ramme[0]) {
        return Response.json({ status: 'skipped', reason: 'rammeavtale ikke signert' });
      }
      contractedHours = 0;
    } else if (contractedHours + 0.01 >= fullTimeHours) {
      return Response.json({ status: 'skipped', reason: 'worker already full time' });
    }

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

    if (period === 'uke') {
      const { start: weekStart, end: weekEnd } = getWeekStartEnd(shiftDate);
      const weekNum = getISOWeek(shiftDate);
      const year = new Date(shiftDate + 'T00:00:00').getFullYear();
      const weekShifts = await base44.entities.Shift.filter({
        worker_id: workerId,
        date: { $gte: weekStart, $lte: weekEnd },
        status: { $ne: 'cancelled' },
      });
      const totalHours = weekShifts.reduce((sum, s) => sum + calcShiftHours(s), 0);
      const overtimeHours = totalHours - contractedHours;
      if (overtimeHours <= 0) {
        return Response.json({ status: 'skipped', reason: 'no overtime', totalHours, contractedHours, period });
      }
      const existingContracts = await base44.entities.Contract.filter({
        worker_id: workerId,
        week_number: weekNum,
        year: year,
        contract_type: 'ekstrahjelp',
      });
      const activeContract = existingContracts.find((c) =>
        (c.status === 'utkast' || c.status === 'sendt' || c.status === 'godkjent')
        && c.metadata?.periode !== 'maaned'
        && spanDays(c.start_date, c.end_date) <= 6
      );
      if (activeContract) {
        await base44.entities.Contract.update(activeContract.id, {
          weekly_hours: totalHours,
          overtime_hours: round2(overtimeHours),
          end_date: weekEnd,
        });
        return Response.json({ status: 'updated', contractId: activeContract.id, totalHours, overtimeHours, period });
      }
      const created = await base44.entities.Contract.create({
        org_id: orgId,
        worker_id: workerId,
        worker_name: worker.name,
        contract_type: 'ekstrahjelp',
        status: 'utkast',
        org_name: orgName,
        worker_position: worker.position || 'Selger',
        hourly_rate: worker.hourly_rate || 0,
        employment_percentage: worker.employment_percentage || 0,
        weekly_hours: totalHours,
        overtime_hours: round2(overtimeHours),
        full_time_hours_per_week: fullTimeHours,
        start_date: weekStart,
        end_date: weekEnd,
        week_number: weekNum,
        year: year,
        reason: 'sesong',
        notice_period_months: 1,
        generated_automatically: true,
      });
      return Response.json({ status: 'created', contractId: created.id, totalHours, overtimeHours, period });
    }

    const month = monthBounds(shiftDate);
    const monthShifts = await base44.entities.Shift.filter({
      worker_id: workerId,
      date: { $gte: month.start, $lte: month.end },
      status: { $ne: 'cancelled' },
    });
    const totalHours = monthShifts.reduce((sum, s) => sum + calcShiftHours(s), 0);
    const agreed = contractedHours * month.weeks;
    const extra = Math.max(totalHours - agreed, 0);
    if (totalHours <= agreed + 0.01) {
      return Response.json({
        status: 'skipped',
        reason: 'month within contracted hours',
        totalHours,
        agreed,
        period,
      });
    }

    const existingContracts = await base44.entities.Contract.filter({
      worker_id: workerId,
      generated_automatically: true,
    });
    const activeContract = existingContracts.find((c) =>
      c.start_date === month.start
      && c.end_date === month.end
      && (c.metadata?.periode === 'maaned' || c.contract_type === 'merarbeid' || c.contract_type === 'ekstrahjelp')
      && (c.status === 'utkast' || c.status === 'sendt' || c.status === 'apnet')
      && spanDays(c.start_date, c.end_date) > 6
    );
    const hours = {
      weekly_hours: round2(totalHours / month.weeks),
      overtime_hours: round2(extra),
      start_date: month.start,
      end_date: month.end,
    };
    if (activeContract) {
      await base44.entities.Contract.update(activeContract.id, hours);
      return Response.json({ status: 'updated', contractId: activeContract.id, totalHours, extra, period });
    }
    const created = await base44.entities.Contract.create({
      org_id: orgId,
      worker_id: workerId,
      worker_name: worker.name,
      contract_type: 'merarbeid',
      org_name: orgName,
      worker_position: worker.position || 'Selger',
      hourly_rate: worker.hourly_rate || 0,
      employment_percentage: worker.employment_percentage || 0,
      full_time_hours_per_week: fullTimeHours,
      week_number: getISOWeek(month.start),
      year: Number(month.start.slice(0, 4)),
      reason: 'sesong',
      notice_period_months: 1,
      generated_automatically: true,
      metadata: { periode: 'maaned' },
      ...hours,
      status: 'utkast',
    });
    return Response.json({ status: 'created', contractId: created.id, totalHours, extra, period });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
