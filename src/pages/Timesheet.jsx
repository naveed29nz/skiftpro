import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useCurrentWorker } from '@/hooks/useCurrentWorker';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Plus, Copy, GripVertical, ArrowUpDown, Trash2, CheckSquare, Send, Eye, EyeOff, Clock } from 'lucide-react';
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay, getISOWeek } from 'date-fns';
import ShiftCellModal from '@/components/shifts/ShiftCellModal';
import CopyWeekModal from '@/components/timesheet/CopyWeekModal';
import { useStaffingBudget, getHourlyStaffing } from '@/hooks/useStaffingBudget';
import { getActiveTeams } from '@/utils/teams';
import { useOrg } from '@/hooks/useOrg';
import { useIsMobile } from '@/hooks/use-mobile';
import DayGantt from '@/components/timesheet/DayGantt';
import { LEDIG_WORKER_ID, LEDIG_WORKER_NAME } from '@/utils/workerLifecycle';

function calcHours(shift) {
  const [sh, sm] = shift.start_time.split(':').map(Number);
  const [eh, em] = shift.end_time.split(':').map(Number);
  let minutes = (eh * 60 + em) - (sh * 60 + sm) - (shift.break_minutes || 0);
  if (minutes < 0) minutes += 24 * 60; // overnight shift (e.g. 21:00–00:00)
  return Math.max(0, minutes / 60);
}

const LABEL_STYLES = {
  morning: { cell: 'bg-green-50',  badge: 'bg-green-100 text-green-700 border border-green-200' },
  middle:  { cell: 'bg-slate-100', badge: 'bg-slate-200 text-slate-700 border border-slate-300' },
  evening: { cell: 'bg-slate-50',  badge: 'bg-slate-150 text-slate-600 border border-slate-250' },
  sick:    { cell: 'bg-red-50',    badge: 'bg-red-100 text-red-700 border border-red-200' },
};

const GROUPS = [
  { label: 'morning', name: 'Morgen',     icon: '🌅', headerClass: 'bg-green-600 text-white',   rowClass: 'bg-green-50' },
  { label: 'middle',  name: 'Mellomvakt', icon: '☀️',  headerClass: 'bg-slate-600 text-white',    rowClass: 'bg-slate-100' },
  { label: 'evening', name: 'Kveld',      icon: '🌙', headerClass: 'bg-slate-500 text-white',  rowClass: 'bg-slate-50' },
  { label: 'sick',    name: 'Syk',        icon: '🤒', headerClass: 'bg-red-500 text-white',     rowClass: 'bg-red-50' },
];

const LABEL_LEGEND = [
  { label: 'morning', color: 'bg-green-100 border-green-300 text-green-700',    icon: '🌅' },
  { label: 'middle',  color: 'bg-slate-200 border-slate-300 text-slate-700',       icon: '☀️' },
  { label: 'evening', color: 'bg-slate-150 border-slate-250 text-slate-600', icon: '🌙' },
  { label: 'sick',    color: 'bg-red-100 border-red-300 text-red-700',          icon: '🤒' },
];

const LABEL_SORT_ORDER = { morning: 0, middle: 1, evening: 2, sick: 3 };
const PAYROLL_TAX = 0.243;

// Display-only. Desktop keeps the full "HH:mm–HH:mm" string.
function compactClock(time) {
  if (!time || typeof time !== 'string') return time || '';
  const [h, m = ''] = time.split(':');
  if (m === '00') return String(Number(h));
  return `${h}:${m}`;
}

function compactShiftRange(start, end) {
  return `${compactClock(start)}–${compactClock(end)}`;
}

function shortWorkerLabel(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || '';
  return `${parts.slice(0, -1).join(' ')} ${parts[parts.length - 1].charAt(0)}`;
}

function ShiftTimeText({ start, end, className, onClick }) {
  return (
    <div className={className} onClick={onClick}>
      <span className="md:hidden">{compactShiftRange(start, end)}</span>
      <span className="hidden md:inline">{start}–{end}</span>
    </div>
  );
}

// --- Norwegian Holiday Logic ---
function getEaster(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDaysToDate(date, n) {
  const d = new Date(date); d.setDate(d.getDate() + n); return d;
}

function getNorwegianHolidays(year) {
  const easter = getEaster(year);
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return [
    { date: fmt(new Date(year, 0, 1)),  name: 'Nyttårsdag',           icon: '🎉', color: 'bg-pink-100 text-pink-700' },
    { date: fmt(addDaysToDate(easter,-3)), name: 'Skjærtorsdag',       icon: '🐣', color: 'bg-yellow-100 text-yellow-700' },
    { date: fmt(addDaysToDate(easter,-2)), name: 'Langfredag',          icon: '✝️',  color: 'bg-slate-200 text-slate-700' },
    { date: fmt(easter),               name: '1. påskedag',            icon: '🌸', color: 'bg-yellow-100 text-yellow-700' },
    { date: fmt(addDaysToDate(easter, 1)), name: '2. påskedag',        icon: '🌼', color: 'bg-yellow-100 text-yellow-700' },
    { date: fmt(new Date(year, 4, 1)),  name: 'Arbeidernes dag',       icon: '👷', color: 'bg-red-100 text-red-700' },
    { date: fmt(new Date(year, 4, 17)), name: 'Grunnlovsdagen',        icon: '🇳🇴', color: 'bg-red-100 text-red-700' },
    { date: fmt(addDaysToDate(easter,39)), name: 'Kristi himmelfartsdag', icon: '🔥', color: 'bg-orange-100 text-orange-700' },
    { date: fmt(addDaysToDate(easter,49)), name: '1. pinsedag',        icon: '🕊️',  color: 'bg-purple-100 text-purple-700' },
    { date: fmt(addDaysToDate(easter,50)), name: '2. pinsedag',        icon: '🌿', color: 'bg-purple-100 text-purple-700' },
    { date: fmt(new Date(year, 11, 25)), name: '1. juledag',           icon: '🎄', color: 'bg-green-100 text-green-700' },
    { date: fmt(new Date(year, 11, 26)), name: '2. juledag',           icon: '🎁', color: 'bg-green-100 text-green-700' },
  ];
}

export default function Timesheet() {
  const { user, myTeams } = useCurrentWorker();
  const isAdmin = user?.role === 'admin';
  // Rollene som får redigere vaktplan (legge til / slette / endre / kopiere / publisere)
  const canManageShifts = user?.role === 'admin' || user?.role === 'sub_admin' || user?.role === 'butikksjef';
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');
  const weekEndStr = format(addDays(weekStart, 6), 'yyyy-MM-dd');
  const [filterWorker, setFilterWorker] = useState('all');
  const [filterTeam, setFilterTeam] = useState('all');
  const [teamDefaultSet, setTeamDefaultSet] = useState(false);
  const [editingTeamKey, setEditingTeamKey] = useState(null);
  const [editingTeamValue, setEditingTeamValue] = useState('');
  const [modalCell, setModalCell] = useState(null);
  const [showCopy, setShowCopy] = useState(false);
  const [viewMode, setViewMode] = useState('uke'); // 'uke' | 'dag'
  const [selectedDay, setSelectedDay] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [workerOrder, setWorkerOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem('timesheet_worker_order') || '[]'); } catch { return []; }
  });
  const [sortByLabel, setSortByLabel] = useState(false);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [selectedCols, setSelectedCols] = useState(new Set());
  const [mobileSelectMode, setMobileSelectMode] = useState(false);
  const isMobile = useIsMobile();
  const attachDragHandle = !isMobile || mobileSelectMode;
  const mobileControlsClass = mobileSelectMode ? '' : 'max-md:hidden';
  const nameColClass = mobileSelectMode
    ? 'w-[148px] min-w-[148px] md:w-[120px] md:min-w-[120px]'
    : 'w-[80px] min-w-[80px] md:w-[120px] md:min-w-[120px]';
  const nameCellClass = mobileSelectMode
    ? 'max-md:w-[148px] max-md:max-w-[148px] max-md:min-w-0 max-md:overflow-hidden'
    : 'max-md:w-[80px] max-md:max-w-[80px] max-md:min-w-0 max-md:overflow-hidden';
  const [inlineEditId, setInlineEditId] = useState(null);
  const [inlineEditData, setInlineEditData] = useState({});
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!teamDefaultSet && myTeams?.[0]) {
      // Admins default to "Alle team"; non-admins default to their first team
      const defaultTeam = user?.role === 'admin' ? 'all' : myTeams[0];
      setFilterTeam(defaultTeam);
      setTeamDefaultSet(true);
    }
  }, [myTeams, teamDefaultSet, user]);

  const { orgId } = useOrg();
  const { data: workers = [] } = useQuery({
    queryKey: ['workers', orgId],
    queryFn: () => orgId
      ? base44.entities.Worker.filter({ org_id: orgId })
      : base44.entities.Worker.list(),
  });
  const { data: shifts = [] } = useQuery({
    queryKey: ['shifts', weekStartStr, orgId],
    queryFn: () => orgId
      ? base44.entities.Shift.filter({ org_id: orgId, date: { $gte: weekStartStr, $lte: weekEndStr } }, 'date', 200)
      : base44.entities.Shift.filter({ date: { $gte: weekStartStr, $lte: weekEndStr } }, 'date', 200),
  });
  const { data: wpSettings = [], refetch: refetchSettings } = useQuery({ queryKey: ['workplace-settings'], queryFn: () => base44.entities.WorkplaceSetting.list() });
  const wp = orgId ? wpSettings.find(s => s.org_id === orgId) : wpSettings[0];

  // Henter tilgjengelighet (utilgjengelige dager) for den aktuelle uken og org
  const { data: availability = [] } = useQuery({
    queryKey: ['availability', weekStartStr, orgId],
    queryFn: () => orgId
      ? base44.entities.Availability.filter({ org_id: orgId, date: { $gte: weekStartStr, $lte: weekEndStr } })
      : base44.entities.Availability.filter({ date: { $gte: weekStartStr, $lte: weekEndStr } }),
  });
  // Henter stemplinger (inn/ut) for uken for å vise faktiske tider under hver vakt
  const { data: stamps = [] } = useQuery({
    queryKey: ['stamps', weekStartStr, orgId],
    queryFn: () => orgId
      ? base44.entities.Stamp.filter({ org_id: orgId, date: { $gte: weekStartStr, $lte: weekEndStr } })
      : base44.entities.Stamp.filter({ date: { $gte: weekStartStr, $lte: weekEndStr } }),
  });
  const stampByWorkerDate = useMemo(() => {
    const m = new Map();
    stamps.forEach(st => { if (st.date && st.worker_id) m.set(`${st.worker_id}__${st.date}`, st); });
    return m;
  }, [stamps]);
  const fmtStamp = (iso) => {
    if (!iso) return null;
    try { return format(new Date(iso), 'HH:mm'); } catch { return null; }
  };
  // Kart over ansatte+date for raskt oppslag: "workerId__YYYY-MM-DD" -> true
  const unavailableMap = useMemo(() => {
    const m = new Map();
    availability.forEach(a => { if (a.status === 'unavailable') m.set(`${a.worker_id}__${a.date}`, true); });
    return m;
  }, [availability]);
  const isUnavailableOn = (workerId, day) => unavailableMap.has(`${workerId}__${format(day, 'yyyy-MM-dd')}`);
  const teamList = getActiveTeams(wp, workers);
  const teamNames = Object.fromEntries(teamList.map(t => [t.key, t.label]));

  const saveTeamName = async (key, value) => {
    if (!value.trim()) return;
    const field = `${key}_name`;
    if (wp) {
      await base44.entities.WorkplaceSetting.update(wp.id, { [field]: value.trim() });
    } else {
      await base44.entities.WorkplaceSetting.create({ [field]: value.trim(), org_id: orgId });
    }
    refetchSettings();
    setEditingTeamKey(null);
  };

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const norwegianHolidays = useMemo(() => {
    const years = [...new Set(days.map(d => d.getFullYear()))];
    return years.flatMap(y => getNorwegianHolidays(y));
  }, [days]);

  const getHoliday = (day) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    return norwegianHolidays.find(h => h.date === dayStr);
  };

  // Non-admins can only see workers in their own team(s)
  const teamFilteredWorkers = isAdmin ? workers : workers.filter(w =>
    (w.teams || ['team1']).some(t => myTeams.includes(t))
  );
  const activeWorkers = teamFilteredWorkers.filter(w => w.status !== 'inactive' && (filterTeam === 'all' || (w.teams || (w.team ? [w.team] : ['team1'])).includes(filterTeam)));
  const weekShifts = shifts.filter(s => s.date >= weekStartStr && s.date <= weekEndStr && s.status !== 'cancelled');

  useEffect(() => {
    if (workers.length > 0) {
      setWorkerOrder(prev => {
        const existing = prev.filter(id => workers.find(w => w.id === id));
        const newIds = workers.filter(w => !prev.includes(w.id)).map(w => w.id);
        if (newIds.length === 0) return prev; // no change, don't overwrite
        const next = [...existing, ...newIds];
        localStorage.setItem('timesheet_worker_order', JSON.stringify(next));
        return next;
      });
    }
  }, [workers]);

  const displayWorkers = useMemo(() => {
    const base = filterWorker === 'all' ? activeWorkers : activeWorkers.filter(w => w.id === filterWorker);
    let sortedBase;
    if (sortByLabel) {
      sortedBase = [...base].sort((a, b) => {
        const aShifts = weekShifts.filter(s => s.worker_id === a.id);
        const bShifts = weekShifts.filter(s => s.worker_id === b.id);
        const aLabels = aShifts.map(s => s.shift_label || '').filter(l => l);
        const bLabels = bShifts.map(s => s.shift_label || '').filter(l => l);
        const aLabel = aLabels[0] || '';
        const bLabel = bLabels[0] || '';
        return (LABEL_SORT_ORDER[aLabel] ?? 99) - (LABEL_SORT_ORDER[bLabel] ?? 99);
      });
    } else if (workerOrder.length > 0) {
      sortedBase = [...base].sort((a, b) => {
        const ai = workerOrder.indexOf(a.id);
        const bi = workerOrder.indexOf(b.id);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
    } else {
      sortedBase = base;
    }

    // Bare vis virtuelle rader (tidligere ansatte / ledige) når ingen spesifikk ansatt er filtrert
    if (filterWorker !== 'all') return sortedBase;

    // Inaktive (deaktiverte) ansatte som fortsatt har vakter denne uken — tidligere vakter beholder navnet
    const inactiveWithShifts = teamFilteredWorkers
      .filter(w => w.status === 'inactive')
      .filter(w => weekShifts.some(s => {
        if (s.worker_id !== w.id) return false;
        if (filterTeam === 'all') {
          const workerTeams = w.teams || ['team1'];
          if (s.team) return workerTeams.includes(s.team);
          return true;
        }
        if (s.team) return s.team === filterTeam;
        return (w.teams?.[0] || 'team1') === filterTeam;
      }))
      .map(w => ({ ...w, isInactive: true, isVirtual: true }));

    // Tidligere ansatte (hard-slettet) med foreldreløse vakter + ledige vakter
    const realIds = new Set(workers.map(w => w.id));
    const shiftMatchesFilter = (s) => filterTeam === 'all' ? true : (!!s.team && s.team === filterTeam);
    const orphans = new Map();
    let ledigVisible = false;
    weekShifts.forEach(s => {
      if (s.worker_id === LEDIG_WORKER_ID) {
        if (shiftMatchesFilter(s)) ledigVisible = true;
        return;
      }
      if (!realIds.has(s.worker_id) && shiftMatchesFilter(s) && !orphans.has(s.worker_id)) {
        orphans.set(s.worker_id, {
          id: s.worker_id,
          name: s.worker_name || 'Tidligere ansatt',
          color: '#94a3b8',
          teams: [],
          status: 'inactive',
          hourly_rate: 0,
          employment_percentage: 100,
          isFormer: true,
          isVirtual: true,
        });
      }
    });
    const virtuals = [...orphans.values()];
    if (ledigVisible) {
      virtuals.push({
        id: LEDIG_WORKER_ID,
        name: 'Ledige vakter',
        color: '#10b981',
        teams: [],
        status: 'active',
        hourly_rate: 0,
        employment_percentage: 100,
        isLedig: true,
        isVirtual: true,
      });
    }
    return [...sortedBase, ...inactiveWithShifts, ...virtuals];
  }, [filterWorker, activeWorkers, workerOrder, sortByLabel, weekShifts, workers, teamFilteredWorkers, filterTeam]);

  const getShiftsForCell = (workerId, day) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    return weekShifts.filter(s => {
      if (s.worker_id !== workerId || s.date !== dayStr) return false;
      const w = workers.find(x => x.id === workerId);
      // Virtuelle rader (ledige / tidligere ansatte): ingen worker-post — match kun på vaktens avdeling
      if (!w) {
        if (filterTeam === 'all') return true;
        return !!s.team && s.team === filterTeam;
      }
      if (filterTeam === 'all') {
        // In "all teams" view: only show shifts that belong to the teams the worker is in
        const workerTeams = w.teams || ['team1'];
        if (s.team) return workerTeams.includes(s.team);
        return true;
      }
      // Specific team filter: only show shifts tagged to this team
      if (s.team) return s.team === filterTeam;
      // Untagged shift: only show if worker's primary team matches the filter
      return (w.teams?.[0] || 'team1') === filterTeam;
    });
  };

  // For a worker+day, find shifts that belong to OTHER teams (ghost indicators).
  const getOtherTeamShifts = (workerId, day) => {
    if (filterTeam === 'all') return [];
    const dayStr = format(day, 'yyyy-MM-dd');
    const worker = workers.find(w => w.id === workerId);
    if (!worker) return [];
    const workerTeams = worker.teams || ['team1'];
    if (!workerTeams.includes(filterTeam)) return [];
    // Tagged shifts from other teams show as ghosts
    // Also: untagged shifts show as ghosts if worker's primary team is NOT the current filter team
    const workerPrimaryTeam = workerTeams[0];
    return weekShifts.filter(s => {
      if (s.worker_id !== workerId || s.date !== dayStr) return false;
      if (s.team) return s.team !== filterTeam; // tagged: ghost if different team
      // untagged: ghost if worker's primary team is not the current filter
      return workerPrimaryTeam !== filterTeam;
    });
  };

  const getWorkerWeekTotal = (workerId) =>
    days.flatMap(day => getShiftsForCell(workerId, day)).reduce((sum, s) => sum + calcHours(s), 0);

  const getDayCost = (day) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    const displayWorkerIds = new Set(displayWorkers.map(w => w.id));
    return weekShifts.filter(s => {
      if (s.date !== dayStr || !displayWorkerIds.has(s.worker_id)) return false;
      if (filterTeam === 'all') {
        const w = workers.find(x => x.id === s.worker_id);
        const workerTeams = w?.teams || ['team1'];
        if (s.team) return workerTeams.includes(s.team);
        return true;
      }
      if (s.team) return s.team === filterTeam;
      const w = workers.find(x => x.id === s.worker_id);
      const workerPrimaryTeam = (w?.teams || ['team1'])[0];
      return workerPrimaryTeam === filterTeam;
    }).reduce((sum, s) => {
      const w = workers.find(x => x.id === s.worker_id);
      return sum + calcHours(s) * (w?.hourly_rate || 0);
    }, 0);
  };

  const getDayHours = (day) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    const displayWorkerIds = new Set(displayWorkers.map(w => w.id));
    return weekShifts.filter(s => {
      if (s.date !== dayStr || !displayWorkerIds.has(s.worker_id)) return false;
      if (filterTeam === 'all') {
        const w = workers.find(x => x.id === s.worker_id);
        const workerTeams = w?.teams || ['team1'];
        if (s.team) return workerTeams.includes(s.team);
        return true;
      }
      // Exclude ghost shifts: tagged to a different team
      if (s.team) return s.team === filterTeam;
      // Untagged: only count if worker's primary team matches the filter
      const w = workers.find(x => x.id === s.worker_id);
      const workerPrimaryTeam = (w?.teams || ['team1'])[0];
      return workerPrimaryTeam === filterTeam;
    }).reduce((sum, s) => sum + calcHours(s), 0);
  };

  const weekTotalCost = days.reduce((sum, day) => sum + getDayCost(day), 0);

  // Staffing budget for the active team filter (or team1 fallback)
  const budgetTeam = filterTeam !== 'all' ? filterTeam : 'team1';
  const budgetByHourDay = useStaffingBudget(budgetTeam);

  const getDayStaffingStatus = (day) => {
    if (Object.keys(budgetByHourDay).length === 0) return null;
    const dayKeys = ['mon','tue','wed','thu','fri','sat','sun'];
    const dayIndex = day.getDay() === 0 ? 6 : day.getDay() - 1; // Mon=0
    const dayKey = dayKeys[dayIndex];

    const budgetHours = Object.values(budgetByHourDay).reduce((sum, h) => sum + (h[dayKey] || 0), 0);
    if (budgetHours === 0) return null;

    // Reuse getDayHours which already correctly excludes ghost shifts
    const actualHours = getDayHours(day);

    const diff = actualHours - budgetHours;
    return { diff: Math.round(diff * 10) / 10, budgetHours, actualHours };
  };

  const selectedShifts = useMemo(() => {
    return weekShifts.filter(s => {
      const rowMatch = selectedRows.has(s.worker_id);
      const colMatch = selectedCols.has(s.date);
      if (!rowMatch && !colMatch) return false;
      // Exclude ghost shifts belonging to other departments — only include
      // shifts that would actually render as the current team's own shifts.
      const w = workers.find(x => x.id === s.worker_id);
      if (filterTeam === 'all') {
        if (!w) return true;
        const workerTeams = w.teams || ['team1'];
        if (s.team) return workerTeams.includes(s.team);
        return true;
      }
      if (!w) return false;
      if (s.team) return s.team === filterTeam;
      return (w.teams?.[0] || 'team1') === filterTeam;
    });
  }, [weekShifts, selectedRows, selectedCols, filterTeam, workers]);

  const toggleRow = (id) => setSelectedRows(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleCol = (dayStr) => setSelectedCols(prev => { const n = new Set(prev); n.has(dayStr) ? n.delete(dayStr) : n.add(dayStr); return n; });
  const clearSelection = () => { setSelectedRows(new Set()); setSelectedCols(new Set()); };

  const handleDeleteSelected = async () => {
    if (!selectedShifts.length) return;
    if (!window.confirm(`Slette ${selectedShifts.length} vakt${selectedShifts.length !== 1 ? 'er' : ''}?`)) return;
    for (const s of selectedShifts) {
      try { await base44.entities.Shift.delete(s.id); } catch { /* already deleted */ }
    }
    clearSelection();
    handleRefresh();
  };

  const handleCopySelectedToNextWeek = async () => {
    if (!selectedShifts.length) return;
    const newShifts = selectedShifts.map(s => {
      const d = new Date(s.date + 'T00:00:00');
      d.setDate(d.getDate() + 7);
      return { org_id: s.org_id, worker_id: s.worker_id, worker_name: s.worker_name, date: format(d, 'yyyy-MM-dd'), start_time: s.start_time, end_time: s.end_time, break_minutes: s.break_minutes || 0, notes: s.notes || '', shift_label: s.shift_label || '', status: 'scheduled', team: s.team || '' };
    });
    await base44.entities.Shift.bulkCreate(newShifts);
    clearSelection();
    handleRefresh();
  };
  const weekTotalHours = days.reduce((sum, day) => sum + getDayHours(day), 0);
  const handleRefresh = () => queryClient.invalidateQueries({ queryKey: ['shifts'], exact: false });

  // Draft/publish logic — begrenset til valgt avdeling (filterTeam).
  // Utkast fra andre avdelinger ("ghost"/andre team) holdes utenfor.
  const draftShifts = weekShifts.filter(s => {
    if (s.published) return false;
    if (s.worker_id === LEDIG_WORKER_ID) return false;
    const w = workers.find(x => x.id === s.worker_id);
    if (filterTeam === 'all') {
      if (!w) return true;
      const workerTeams = w.teams || ['team1'];
      if (s.team) return workerTeams.includes(s.team);
      return true;
    }
    if (!w) return false;
    if (s.team) return s.team === filterTeam;
    return (w.teams?.[0] || 'team1') === filterTeam;
  });
  const hasDrafts = draftShifts.length > 0;
  const publishLabel = filterTeam !== 'all'
    ? `Publiser ${teamNames[filterTeam] || filterTeam} (${draftShifts.length} utkast)`
    : `Publiser uke (${draftShifts.length} utkast)`;

  const handlePublishWeek = async () => {
    if (!hasDrafts) return;
    const ids = draftShifts.map(s => s.id);
    await base44.entities.Shift.updateMany({ id: { $in: ids } }, { $set: { published: true } });
    handleRefresh();
  };

  const startInlineEdit = (e, shift) => {
    e.stopPropagation();
    setInlineEditId(shift.id);
    setInlineEditData({ start_time: shift.start_time, end_time: shift.end_time });
  };

  const saveInlineEdit = async (shiftId) => {
    if (!inlineEditId) return;
    await base44.entities.Shift.update(shiftId, {
      start_time: inlineEditData.start_time,
      end_time: inlineEditData.end_time,
    });
    setInlineEditId(null);
    handleRefresh();
  };

  const handleDragEnd = async ({ type, source, destination, draggableId }) => {
    if (!destination) return;

    if (type === 'ROW') {
      if (sortByLabel) return;
      if (source.index === destination.index) return;
      const ids = displayWorkers.map(w => w.id);
      const [moved] = ids.splice(source.index, 1);
      ids.splice(destination.index, 0, moved);
      setWorkerOrder(ids);
      localStorage.setItem('timesheet_worker_order', JSON.stringify(ids));
      return;
    }
    if (type === 'SHIFT') {
      if (source.droppableId === destination.droppableId) return;
      const [newWorkerId, newDate] = destination.droppableId.split('__');
      const shift = shifts.find(s => s.id === draggableId);
      if (!shift) return;
      const newWorker = workers.find(w => w.id === newWorkerId);
      const update = {
        date: newDate,
        worker_id: newWorkerId,
        worker_name: newWorkerId === LEDIG_WORKER_ID ? LEDIG_WORKER_NAME : (newWorker?.name || shift.worker_name),
      };
      // Når en vakt flyttes i en spesifikk avdelingsvisning, behold avdelingen:
      // tagg vakten med aktiv team slik at den ikke "ghostes" til den nye
      // ansattes primæravdeling når de også jobber i en annen avdeling.
      if (filterTeam !== 'all') {
        update.team = filterTeam;
      }
      await base44.entities.Shift.update(draggableId, update);
      handleRefresh();
      return;
    }
    if (type === 'GROUPSHIFT') {
      // droppableId format: groupshift__{label}__{dayStr}
      const destParts = destination.droppableId.split('__');
      const newLabel = destParts[1];
      const newDate = destParts[2];
      const shift = shifts.find(s => s.id === draggableId);
      if (!shift) return;
      await base44.entities.Shift.update(draggableId, {
        shift_label: newLabel,
        date: newDate,
      });
      handleRefresh();
      return;
    }
  };

  // Group view: for each label group, get all shifts on each day
  const getGroupDayShifts = (label, day) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    return weekShifts.filter(s => {
      if ((s.shift_label || '') !== label || s.date !== dayStr) return false;
      const w = workers.find(x => x.id === s.worker_id);
      if (!w) return false;
      if (!isAdmin && !myTeams.some(t => (w.teams || ['team1']).includes(t))) return false;
      if (filterTeam !== 'all' && !(w.teams || (w.team ? [w.team] : ['team1'])).includes(filterTeam)) return false;
      return true;
    });
  };

  const getGroupStats = (label) => {
    const groupShifts = weekShifts.filter(s => {
      if ((s.shift_label || '') !== label) return false;
      const w = workers.find(x => x.id === s.worker_id);
      if (!w) return false;
      if (!isAdmin && !myTeams.some(t => (w.teams || ['team1']).includes(t))) return false;
      if (filterTeam !== 'all' && !(w.teams || (w.team ? [w.team] : ['team1'])).includes(filterTeam)) return false;
      return true;
    });
    const totalHours = groupShifts.reduce((sum, s) => sum + calcHours(s), 0);
    const totalCost = groupShifts.reduce((sum, s) => {
      const w = workers.find(x => x.id === s.worker_id);
      return sum + calcHours(s) * (w?.hourly_rate || 0);
    }, 0);
    return { totalHours, totalCost, count: groupShifts.length };
  };

  const fmtHours = (h) => {
    const hrs = Math.floor(h);
    const mins = Math.round((h - hrs) * 60);
    return `${hrs}t ${mins}m`;
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Visningsvalg: Uke / Dag */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
            {[['uke','Uke'],['dag','Dag']].map(([val, label]) => (
              <button key={val} onClick={() => {
                if (val === 'dag') {
                  const start = startOfWeek(new Date(), { weekStartsOn: 1 });
                  setSelectedDay(new Date());
                  setWeekStart(start);
                }
                setViewMode(val);
              }}
                className={`px-3 py-1.5 font-medium ${viewMode === val ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                {label}
              </button>
            ))}
          </div>
          {viewMode === 'uke' ? (
            <>
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium text-slate-700 text-center">
                <span className="text-xs text-slate-400 mr-1">Uke {getISOWeek(weekStart)}</span>
                {format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d, yyyy')}
              </span>
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" className="ml-1"
                onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
                I dag
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-slate-600" onClick={() => setShowCopy(true)}>
                <Copy className="w-3.5 h-3.5" /> Kopier uke
              </Button>
              <Button
                variant={sortByLabel ? 'default' : 'outline'}
                size="sm"
                className="gap-1.5"
                onClick={() => setSortByLabel(v => !v)}
              >
                <ArrowUpDown className="w-3.5 h-3.5" /> Sorter etter vakt
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => {
                const next = addDays(selectedDay, -1); setSelectedDay(next); setWeekStart(startOfWeek(next, { weekStartsOn: 1 }));
              }}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium text-slate-700 text-center">
                <span className="text-xs text-slate-400 mr-1">{format(selectedDay, 'EEE')}</span>
                {format(selectedDay, 'MMM d, yyyy')}
              </span>
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => {
                const next = addDays(selectedDay, 1); setSelectedDay(next); setWeekStart(startOfWeek(next, { weekStartsOn: 1 }));
              }}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" className="ml-1" onClick={() => {
                const next = new Date(); setSelectedDay(next); setWeekStart(startOfWeek(next, { weekStartsOn: 1 }));
              }}>
                I dag
              </Button>
            </>
          )}
          {canManageShifts && hasDrafts && (
            <Button
              size="sm"
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handlePublishWeek}
            >
              <Send className="w-3.5 h-3.5" /> {publishLabel}
            </Button>
          )}
          {canManageShifts && !hasDrafts && weekShifts.length > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium px-2 py-1 bg-emerald-50 rounded-lg border border-emerald-200">
              <Eye className="w-3.5 h-3.5" /> {filterTeam !== 'all' ? `${teamNames[filterTeam] || filterTeam} publisert` : 'Alle vakter publisert'}
            </span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {/* Team filter tabs */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
            {(isAdmin
              ? [['all','Alle team'], ...Object.entries(teamNames)]
              : myTeams.map(t => [t, teamNames[t] || t])
            ).map(([val, label]) => (
              <div key={val} className={`flex items-center transition-colors ${filterTeam === val ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                {editingTeamKey === val ? (
                  <input
                    autoFocus
                    className="px-2 py-2 font-medium bg-white text-slate-800 outline-none w-24 border-x border-slate-200"
                    value={editingTeamValue}
                    onChange={e => setEditingTeamValue(e.target.value)}
                    onBlur={() => saveTeamName(val, editingTeamValue)}
                    onKeyDown={e => { if (e.key === 'Enter') saveTeamName(val, editingTeamValue); if (e.key === 'Escape') setEditingTeamKey(null); }}
                  />
                ) : (
                  <button
                    onClick={() => setFilterTeam(val)}
                    onDoubleClick={() => { if (val !== 'all' && isAdmin) { setEditingTeamKey(val); setEditingTeamValue(label); } }}
                    className="px-3 py-2 font-medium w-full"
                    title={val !== 'all' && isAdmin ? 'Double-click to rename' : ''}
                  >
                    {label}
                  </button>
                )}
              </div>
            ))}
          </div>
          <Select value={filterWorker} onValueChange={setFilterWorker}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Alle ansatte" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle ansatte</SelectItem>
            {activeWorkers.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
          </SelectContent>
        </Select>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {LABEL_LEGEND.map(l => (
          <span key={l.label} className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-medium capitalize ${l.color}`}>
            {l.icon} {l.label}
          </span>
        ))}
      </div>

      {/* ===== DAG-VISNING (Gantt, Planday-stil) ===== */}
      {viewMode === 'dag' ? (
        <DayGantt
          day={selectedDay}
          workers={displayWorkers}
          shifts={weekShifts}
          availability={availability}
          filterTeam={filterTeam}
          onEdit={(worker, day) => setModalCell({ worker, day })}
          onAdd={(label) => {
            const anyWorker = displayWorkers[0];
            if (anyWorker) setModalCell({ worker: anyWorker, day: selectedDay, defaultLabel: label });
          }}
        />
      ) : sortByLabel ? (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="space-y-4">
            {GROUPS.map(group => {
              const stats = getGroupStats(group.label);
              return (
                <div key={group.label} className="rounded-xl border border-slate-200 overflow-hidden">
                  {/* Group header */}
                  <div className={`flex items-center justify-between px-4 py-2.5 ${group.headerClass}`}>
                    <span className="font-bold text-sm">{group.icon} {group.name}</span>
                    <span className="text-xs font-medium opacity-90">
                      {fmtHours(stats.totalHours)} / {stats.totalCost.toFixed(0)} kr / {stats.count} vakter
                    </span>
                  </div>
                  {/* Day columns table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-white border-b border-slate-100 text-slate-500 text-xs">
                          <th className="px-3 py-2 text-left font-medium w-28 sticky left-0 bg-white z-10"></th>
                          {days.map(day => {
                                const holiday = getHoliday(day);
                                return (
                                  <th key={day.toISOString()} className={`px-3 py-2 text-center font-medium min-w-[130px] ${holiday ? holiday.color : isSameDay(day, new Date()) ? 'text-blue-600' : ''}`}>
                                    <div>{format(day, 'EEE d. MMM')}</div>
                                    {holiday && <div className="text-xs font-normal">{holiday.icon} {holiday.name}</div>}
                                  </th>
                                );
                              })}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className={group.rowClass}>
                          <td className={`px-3 py-3 sticky left-0 z-10 align-top font-semibold text-slate-700 ${group.rowClass}`}>
                            <div className="text-xs">{group.name}</div>
                          </td>
                          {days.map(day => {
                            const dayStr = format(day, 'yyyy-MM-dd');
                            const cellDropId = `groupshift__${group.label}__${dayStr}`;
                            const dayShifts = getGroupDayShifts(group.label, day);
                            return (
                              <td key={day.toISOString()} className={`px-2 py-2 align-top border-l border-white/60 ${isSameDay(day, new Date()) ? 'bg-blue-50/40' : ''}`}>
                                <Droppable droppableId={cellDropId} type="GROUPSHIFT">
                                  {(cellProvided, cellSnapshot) => (
                                    <div
                                      ref={cellProvided.innerRef} {...cellProvided.droppableProps}
                                      className={`min-h-[48px] rounded transition-colors ${cellSnapshot.isDraggingOver ? 'ring-2 ring-inset ring-white/80 bg-white/40' : ''}`}
                                    >
                                      <div className="space-y-1.5">
                                        {dayShifts.map((s, si) => {
                                          const w = workers.find(x => x.id === s.worker_id);
                                          return (
                                            <Draggable key={s.id} draggableId={s.id} index={si}>
                                              {(shiftDrag, shiftSnapshot) => (
                                                <div
                                                  ref={shiftDrag.innerRef} {...shiftDrag.draggableProps} {...shiftDrag.dragHandleProps}
                                                  onClick={() => { if (!shiftSnapshot.isDragging && w) setModalCell({ worker: w, day }); }}
                                                  className={`bg-white rounded border border-slate-200 px-2 py-1.5 cursor-grab active:cursor-grabbing hover:shadow-sm transition-shadow
                                                    ${shiftSnapshot.isDragging ? 'shadow-lg ring-2 ring-blue-400 opacity-90' : ''}`}
                                                >
                                                  <div className="font-semibold text-slate-800 leading-tight truncate">{s.worker_name}</div>
                                                  <div className="text-slate-500 mt-0.5">{s.start_time} – {s.end_time}</div>
                                                </div>
                                              )}
                                            </Draggable>
                                          );
                                        })}
                                        {cellProvided.placeholder}
                                        <button
                                          className="w-full flex items-center justify-center h-7 rounded border border-dashed border-slate-300 text-slate-300 hover:text-blue-400 hover:border-blue-300 transition-colors"
                                          onClick={() => { const anyWorker = displayWorkers[0]; if (anyWorker) setModalCell({ worker: anyWorker, day }); }}
                                        >
                                          <Plus className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </Droppable>
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      ) : (
        /* ===== NORMAL WORKER-PER-ROW VIEW ===== */
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="md:hidden flex items-center justify-end px-2 py-1.5 border-b border-slate-100">
            <button
              type="button"
              aria-pressed={mobileSelectMode}
              className={`text-[11px] font-medium px-2.5 py-1 rounded-md border ${mobileSelectMode ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}
              onClick={() => setMobileSelectMode(v => !v)}
            >
              Rediger/Velg
            </button>
          </div>
          {/* Selection action bar */}
          {(selectedRows.size > 0 || selectedCols.size > 0) && (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-50 border-b border-blue-100">
              <CheckSquare className="w-4 h-4 text-blue-500" />
              <span className="text-sm text-blue-700 font-medium">{selectedShifts.length} vakt{selectedShifts.length !== 1 ? 'er' : ''} valgt</span>
              <Button size="sm" variant="outline" className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 ml-2" onClick={handleDeleteSelected}>
                <Trash2 className="w-3.5 h-3.5" /> Slett valgte
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50" onClick={handleCopySelectedToNextWeek}>
                <Copy className="w-3.5 h-3.5" /> Kopier til neste uke
              </Button>
              <button className="ml-auto text-xs text-slate-400 hover:text-slate-600" onClick={clearSelection}>Avbryt</button>
            </div>
          )}
          <div className="overflow-x-auto">
            <DragDropContext onDragEnd={handleDragEnd}>
              <table className={`text-xs border-collapse md:w-full max-md:table-fixed ${mobileSelectMode ? 'max-md:w-[582px]' : 'max-md:w-[514px]'}`}>
                <colgroup>
                  <col className={nameColClass} />
                  {days.map(d => <col key={d.toISOString()} className="w-[54px] min-w-[54px] md:w-[88px] md:min-w-[88px]" />)}
                  <col className="w-[56px] min-w-[56px] md:w-[64px] md:min-w-[64px]" />
                </colgroup>
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider max-md:text-[10px] max-md:tracking-normal">
                    <th className={`px-4 py-3 max-md:px-1.5 max-md:py-1 text-left font-medium sticky left-0 bg-blue-50 z-10 max-md:border-r max-md:border-slate-200 ${nameCellClass}`}>
                      <div className="flex items-center gap-2 max-md:gap-1 min-w-0">
                        <input type="checkbox"
                          className={`rounded border-slate-300 cursor-pointer shrink-0 ${mobileControlsClass}`}
                          checked={displayWorkers.length > 0 && displayWorkers.filter(w => !w.isVirtual).every(w => selectedRows.has(w.id))}
                          onChange={e => {
                            if (e.target.checked) setSelectedRows(new Set(displayWorkers.filter(w => !w.isVirtual).map(w => w.id)));
                            else setSelectedRows(new Set());
                          }}
                        />
                        <span className="truncate">Ansatt</span>
                      </div>
                    </th>
                    {days.map(day => {
                    const dayStr = format(day, 'yyyy-MM-dd');
                    const holiday = getHoliday(day);
                    return (
                      <th key={day.toISOString()} className={`px-3 py-3 max-md:px-0.5 max-md:py-1 text-center font-medium max-md:w-[54px] max-md:max-w-[54px] ${holiday ? holiday.color : isSameDay(day, new Date()) ? 'bg-blue-50 text-blue-700' : ''}`}>
                         <div className="flex flex-col items-center gap-1 max-md:gap-0">
                           <input type="checkbox"
                             className={`rounded border-slate-300 cursor-pointer ${mobileControlsClass}`}
                             checked={selectedCols.has(dayStr)}
                             onChange={() => toggleCol(dayStr)}
                           />
                           <div className="max-md:text-[10px] max-md:leading-none">{format(day, 'EEE')}</div>
                           <div className="text-xs font-normal mt-0.5 max-md:text-[9px] max-md:mt-0 max-md:leading-none">{format(day, 'MMM d')}</div>
                           {holiday && <div className="text-xs max-md:text-[8px] mt-0.5 font-normal truncate max-w-[100px] max-md:max-w-[50px] mx-auto">{holiday.icon} {holiday.name}</div>}
                         </div>
                       </th>
                     );
                    })}
                    <th className="px-4 py-3 max-md:px-1 max-md:py-1 text-center font-medium min-w-[80px] max-md:min-w-0 max-md:w-[56px]">Total</th>
                  </tr>
                </thead>
                <Droppable droppableId="rows" type="ROW">
                 {(rowProvided) => (
                   <tbody className="divide-y divide-slate-100" ref={rowProvided.innerRef} {...rowProvided.droppableProps}>
                     {displayWorkers.map((worker, index) => {
                       const weekTotal = getWorkerWeekTotal(worker.id);
                       // Max hours based on employment percentage and workplace setting
                       const fullTimeHours = wp?.full_time_hours_per_week || 37.5;
                       const maxWeekHours = ((worker.employment_percentage ?? 100) / 100) * fullTimeHours;
                       const isOverHours = !worker.isVirtual && worker.employment_percentage && weekTotal > maxWeekHours;
                       const isReadOnly = worker.isInactive || worker.isFormer;
                       const isLedigRow = worker.isLedig;
                       return (
                         <Draggable key={worker.id} draggableId={worker.id} index={index} isDragDisabled={!!worker.isVirtual || (isMobile && !mobileSelectMode)}>
                           {(rowDrag, rowSnapshot) => (
                             <tr ref={rowDrag.innerRef} {...rowDrag.draggableProps}
                               style={{ ...rowDrag.draggableProps.style, display: 'table-row' }}
                               className={`hover:bg-slate-50/50 ${rowSnapshot.isDragging ? 'bg-blue-50 shadow-md opacity-80' : ''} ${selectedRows.has(worker.id) ? 'bg-blue-50/30' : ''} ${isOverHours ? 'bg-red-50/30' : ''} ${worker.isInactive ? 'bg-slate-50/40' : ''} ${isLedigRow ? 'bg-emerald-50/40' : ''}`}>
                              <td className={`px-4 py-3 max-md:px-1.5 max-md:py-1 sticky left-0 z-10 max-md:border-r max-md:border-slate-200 ${nameCellClass} ${isLedigRow ? 'bg-emerald-100' : worker.isInactive ? 'bg-slate-100' : 'bg-blue-50'}`}>
                                <div className="flex items-center gap-2 max-md:gap-1 min-w-0">
                                  {!worker.isVirtual && (
                                    <input type="checkbox"
                                      className={`rounded border-slate-300 cursor-pointer shrink-0 ${mobileControlsClass}`}
                                      checked={selectedRows.has(worker.id)}
                                      onChange={() => toggleRow(worker.id)}
                                    />
                                  )}
                                  {!worker.isVirtual && (
                                    <span
                                      {...(attachDragHandle ? rowDrag.dragHandleProps : {})}
                                      className={`text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing shrink-0 ${mobileControlsClass}`}
                                    >
                                      <GripVertical className="w-3.5 h-3.5" />
                                    </span>
                                  )}
                                  <div className="w-4 h-4 md:w-5 md:h-5 shrink-0 rounded-full text-white text-[10px] flex items-center justify-center font-medium"
                                    style={{ backgroundColor: worker.color || '#3B82F6' }}>
                                    {worker.name?.charAt(0)}
                                  </div>
                                  <span title={worker.isFormer ? `${worker.name} (tidligere)` : worker.name} className={`min-w-0 max-md:truncate font-medium text-xs max-md:text-[11px] px-1.5 py-0.5 max-md:px-1 max-md:py-0 rounded-md ${isLedigRow ? 'text-emerald-700 bg-emerald-100' : worker.isInactive ? 'text-slate-500 bg-slate-200' : 'text-blue-800 bg-blue-50'}`}>
                                    <span className="md:hidden">{shortWorkerLabel(worker.name)}</span>
                                    <span className="hidden md:inline">{worker.name}{worker.isFormer && <span className="ml-1 text-[10px] text-slate-400">(tidligere)</span>}</span>
                                  </span>
                                </div>
                              </td>
                                {days.map(day => {
                                  const dayStr = format(day, 'yyyy-MM-dd');
                                  const cellId = `${worker.id}__${dayStr}`;
                                  const cellShifts = getShiftsForCell(worker.id, day);
                                  const otherShifts = getOtherTeamShifts(worker.id, day);
                                  // Ghost: worker has shifts on other teams but none on this team today
                                  const isGhostCell = otherShifts.length > 0 && cellShifts.length === 0;
                                  return (
                                     <td key={day.toISOString()} className={`px-1 py-1 max-md:px-0.5 max-md:py-0.5 align-top max-md:w-[54px] max-md:max-w-[54px] max-md:overflow-hidden ${getHoliday(day) ? 'bg-amber-50/40' : isSameDay(day, new Date()) ? 'bg-blue-50/20' : ''}`}>
                                       <Droppable droppableId={cellId} type="SHIFT" isDropDisabled={worker.isInactive || worker.isFormer}>
                                         {(cellProvided, cellSnapshot) => (
                                           <div ref={cellProvided.innerRef} {...cellProvided.droppableProps}
                                             className={`relative min-h-[40px] max-md:min-h-[28px] rounded transition-colors ${cellSnapshot.isDraggingOver ? 'bg-blue-100 ring-2 ring-blue-300 ring-inset' : ''}`}>
                                             {cellShifts.length > 0 ? (
                                               <div className="space-y-0.5">
                                                 {cellShifts.map((s, si) => {
                                                   const labelStyle = LABEL_STYLES[s.shift_label];
                                                   return (
                                                     <Draggable key={s.id} draggableId={s.id} index={si} isDragDisabled={isReadOnly}>
                                                       {(shiftDrag, shiftSnapshot) => {
                                                         const card = (
                                                         <div ref={shiftDrag.innerRef} {...shiftDrag.draggableProps} {...shiftDrag.dragHandleProps}
                                                           onClick={() => !isReadOnly && !shiftSnapshot.isDragging && inlineEditId !== s.id && setModalCell({ worker, day })}
                                                           className={`flex flex-col items-center gap-0.5 max-md:gap-0 rounded px-1 py-1 max-md:px-0.5 max-md:py-0.5 text-center transition-shadow ${isReadOnly ? 'cursor-default' : 'cursor-pointer'}
                                                             ${labelStyle?.cell || 'bg-slate-50'}
                                                             ${shiftSnapshot.isDragging ? 'shadow-2xl ring-2 ring-blue-400' : 'hover:shadow-sm'}`}
                                                           style={shiftSnapshot.isDragging ? { ...shiftDrag.draggableProps.style, zIndex: 9999, pointerEvents: 'auto' } : shiftDrag.draggableProps.style}>
                                                         {inlineEditId === s.id ? (
                                                           <div className="flex flex-col gap-0.5" onClick={e => e.stopPropagation()}
                                                             onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) saveInlineEdit(s.id); }}>
                                                             <input type="time" value={inlineEditData.start_time}
                                                               onChange={e => setInlineEditData(d => ({ ...d, start_time: e.target.value }))}
                                                               onKeyDown={e => { if (e.key === 'Enter') saveInlineEdit(s.id); if (e.key === 'Escape') setInlineEditId(null); }}
                                                               className="w-20 text-xs border border-blue-300 rounded px-1 py-0.5 text-center" autoFocus />
                                                             <input type="time" value={inlineEditData.end_time}
                                                               onChange={e => setInlineEditData(d => ({ ...d, end_time: e.target.value }))}
                                                               onKeyDown={e => { if (e.key === 'Enter') saveInlineEdit(s.id); if (e.key === 'Escape') setInlineEditId(null); }}
                                                               className="w-20 text-xs border border-blue-300 rounded px-1 py-0.5 text-center" />
                                                           </div>
                                                         ) : (
                                                           <>
                                                             <ShiftTimeText
                                                               start={s.start_time}
                                                               end={s.end_time}
                                                               className="text-xs max-md:text-[10px] text-slate-700 font-medium leading-tight max-md:leading-none max-md:whitespace-nowrap hover:text-blue-600 hover:underline"
                                                               onClick={e => { if (!worker.isVirtual) startInlineEdit(e, s); }}
                                                             />
                                                             {s.shift_label && <span className={`text-[10px] max-md:text-[8px] px-1 max-md:px-0.5 rounded font-medium capitalize leading-none ${labelStyle?.badge || 'bg-slate-100 text-slate-600'}`}>{s.shift_label}</span>}
                                                             {(() => {
                                                               const st = stampByWorkerDate.get(`${worker.id}__${dayStr}`);
                                                               const si = fmtStamp(st?.stamp_in);
                                                               const so = fmtStamp(st?.stamp_out);
                                                               if (!si && !so) return null;
                                                               return (
                                                                 <span className="flex items-center gap-0.5 text-[10px] max-md:text-[8px] px-1 max-md:px-0.5 py-0.5 max-md:py-0 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium max-md:whitespace-nowrap">
                                                                   <Clock className="w-2.5 h-2.5 max-md:hidden" />
                                                                   <span className="md:hidden">{compactShiftRange(si || '--:--', so || '--:--')}</span>
                                                                   <span className="hidden md:inline">{si || '--:--'}–{so || '--:--'}</span>
                                                                 </span>
                                                               );
                                                             })()}
                                                             {!s.published && (
                                                               <span className="flex items-center gap-0.5 text-xs max-md:text-[8px] px-1.5 py-0.5 max-md:px-0.5 max-md:py-0 rounded bg-amber-100 text-amber-700 border border-amber-200 font-medium max-md:whitespace-nowrap">
                                                                 <EyeOff className="w-2.5 h-2.5 max-md:hidden" /> Utkast
                                                               </span>
                                                             )}
                                                           </>
                                                         )}
                                                         </div>
                                                         );
                                                         // Lift the dragged card into a portal so it floats above the
                                                         // table instead of pushing/reflowing the grid while dragging —
                                                         // keeps the rows and page steady, like the Planday reference.
                                                         return shiftSnapshot.isDragging ? createPortal(card, document.body) : card;
                                                       }}
                                                     </Draggable>
                                                   );
                                                 })}
                                                 {/* Ghost indicators for other-team shifts */}
                                                 {otherShifts.map(os => {
                                                   const ghostTeamKey = os.team || (workers.find(w => w.id === os.worker_id)?.teams || ['team1'])[0];
                                                   return (
                                                     <div key={os.id} className="rounded px-1 py-0.5 max-md:px-0.5 max-md:py-0 bg-red-50 border border-red-200 text-center overflow-hidden">
                                                       <div className="text-xs max-md:text-[9px] text-red-500 font-semibold leading-tight truncate">{teamNames[ghostTeamKey] || ghostTeamKey}</div>
                                                       <ShiftTimeText start={os.start_time} end={os.end_time} className="text-xs max-md:text-[10px] max-md:leading-none text-red-400 max-md:whitespace-nowrap" />
                                                     </div>
                                                   );
                                                 })}
                                               </div>
                                             ) : isGhostCell ? (
                                               // Worker has shifts in another team — show red ghost with dept name + times
                                               <div className="flex flex-col gap-0.5 min-h-[40px] max-md:min-h-[28px] cursor-pointer" onClick={() => setModalCell({ worker, day })}>
                                                 {otherShifts.map(os => {
                                                   const ghostTeamKey = os.team || (workers.find(w => w.id === os.worker_id)?.teams || ['team1'])[0];
                                                   return (
                                                     <div key={os.id} className="flex flex-col items-center justify-center rounded bg-red-50 border border-red-200 px-1 py-1 max-md:px-0.5 max-md:py-0.5 gap-0.5 max-md:gap-0 overflow-hidden">
                                                       <div className="text-xs max-md:text-[9px] text-red-500 font-semibold leading-tight truncate max-w-full">{teamNames[ghostTeamKey] || ghostTeamKey}</div>
                                                       <ShiftTimeText start={os.start_time} end={os.end_time} className="text-xs max-md:text-[10px] max-md:leading-none text-red-400 font-medium max-md:whitespace-nowrap" />
                                                     </div>
                                                   );
                                                 })}
                                               </div>
                                             ) : isUnavailableOn(worker.id, day) ? (
                                               <div className="flex flex-col items-center justify-center min-h-[40px] max-md:min-h-[28px] rounded bg-red-50 border border-red-200 px-1 py-1 max-md:px-0.5 max-md:py-0.5 gap-0.5" title="Ansatt er markert utilgjengelig denne dagen">
                                                 <span className="text-[11px] max-md:text-[8px] text-red-600 font-semibold leading-tight">Utilgjengelig</span>
                                               </div>
                                             ) : worker.isVirtual ? (
                                               <div className="min-h-[40px] max-md:min-h-[28px]" />
                                             ) : (
                                               <div className="flex items-center justify-center min-h-[40px] max-md:min-h-[28px] cursor-pointer group" onClick={() => setModalCell({ worker, day })}>
                                                 <Plus className="w-3.5 h-3.5 text-slate-200 group-hover:text-blue-300 transition-colors" />
                                               </div>
                                             )}
                                             <span aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}>{cellProvided.placeholder}</span>
                                             </div>
                                             )}
                                             </Droppable>
                                     </td>
                                  );
                                })}
                                <td className="px-4 py-3 max-md:px-1 max-md:py-1 text-center max-md:text-[10px]">
                                  <div className="flex flex-col items-center gap-0.5">
                                    <span className={`font-bold ${isOverHours ? 'text-red-600' : 'text-slate-800'}`}>{fmtHours(weekTotal)}</span>
                                    {isOverHours && <span className="text-xs text-red-500 font-medium">maks {fmtHours(maxWeekHours)}</span>}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Draggable>
                        );
                      })}
                      {rowProvided.placeholder}
                    </tbody>
                  )}
                </Droppable>
                {displayWorkers.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 bg-slate-100">
                      <td className={`px-4 py-3 max-md:px-1.5 max-md:py-1 sticky left-0 bg-blue-100 z-10 text-xs max-md:text-[10px] font-bold text-slate-700 max-md:border-r max-md:border-slate-200 ${nameCellClass}`}>
                        <span className="max-md:block max-md:truncate">Total timer</span>
                      </td>
                      {days.map(day => {
                        const dayHours = getDayHours(day);
                        return (
                          <td key={day.toISOString()} className={`px-3 py-3 max-md:px-0.5 max-md:py-1 text-center text-xs max-md:text-[10px] font-bold text-slate-800 ${isSameDay(day, new Date()) ? 'bg-blue-50/50' : ''}`}>
                            {dayHours > 0 ? fmtHours(dayHours) : <span className="text-slate-300">—</span>}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 max-md:px-0.5 max-md:py-1 text-center text-xs max-md:text-[10px] font-bold text-slate-900">{fmtHours(weekTotalHours)}</td>
                    </tr>
                    <tr className="border-t border-slate-200 bg-slate-50">
                      <td className={`px-4 py-3 max-md:px-1.5 max-md:py-1 sticky left-0 bg-blue-50 z-10 text-xs max-md:text-[10px] font-semibold text-slate-600 max-md:border-r max-md:border-slate-200 ${nameCellClass}`}>
                        <span className="max-md:block max-md:truncate">Kostnad (eks. skatt)</span>
                      </td>
                      {days.map(day => {
                        const cost = getDayCost(day);
                        return (
                          <td key={day.toISOString()} className={`px-3 py-3 max-md:px-0.5 max-md:py-1 text-center text-xs max-md:text-[10px] font-medium text-slate-700 max-md:whitespace-nowrap ${isSameDay(day, new Date()) ? 'bg-blue-50/30' : ''}`}>
                            {cost > 0 ? `${cost.toFixed(0)} kr` : <span className="text-slate-300">—</span>}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 max-md:px-0.5 max-md:py-1 text-center text-xs max-md:text-[10px] font-bold text-slate-800 max-md:whitespace-nowrap">{weekTotalCost.toFixed(0)} kr</td>
                    </tr>
                    <tr className="border-t border-orange-100 bg-orange-50">
                      <td className={`px-4 py-3 max-md:px-1.5 max-md:py-1 sticky left-0 bg-blue-50 z-10 text-xs max-md:text-[10px] font-semibold text-orange-700 max-md:border-r max-md:border-slate-200 ${nameCellClass}`}>
                        <span className="max-md:block max-md:truncate">Kostnad (inkl. 24,3% skatt)</span>
                      </td>
                      {days.map(day => {
                        const cost = getDayCost(day) * (1 + PAYROLL_TAX);
                        return (
                          <td key={day.toISOString()} className={`px-3 py-3 max-md:px-0.5 max-md:py-1 text-center text-xs max-md:text-[10px] font-medium text-orange-700 max-md:whitespace-nowrap ${isSameDay(day, new Date()) ? 'bg-blue-50/30' : ''}`}>
                            {cost > 0 ? `${cost.toFixed(0)} kr` : <span className="text-orange-200">—</span>}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 max-md:px-0.5 max-md:py-1 text-center text-xs max-md:text-[10px] font-bold text-orange-800 max-md:whitespace-nowrap">{(weekTotalCost * (1 + PAYROLL_TAX)).toFixed(0)} kr</td>
                    </tr>
                    {Object.keys(budgetByHourDay).length > 0 && (
                      <tr className="border-t border-slate-200 bg-white">
                        <td className={`px-4 py-3 max-md:px-1.5 max-md:py-1 sticky left-0 bg-blue-50 z-10 text-xs max-md:text-[10px] font-semibold text-slate-600 max-md:border-r max-md:border-slate-200 ${nameCellClass}`}>
                          <span className="max-md:block max-md:truncate">Bemanning vs budsjett</span>
                        </td>
                        {days.map(day => {
                          const st = getDayStaffingStatus(day);
                          return (
                            <td key={day.toISOString()} className={`px-2 py-2 text-center ${isSameDay(day, new Date()) ? 'bg-blue-50/20' : ''}`}>
                              {!st ? <span className="text-slate-200 text-xs">—</span> :
                               st.diff <= 0 ? <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">{st.diff === 0 ? '0t' : `+${Math.abs(st.diff)}t`}</span> :
                               <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 font-medium">-{st.diff}t</span>
                              }
                            </td>
                          );
                        })}
                        <td />
                      </tr>
                    )}
                  </tfoot>
                )}
              </table>
            </DragDropContext>
          </div>
          {displayWorkers.length === 0 && (
            <div className="py-16 text-center text-sm text-slate-400">Ingen ansatte å vise</div>
          )}
        </div>
      )}

      {modalCell && (
        <ShiftCellModal
          worker={modalCell.worker}
          day={modalCell.day}
          shifts={getShiftsForCell(modalCell.worker.id, modalCell.day)}
          workers={activeWorkers}
          onClose={() => setModalCell(null)}
          onRefresh={handleRefresh}
          currentTeam={filterTeam}
          teamNames={teamNames}
          defaultShiftLabel={modalCell.defaultLabel}
        />
      )}

      {showCopy && (
        <CopyWeekModal
          weekStart={weekStart}
          currentTeam={filterTeam}
          weekShifts={weekShifts.filter(s => {
            const w = workers.find(x => x.id === s.worker_id);
            if (filterTeam === 'all') {
              if (!w) return true;
              const workerTeams = w.teams || ['team1'];
              if (s.team) return workerTeams.includes(s.team);
              return true;
            }
            if (!w) return false;
            if (s.team) return s.team === filterTeam;
            return (w.teams?.[0] || 'team1') === filterTeam;
          })}
          onClose={() => setShowCopy(false)}
          onRefresh={handleRefresh}
        />
      )}
    </div>
  );
}