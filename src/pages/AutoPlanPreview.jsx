// @ts-nocheck
import { useState } from 'react';
import { addDays } from 'date-fns';
import AutoPlanModal from '@/components/timesheet/AutoPlanModal';
import ShiftCellModal from '@/components/shifts/ShiftCellModal';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';
import {
  PREVIEW_ORG,
  PREVIEW_TEAM,
  previewAvailability,
  previewSeed,
  previewShifts,
  previewWorkers,
} from '@/lib/autoPlanPreviewData';

const TEAMS = [{ key: PREVIEW_TEAM, label: 'Narvesen Demo Sentrum' }];
const WEEK = new Date(2026, 10, 16);

/** Dev-only screen. The engine runs on the demo prognose shape. Nothing is saved. */
export default function AutoPlanPreview() {
  const [screen, setScreen] = useState(() => (
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('skjerm') === 'vakt'
      ? 'shift'
      : 'plan'
  ));
  const storeWorkers = previewWorkers.filter((worker) => worker.teams.includes(PREVIEW_TEAM));
  const jonas = storeWorkers.find((worker) => worker.id === 'jonas');

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="border-b border-slate-200 bg-white px-4 py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">SkiftPro · lokal forhåndsvisning</p>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">Narvesen Demo Sentrum</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Uke 16.–22. november 2026. Mønster og prognose tilsvarer demobutikken. Eksempelansatte, ingenting lagres.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" className="gap-1.5" data-testid="auto-plan-button" onClick={() => setScreen('plan')}>
            <Sparkles className="h-4 w-4" /> Lag utkast
          </Button>
          <Button type="button" variant="outline" data-testid="open-shift-editor" onClick={() => setScreen('shift')}>
            Ny vakt
          </Button>
        </div>
      </div>

      {screen === 'plan' && (
        <AutoPlanModal
          orgId={PREVIEW_ORG}
          teams={TEAMS}
          initialTeam={PREVIEW_TEAM}
          weekStart={WEEK}
          workers={previewWorkers}
          showWages
          seed={previewSeed()}
          readOnly
          onClose={() => setScreen(null)}
        />
      )}

      {screen === 'shift' && (
        <ShiftCellModal
          worker={jonas}
          day={addDays(WEEK, 2)}
          shifts={[]}
          workers={storeWorkers}
          onClose={() => setScreen(null)}
          onRefresh={() => {}}
          currentTeam={PREVIEW_TEAM}
          teamNames={{ team1: 'Narvesen Demo Sentrum' }}
          defaultShiftLabel="morning"
          initialAdding
          suggestForce
          knownShifts={previewShifts()}
          knownAvailability={previewAvailability()}
        />
      )}
    </div>
  );
}
