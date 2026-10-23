import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2 } from 'lucide-react';

function rulesOf(form, teamKey) {
  const value = form[`${teamKey}_break_rules`];
  return Array.isArray(value) ? value : [];
}

export default function PayrollRulesCard({ teamKeys, form, setForm }) {
  const setRules = (teamKey, rules) => {
    setForm((current) => ({ ...current, [`${teamKey}_break_rules`]: rules }));
  };

  const setEnabled = (teamKey, enabled) => {
    setForm((current) => ({ ...current, [`${teamKey}_auto_break`]: enabled }));
  };

  const updateRule = (teamKey, index, patch) => {
    const next = rulesOf(form, teamKey).map((rule, ruleIndex) => (
      ruleIndex === index ? { ...rule, ...patch } : rule
    ));
    setRules(teamKey, next);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-800">Automatisk pause</h2>
        <p className="text-xs text-slate-400 mt-1">
          Valgfritt per avdeling. Av er standard, og da trekkes ingen pause automatisk.
          Flere regler kan brukes samtidig, for eksempel 30 minutter når vakten er lengre enn 6 timer.
          En vakt kan fortsatt overstyres manuelt.
        </p>
      </div>
      {teamKeys.map((teamKey) => {
        const rules = rulesOf(form, teamKey);
        const name = form[`${teamKey}_name`] || teamKey;
        const enabled = form[`${teamKey}_auto_break`] === true;
        return (
          <div key={teamKey} className="border border-slate-100 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-slate-700 text-sm">{name}</p>
                <p className="text-xs text-slate-400">{enabled ? 'På' : 'Av'}</p>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor={`${teamKey}-auto-break`} className="text-xs text-slate-600">Automatisk pause</Label>
                <Switch
                  id={`${teamKey}-auto-break`}
                  checked={enabled}
                  onCheckedChange={(checked) => setEnabled(teamKey, checked)}
                  aria-label={`Automatisk pause for ${name}`}
                />
              </div>
            </div>
            {!enabled && (
              <p className="text-xs text-slate-500">
                Av. Timelister og lønn bruker ikke pausereglene
                {rules.length > 0 ? ', selv om de er lagret under.' : '.'}
              </p>
            )}
            {rules.length === 0 && (
              <p className="text-xs text-slate-400">Ingen regler ennå.</p>
            )}
            {rules.map((rule, index) => (
              <div key={index} className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Når vakten er lengre enn (timer)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    className="h-8 text-xs w-28"
                    value={rule.after_minutes ? rule.after_minutes / 60 : ''}
                    onChange={(event) => updateRule(teamKey, index, {
                      after_minutes: Math.round((Number(event.target.value) || 0) * 60),
                    })}
                    aria-label={`Timer før pause for ${name}, regel ${index + 1}`}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Trekk pause (min)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    className="h-8 text-xs w-28"
                    value={rule.break_minutes ?? ''}
                    onChange={(event) => updateRule(teamKey, index, {
                      break_minutes: Number(event.target.value) || 0,
                    })}
                    aria-label={`Pauseminutter for ${name}, regel ${index + 1}`}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-400"
                  onClick={() => setRules(teamKey, rules.filter((_, ruleIndex) => ruleIndex !== index))}
                  aria-label={`Slett pauseregel ${index + 1} for ${name}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
            <button
              type="button"
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium"
              onClick={() => setRules(teamKey, [...rules, { after_minutes: 360, break_minutes: 30 }])}
            >
              <Plus className="w-4 h-4" /> Legg til pauseregel
            </button>
          </div>
        );
      })}
    </div>
  );
}
