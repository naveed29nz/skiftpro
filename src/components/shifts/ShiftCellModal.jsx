import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Plus, Copy, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { nb } from 'date-fns/locale';
import { base44 } from '@/api/base44Client';
import { flushNotifications } from '@/utils/notify';
import { breakRulesForTeam, effectiveBreakMinutes, workerBreakOverride } from '@/utils/payCalc';
import { isFullDayAbsence, shiftLabelName } from '@/utils/shiftLabels';

const LABEL_STYLES = {
  morning: 'bg-amber-100 text-amber-700 border border-amber-200',
  middle:  'bg-blue-100 text-blue-700 border border-blue-200',
  evening: 'bg-purple-100 text-purple-700 border border-purple-200',
  sick:    'bg-red-100 text-red-700 border border-red-200',
  ferie:   'bg-sky-100 text-sky-700 border border-sky-200',
};

const LABEL_OPTIONS = [
  { value: 'none', label: 'Ingen merking' },
  { value: 'morning', label: '🌅 Morgen' },
  { value: 'middle', label: '☀️ Midt på dagen' },
  { value: 'evening', label: '🌙 Kveld' },
  { value: 'sick', label: '🤒 Syk' },
  { value: 'ferie', label: '🏖️ Ferie' },
];

const emptyShift = { worker_id: '', start_time: '08:00', end_time: '16:00', break_minutes: 30, break_manual: true, all_day: false, notes: '', shift_label: 'none', team: '' };

// Defined OUTSIDE the parent component to avoid remounting on every render
function ShiftForm({ data, setData, onSave, onCancel, saveLabel, loading, workers, worker, teamNames, wp, defaultTeam }) {
  const selectedWorkerId = data.worker_id || worker.id;
  const w = workers.find(x => x.id === selectedWorkerId) || worker;
  const workerTeams = w?.teams || ['team1'];
  const showTeamSelector = workerTeams.length > 1;
  const team = data.team || defaultTeam || workerTeams[0] || 'team1';
  const personalBreak = workerBreakOverride(w);
  const hasBreakRule = personalBreak != null || breakRulesForTeam(wp, team).length > 0;
  const automaticBreak = effectiveBreakMinutes({ ...data, team, break_manual: false, all_day: false }, wp, team, w);
  const absence = isFullDayAbsence(data.shift_label);
  const wholeDay = absence && data.all_day;

  return (
    <div className="space-y-2">
      {workers.length > 1 && (
        <div>
          <Label className="text-xs">Ansatt</Label>
          <Select value={selectedWorkerId} onValueChange={v => setData(d => ({ ...d, worker_id: v, team: '' }))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Velg ansatt" /></SelectTrigger>
            <SelectContent>
              {workers.map(wk => <SelectItem key={wk.id} value={wk.id}>{wk.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      {showTeamSelector && (
        <div>
          <Label className="text-xs">Avdeling</Label>
          <Select value={data.team || workerTeams[0]} onValueChange={v => setData(d => ({ ...d, team: v }))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Velg avdeling" /></SelectTrigger>
            <SelectContent>
              {workerTeams.map(t => (
                <SelectItem key={t} value={t}>{teamNames[t] || t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {!wholeDay && <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Start</Label>
          <Input
            type="time"
            value={data.start_time}
            onChange={e => setData(d => ({ ...d, start_time: e.target.value }))}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-xs">Slutt</Label>
          <Input
            type="time"
            value={data.end_time}
            onChange={e => setData(d => ({ ...d, end_time: e.target.value }))}
            className="h-8 text-xs"
          />
        </div>
      </div>}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Merking</Label>
          <Select value={data.shift_label || 'none'} onValueChange={v => setData(d => ({
            ...d,
            shift_label: v,
            all_day: v === 'ferie',
            start_time: v === 'ferie' ? '00:00' : (d.start_time === '00:00' ? '08:00' : d.start_time),
            end_time: v === 'ferie' ? '00:00' : (d.end_time === '00:00' ? '16:00' : d.end_time),
          }))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Ingen merking" /></SelectTrigger>
            <SelectContent>
              {LABEL_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Pause (min)</Label>
          {hasBreakRule && !wholeDay ? (
            <label className="flex items-center gap-1.5 text-[11px] text-slate-600 mb-1">
              <input
                type="checkbox"
                checked={!data.break_manual}
                onChange={(event) => setData(d => ({ ...d, break_manual: !event.target.checked, break_minutes: event.target.checked ? automaticBreak : d.break_minutes }))}
              />
              {personalBreak != null ? 'Egen pauseregel' : 'Automatisk'} ({automaticBreak} min)
            </label>
          ) : null}
          <Input
            type="number"
            value={!data.break_manual && hasBreakRule ? automaticBreak : data.break_minutes}
            disabled={wholeDay || (!data.break_manual && hasBreakRule)}
            onChange={e => setData(d => ({ ...d, break_manual: true, break_minutes: e.target.value }))}
            className="h-8 text-xs"
          />
        </div>
      </div>
      {absence && (
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={Boolean(data.all_day)}
            onChange={(event) => setData(d => ({ ...d, all_day: event.target.checked }))}
          />
          Hele dagen uten klokkeslett
        </label>
      )}
      <div>
        <Label className="text-xs">Notat</Label>
        <Input
          value={data.notes}
          onChange={e => setData(d => ({ ...d, notes: e.target.value }))}
          className="h-8 text-xs"
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="h-7 text-xs flex-1" onClick={onSave} disabled={loading}>{saveLabel}</Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onCancel}>Avbryt</Button>
      </div>
    </div>
  );
}

function shiftPayload(data, workerRecord, dayStr, team, wp) {
  const label = data.shift_label === 'none' ? '' : (data.shift_label || '');
  const allDay = Boolean(data.all_day) && isFullDayAbsence(label);
  const resolvedTeam = data.team || team || (workerRecord.teams || ['team1'])[0];
  const hasRule = workerBreakOverride(workerRecord) != null || breakRulesForTeam(wp, resolvedTeam).length > 0;
  const manual = allDay || !hasRule || data.break_manual !== false;
  const minutes = allDay
    ? 0
    : (manual
      ? (Number(data.break_minutes) || 0)
      : effectiveBreakMinutes({ ...data, team: resolvedTeam, break_manual: false, all_day: false }, wp, resolvedTeam, workerRecord));
  return {
    worker_id: workerRecord.id,
    worker_name: workerRecord.name,
    start_time: allDay ? '00:00' : data.start_time,
    end_time: allDay ? '00:00' : data.end_time,
    break_minutes: minutes,
    break_manual: manual,
    all_day: allDay,
    notes: data.notes,
    shift_label: label,
    team: data.team || team || undefined,
  };
}

export default function ShiftCellModal({ worker, day, shifts, workers = [], onClose, onRefresh, currentTeam, teamNames = {}, defaultShiftLabel, wp, locked = false }) {
  const dayStr = format(day, 'yyyy-MM-dd');
  const dayLabel = format(day, 'EEEE d. MMM', { locale: nb });

  const defaultTeam = currentTeam && currentTeam !== 'all' ? currentTeam : (worker.teams?.[0] || '');

  const [adding, setAdding] = useState(false);
  const [newShift, setNewShift] = useState(() => {
    const team = defaultTeam || worker.teams?.[0] || 'team1';
    const label = defaultShiftLabel || emptyShift.shift_label;
    return {
      ...emptyShift,
      worker_id: worker.id,
      team: defaultTeam,
      shift_label: label,
      all_day: label === 'ferie',
      break_manual: workerBreakOverride(worker) == null && breakRulesForTeam(wp, team).length === 0,
    };
  });
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [loading, setLoading] = useState(false);

  const resolveWorker = (id) => workers.find(w => w.id === id) || worker;

  const handleAdd = async () => {
    setLoading(true);
    const w = resolveWorker(newShift.worker_id || worker.id);
    const workerTeams = w.teams || ['team1'];
    const team = newShift.team || defaultTeam || workerTeams[0];
    await base44.entities.Shift.create({
      org_id: w.org_id,
      date: dayStr,
      status: 'scheduled',
      published: false,
      ...shiftPayload(newShift, w, dayStr, team, wp),
    });
    setAdding(false);
    resetNewShift();
    setLoading(false);
    onRefresh();
    flushNotifications();
  };

  const resetNewShift = () => {
    const team = defaultTeam || worker.teams?.[0] || 'team1';
    setNewShift({
      ...emptyShift,
      worker_id: worker.id,
      team: defaultTeam,
      shift_label: defaultShiftLabel || emptyShift.shift_label,
      all_day: defaultShiftLabel === 'ferie',
      break_manual: workerBreakOverride(worker) == null && breakRulesForTeam(wp, team).length === 0,
    });
  };

  const handleEdit = async (shiftId) => {
    setLoading(true);
    const w = resolveWorker(editData.worker_id);
    await base44.entities.Shift.update(shiftId, shiftPayload(editData, w, dayStr, editData.team || defaultTeam, wp));
    setEditingId(null);
    setLoading(false);
    onRefresh();
    flushNotifications();
  };

  const handleDelete = async (shiftId) => {
    setLoading(true);
    await base44.entities.Shift.delete(shiftId);
    setLoading(false);
    onRefresh();
    flushNotifications();
  };

  const handleCopy = async (shift) => {
    setLoading(true);
    await base44.entities.Shift.create({
      org_id: shift.org_id || resolveWorker(shift.worker_id).org_id,
      worker_id: shift.worker_id,
      worker_name: shift.worker_name,
      date: dayStr,
      start_time: shift.start_time,
      end_time: shift.end_time,
      break_minutes: shift.break_minutes || 0,
      break_manual: shift.break_manual !== false,
      all_day: Boolean(shift.all_day),
      notes: shift.notes || '',
      shift_label: shift.shift_label || '',
      status: 'scheduled',
      team: shift.team || '',
    });
    setLoading(false);
    onRefresh();
    flushNotifications();
  };

  const startEdit = (shift) => {
    setEditingId(shift.id);
    setEditData({
      worker_id: shift.worker_id,
      start_time: shift.start_time,
      end_time: shift.end_time,
      break_minutes: shift.break_minutes || 0,
      break_manual: shift.break_manual !== false,
      all_day: Boolean(shift.all_day),
      notes: shift.notes || '',
      shift_label: shift.shift_label || 'none',
      team: shift.team || '',
    });
    setAdding(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full text-white text-xs flex items-center justify-center font-medium"
                style={{ backgroundColor: worker.color || '#3B82F6' }}>
                {worker.name?.charAt(0)}
              </div>
              <span>{worker.name}</span>
            </div>
            <p className="text-sm text-slate-400 font-normal mt-0.5">{dayLabel}</p>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {shifts.length === 0 && !adding && (
            <p className="text-sm text-slate-400 text-center py-3">Ingen vakter denne dagen</p>
          )}

          {shifts.map(shift => (
            <div key={shift.id} className="border border-slate-200 rounded-lg p-3">
              {editingId === shift.id ? (
                <ShiftForm
                  data={editData}
                  setData={setEditData}
                  onSave={() => handleEdit(shift.id)}
                  onCancel={() => setEditingId(null)}
                  saveLabel="Lagre"
                  loading={loading}
                  workers={workers}
                  worker={worker}
                  teamNames={teamNames}
                  wp={wp}
                  defaultTeam={defaultTeam}
                />
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium text-slate-800">{shift.all_day ? 'Hele dagen' : `${shift.start_time} – ${shift.end_time}`}</p>
                        {shift.shift_label && (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${LABEL_STYLES[shift.shift_label] || 'bg-slate-100 text-slate-600'}`}>
                            {shiftLabelName(shift.shift_label) || shift.shift_label}
                          </span>
                        )}
                        {shift.team && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                            {teamNames[shift.team] || shift.team}
                          </span>
                        )}
                      </div>
                      {shift.worker_name && shift.worker_id !== worker.id && (
                        <p className="text-xs text-slate-500">{shift.worker_name}</p>
                      )}
                      {shift.break_minutes > 0 && !shift.all_day && <p className="text-xs text-slate-400">{shift.break_minutes} min pause{shift.break_manual === false ? ' (automatisk)' : ''}</p>}
                      {shift.hours_approved && <p className="text-xs text-emerald-600">Timer godkjent</p>}
                      {shift.notes && <p className="text-xs text-slate-400">{shift.notes}</p>}
                    </div>
                  </div>
                  {!locked && <div className="flex gap-1 border-t border-slate-100 pt-2">
                    <Button
                      variant="ghost" size="sm"
                      className="h-7 text-xs px-2 flex-1 gap-1 text-slate-600 hover:text-blue-600 hover:bg-blue-50"
                      onClick={() => startEdit(shift)}
                    >
                      <Pencil className="w-3 h-3" /> Edit
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      className="h-7 text-xs px-2 flex-1 gap-1 text-slate-600 hover:text-green-600 hover:bg-green-50"
                      onClick={() => handleCopy(shift)}
                      disabled={loading}
                    >
                      <Copy className="w-3 h-3" /> Kopier
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      className="h-7 text-xs px-2 flex-1 gap-1 text-red-400 hover:text-red-600 hover:bg-red-50"
                      onClick={() => handleDelete(shift.id)}
                      disabled={loading}
                    >
                      <Trash2 className="w-3 h-3" /> Slett
                    </Button>
                  </div>}
                </div>
              )}
            </div>
          ))}

          {adding && (
            <div className="border border-blue-200 bg-blue-50/30 rounded-lg p-3">
              <ShiftForm
                data={newShift}
                setData={setNewShift}
                onSave={handleAdd}
                onCancel={() => setAdding(false)}
                saveLabel="Legg til vakt"
                loading={loading}
                workers={workers}
                worker={worker}
                teamNames={teamNames}
                wp={wp}
                defaultTeam={defaultTeam}
              />
            </div>
          )}
        </div>

        {locked && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Lønnsperioden er låst. Vaktene kan ikke endres før perioden låses opp.</p>}
        {!adding && !locked && (
          <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" onClick={() => { setAdding(true); setEditingId(null); }}>
            <Plus className="w-3.5 h-3.5" /> Legg til vakt
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}