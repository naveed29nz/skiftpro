import { startOfWeek } from 'date-fns';

const TEAM_RE = /^(all|team(?:[1-9]|10))$/;

export function readTimesheetLocation(search) {
  const params = new URLSearchParams(search || '');
  const week = params.get('week');
  const team = params.get('team');
  let weekStart = null;
  let selectedDay = null;
  if (week && /^\d{4}-\d{2}-\d{2}$/.test(week)) {
    const [y, m, d] = week.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    if (!Number.isNaN(date.getTime()) && date.getFullYear() === y && date.getMonth() === m - 1) {
      selectedDay = date;
      weekStart = startOfWeek(date, { weekStartsOn: 1 });
    }
  }
  return {
    weekStart,
    selectedDay,
    team: team && TEAM_RE.test(team) ? team : null,
  };
}
