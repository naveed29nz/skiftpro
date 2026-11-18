// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format, parseISO } from 'date-fns';
import { nb } from 'date-fns/locale';
import { Sparkles, Undo2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import {
  autoDraftIds,
  eachDate,
  formatHours,
  planDraft,
} from '@/lib/autoSchedule';
import {
  staffingBudgetQuery,
  staffingBudgetQueryKey,
} from '@/lib/staffingBudget';

const SOCIAL = 1 + 0.141 + 0.12;

function kr(value) {
  return `${Math.round(value).toLocaleString('nb-NO')} kr`;
}

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export default function AutoPlanModal({
  orgId,
  teams = [],
  initialTeam = '',
  weekStart,
  workers = [],
  fullTimeHours = 37.5,
  showWages = false,
  dateLocked = () => false,
  onClose,
  onRefresh,
  seed = null,
  readOnly = false,
}) {
  const queryClient = useQueryClient();
  const [team, setTeam] = useState(initialTeam && initialTeam !== 'all' ? initialTeam : (teams[0]?.key || ''));
  const [fromDate, setFromDate] = useState(format(weekStart, 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(addDays(weekStart, 6), 'yyyy-MM-dd'));
  const [replaceDrafts, setReplaceDrafts] = useState(false);
  const [plan, setPlan] = useState(null);
  const [savedIds, setSavedIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const rangeReady = validDate(fromDate) && validDate(toDate);
  const historyStart = rangeReady ? format(addDays(parseISO(fromDate), -28), 'yyyy-MM-dd') : null;

  const shiftQuery = useQuery({
    queryKey: ['shifts', orgId, 'autoplan', historyStart, toDate],
    enabled: Boolean(!seed && orgId && historyStart && toDate),
    queryFn: () => base44.entities.Shift.filter(
      { org_id: orgId, date: { $gte: historyStart, $lte: toDate } },
      'date',
      3000,
    ),
  });
  const availabilityQuery = useQuery({
    queryKey: ['availability', orgId, 'autoplan', fromDate, toDate],
    enabled: Boolean(!seed && orgId && rangeReady),
    queryFn: () => base44.entities.Availability.filter(
      { org_id: orgId, date: { $gte: fromDate, $lte: toDate } },
      'date',
      2000,
    ),
  });
  const budgetQuery = useQuery({
    queryKey: staffingBudgetQueryKey(orgId),
    enabled: Boolean(!seed && orgId),
    queryFn: () => {
      const request = staffingBudgetQuery(orgId);
      if (!request) return [];
      return base44.entities.StaffingBudget.filter(request.filters, request.sort, request.limit);
    },
  });

  const loadedShifts = seed?.shifts || shiftQuery.data || [];
  const loadedAvailability = seed?.availability || availabilityQuery.data || [];
  const loadedBudgets = seed?.budgets || budgetQuery.data || [];
  const loading = !seed && (shiftQuery.isLoading || availabilityQuery.isLoading || budgetQuery.isLoading);
  const teamLabel = teams.find((item) => item.key === team)?.label || team;

  const existingAuto = useMemo(() => autoDraftIds(loadedShifts, {
    team,
    fromDate,
    toDate,
    workers,
    orgId,
  }), [loadedShifts, team, fromDate, toDate, workers, orgId]);

  const clearPreview = () => {
    if (saved) return;
    setPlan(null);
  };

  const seededOnce = useRef(false);
  const preview = () => {
    const lockedDates = rangeReady ? eachDate(fromDate, toDate).filter((date) => dateLocked(date)) : [];
    const next = planDraft({
      orgId,
      team,
      fromDate,
      toDate,
      workers,
      shifts: loadedShifts,
      availability: loadedAvailability,
      budgets: loadedBudgets,
      replaceDrafts,
      lockedDates,
      fullTimeHours,
    });
    setPlan(next);
    setSaved(false);
    setSavedIds([]);
  };

  useEffect(() => {
    if (!seed || seededOnce.current) return;
    seededOnce.current = true;
    preview();
    // The local preview opens with a finished summary. Live use still clicks Forhåndsvis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    if (readOnly || !plan || saving) return;
    if (!plan.shifts.length && !plan.deleteIds.length) return;
    setSaving(true);
    try {
      for (const id of plan.deleteIds) {
        const row = loadedShifts.find((shift) => shift.id === id);
        if (row && row.published === false) await base44.entities.Shift.delete(id);
      }
      const created = plan.shifts.length ? await base44.entities.Shift.bulkCreate(plan.shifts) : [];
      setSavedIds((created || []).map((row) => row.id).filter(Boolean));
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ['shifts'], exact: false });
      onRefresh?.();
      toast({
        title: 'Utkast lagret',
        description: 'Vaktene er upublisert. Rediger dem og publiser uken når du er fornøyd.',
      });
    } catch (error) {
      toast({ title: 'Kunne ikke lagre utkastet', description: error?.message || 'Prøv igjen.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const discard = async (ids) => {
    const unique = [...new Set(ids)].filter(Boolean);
    if (!unique.length || saving) return;
    if (!window.confirm(`Forkaste ${unique.length} auto-utkast? Publiserte vakter beholdes.`)) return;
    setSaving(true);
    try {
      const fresh = await base44.entities.Shift.filter(
        { org_id: orgId, date: { $gte: fromDate, $lte: toDate } },
        'date',
        2000,
      );
      const victims = fresh.filter((shift) => unique.includes(shift.id) && shift.published === false);
      for (const shift of victims) await base44.entities.Shift.delete(shift.id);
      const kept = unique.length - victims.length;
      toast({
        title: 'Utkast forkastet',
        description: kept > 0 ? `${victims.length} slettet. ${kept} publiserte vakter ble beholdt.` : `${victims.length} upubliserte vakter slettet.`,
      });
      setPlan(null);
      setSaved(false);
      setSavedIds([]);
      await queryClient.invalidateQueries({ queryKey: ['shifts'], exact: false });
      onRefresh?.();
    } catch (error) {
      toast({ title: 'Kunne ikke forkaste utkastet', description: error?.message || 'Prøv igjen.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const budgetActive = loadedBudgets.some((row) => row.team === team && row.org_id === orgId);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg" data-testid="auto-plan-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-blue-600" />
            Lag utkast med auto-planlegging
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <p className="text-xs leading-relaxed text-slate-500">
            Lager upubliserte utkast for {teamLabel || 'valgt butikk'} ut fra de siste 4 ukene
            {budgetActive ? ' og prognosen' : ''}. Hull fylles. Publiserte vakter overskrives ikke.
          </p>

          <div className="space-y-1.5">
            <Label className="text-xs">Butikk</Label>
            <select
              value={team}
              data-testid="auto-plan-team"
              onChange={(event) => { setTeam(event.target.value); clearPreview(); }}
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
            >
              {teams.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Fra</Label>
              <input
                type="date"
                value={fromDate}
                data-testid="auto-plan-from"
                onChange={(event) => { setFromDate(event.target.value); clearPreview(); }}
                className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Til</Label>
              <input
                type="date"
                value={toDate}
                data-testid="auto-plan-to"
                onChange={(event) => { setToDate(event.target.value); clearPreview(); }}
                className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm"
              />
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-1 rounded border-slate-300"
              checked={replaceDrafts}
              data-testid="auto-plan-replace"
              onChange={(event) => { setReplaceDrafts(event.target.checked); clearPreview(); }}
            />
            <span>
              <span className="font-medium">Erstatt eksisterende utkast</span>
              <span className="block text-xs text-slate-500">Bare upubliserte arbeidsvakter. Publiserte vakter, sykdom og ferie beholdes.</span>
            </span>
          </label>

          {!readOnly && !saved && existingAuto.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-50"
              disabled={saving}
              onClick={() => discard(existingAuto)}
            >
              <Undo2 className="h-3.5 w-3.5" /> Forkast auto-utkast ({existingAuto.length})
            </Button>
          )}

          {plan && (
            <div className="space-y-3" data-testid="auto-plan-summary">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Før</p>
                  <p className="font-medium text-slate-800">{plan.before.shiftCount} vakter</p>
                  <p className="text-xs text-slate-500">{formatHours(plan.before.hours)} t</p>
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-blue-500">Etter</p>
                  <p className="font-medium text-slate-800">{plan.after.shiftCount} vakter</p>
                  <p className="text-xs text-slate-600">{formatHours(plan.after.hours)} t · {plan.assignedCount} tildelt, {plan.openCount} ledige</p>
                </div>
              </div>

              <p className="text-xs text-slate-600">
                {plan.createdCount === 0
                  ? 'Ingen nye vakter.'
                  : `${plan.createdCount} nye utkast${plan.deleteIds.length ? `, ${plan.deleteIds.length} gamle utkast fjernes` : ''}.`}
                {rangeReady && ` ${format(parseISO(fromDate), 'd. MMM', { locale: nb })}–${format(parseISO(toDate), 'd. MMM yyyy', { locale: nb })}.`}
              </p>

              {plan.hoursByWorker.length > 0 && (
                <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
                  {plan.hoursByWorker.map((row) => (
                    <li key={row.workerId} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="font-medium text-slate-800">{row.name}</span>
                      <span className="text-right text-xs text-slate-500">
                        +{formatHours(row.addedHours)} t
                        <span className="block">
                          {formatHours(row.weekHours)} t denne uka
                          {row.contractHours > 0 ? ` · kontrakt ${formatHours(row.contractHours)} t` : ' · tilkalling'}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {plan.usedBudget && (
                <p className="text-xs text-slate-600">
                  Timer mot prognose: {formatHours(plan.wage.plannedHours)} t planlagt, {formatHours(plan.wage.budgetHours)} t i prognosen.
                </p>
              )}

              {showWages && plan.wage.plannedCost != null && (
                <div className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">
                  <p>Estimert lønn (timesats, uten tillegg): <span className="font-medium text-slate-800">{kr(plan.wage.plannedCost)}</span></p>
                  <p>Inkl. AGA og feriepenger: <span className="font-medium text-slate-800">{kr(plan.wage.plannedCost * SOCIAL)}</span></p>
                  {plan.wage.budgetCost != null && (
                    <p>Prognosen med samme snitt-timesats: <span className="font-medium text-slate-800">{kr(plan.wage.budgetCost)}</span> ({kr(plan.wage.budgetCost * SOCIAL)} inkl. AGA og feriepenger)</p>
                  )}
                  {plan.wage.ratesMissing && <p className="mt-1 text-amber-800">Noen ansatte mangler timesats, så beløpet er ufullstendig.</p>}
                </div>
              )}

              {plan.openCount > 0 && (
                <p className="text-xs text-slate-500">
                  Ledige vakter merkes «Ledig vakt» og blir stående som utkast. Publiser tar ikke med ledige vakter før noen er satt på dem.
                </p>
              )}

              {plan.warnings.length > 0 && (
                <ul className="space-y-1">
                  {plan.warnings.map((text) => (
                    <li key={text} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">{text}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {readOnly && (
            <p className="text-xs text-slate-500">Forhåndsvisning skriver ikke til databasen. I vaktplanen lagres dette som upublisert utkast.</p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {saved ? (
              <>
                <Button type="button" variant="outline" className="gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-50" disabled={saving} onClick={() => discard(savedIds.length ? savedIds : existingAuto)}>
                  <Undo2 className="h-3.5 w-3.5" /> Forkast dette utkastet
                </Button>
                <Button type="button" onClick={onClose}>Lukk</Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={onClose}>Avbryt</Button>
                <Button type="button" variant="outline" data-testid="auto-plan-preview" disabled={loading || !team || !rangeReady} onClick={preview}>
                  {loading ? 'Henter…' : 'Forhåndsvis'}
                </Button>
                <Button
                  type="button"
                  data-testid="auto-plan-save"
                  disabled={readOnly || !plan || saving || (plan.createdCount === 0 && plan.deleteIds.length === 0)}
                  onClick={save}
                >
                  {saving ? 'Lagrer…' : 'Lagre som utkast'}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
