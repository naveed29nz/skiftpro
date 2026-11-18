// Local preview for /dev/autoplan. Uses the Narvesen Demo org id and the
// published team1 prognose shape. Employee names here are examples for the
// screen, not rows from the hosted database.

import { addDays } from './autoSchedule.js';

export const PREVIEW_ORG = 'de30000000000000000000a1';
export const PREVIEW_TEAM = 'team1';
export const PREVIEW_WEEK = '2026-11-16';

const TEAM1_HOURS = [
  [7, 0.5, 0.5, 0.5, 0.5, 0.5, 0.25, 0.25],
  [8, 1, 1, 1, 1, 1, 0.5, 0.5],
  [9, 1, 1, 1, 1, 1, 1, 0.5],
  [10, 2, 2, 2, 2, 2, 1.5, 1],
  [11, 2, 2, 2, 2, 2, 1.5, 1.5],
  [12, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5],
  [13, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1],
  [14, 1, 1, 1, 1, 1, 1.5, 1],
  [15, 1, 1, 1, 1, 1.5, 1.5, 1],
  [16, 1, 1, 1, 1, 1.5, 1, 1],
  [17, 2, 2, 2, 2, 2.5, 1, 1],
  [18, 2, 2, 2, 2, 2, 1, 0.5],
  [19, 1.5, 1.5, 1.5, 1.5, 1.5, 1, 0.5],
  [20, 1, 1, 1, 1, 1.5, 0.5, 0.5],
  [21, 1, 1, 1, 1, 1, 0.5, 0.25],
  [22, 0.5, 0.5, 0.5, 0.5, 0.5, 0.25, 0.25],
];

export const previewWorkers = [
  { id: 'kari', org_id: PREVIEW_ORG, name: 'Kari Nord', status: 'active', teams: ['team1'], position: 'Medarbeider', timer_per_uke: 37.5, employment_percentage: 100, hourly_rate: 220, color: '#3B82F6' },
  { id: 'jonas', org_id: PREVIEW_ORG, name: 'Jonas Berg', status: 'active', teams: ['team1'], position: 'Medarbeider', timer_per_uke: 30, employment_percentage: 80, hourly_rate: 210, color: '#10B981' },
  { id: 'mia', org_id: PREVIEW_ORG, name: 'Mia Solberg', status: 'active', teams: ['team1'], position: 'Ekstrahjelp', ansettelsestype: 'tilkalling', employment_percentage: 0, hourly_rate: 200, color: '#F59E0B' },
  { id: 'erik', org_id: PREVIEW_ORG, name: 'Erik Dahl', status: 'active', teams: ['team1'], position: 'Butikksjef', timer_per_uke: 37.5, employment_percentage: 100, hourly_rate: 250, color: '#8B5CF6' },
  { id: 'sara', org_id: PREVIEW_ORG, name: 'Sara Holm', status: 'active', teams: ['team2'], position: 'Medarbeider', timer_per_uke: 37.5, hourly_rate: 215, color: '#EF4444' },
];

function historyShift(workerId, date, start, end, label) {
  return {
    id: `${workerId}-${date}-${start}`,
    org_id: PREVIEW_ORG,
    worker_id: workerId,
    worker_name: previewWorkers.find((worker) => worker.id === workerId)?.name || workerId,
    date,
    start_time: start,
    end_time: end,
    break_minutes: 30,
    shift_label: label,
    status: 'scheduled',
    team: PREVIEW_TEAM,
    published: true,
  };
}

export function previewShifts() {
  const rows = [];
  for (let week = 4; week >= 1; week -= 1) {
    const monday = addDays(PREVIEW_WEEK, -7 * week);
    for (let day = 0; day < 5; day += 1) {
      const date = addDays(monday, day);
      rows.push(historyShift('kari', date, '07:00', '15:00', 'morning'));
      rows.push(historyShift('jonas', date, '15:00', '23:00', 'evening'));
      if (day < 5) rows.push(historyShift('erik', date, '10:00', '14:00', 'middle'));
    }
  }
  rows.push({
    id: 'kept-monday',
    org_id: PREVIEW_ORG,
    worker_id: 'kari',
    worker_name: 'Kari Nord',
    date: PREVIEW_WEEK,
    start_time: '07:00',
    end_time: '15:00',
    break_minutes: 30,
    shift_label: 'morning',
    status: 'scheduled',
    team: PREVIEW_TEAM,
    published: true,
  });
  rows.push({
    id: 'kari-ferie',
    org_id: PREVIEW_ORG,
    worker_id: 'kari',
    worker_name: 'Kari Nord',
    date: addDays(PREVIEW_WEEK, 3),
    start_time: '00:00',
    end_time: '00:00',
    break_minutes: 0,
    shift_label: 'ferie',
    all_day: true,
    status: 'scheduled',
    team: PREVIEW_TEAM,
    published: true,
  });
  rows.push(historyShift('erik', addDays(PREVIEW_WEEK, -1), '15:00', '23:00', 'evening'));
  return rows;
}

export function previewAvailability() {
  return [{
    id: 'jonas-off',
    org_id: PREVIEW_ORG,
    worker_id: 'jonas',
    date: addDays(PREVIEW_WEEK, 2),
    status: 'unavailable',
  }];
}

export function previewBudgets() {
  return TEAM1_HOURS.map(([hour, mon, tue, wed, thu, fri, sat, sun]) => ({
    id: `budget-${hour}`,
    org_id: PREVIEW_ORG,
    team: PREVIEW_TEAM,
    hour,
    mon, tue, wed, thu, fri, sat, sun,
    week_override: null,
    year_override: null,
  }));
}

export function previewSeed() {
  return {
    shifts: previewShifts(),
    availability: previewAvailability(),
    budgets: previewBudgets(),
  };
}
