import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, planDraft, rankEmployees } from './autoSchedule.js';
import {
  PREVIEW_ORG,
  PREVIEW_TEAM,
  PREVIEW_WEEK,
  previewAvailability,
  previewSeed,
  previewWorkers,
} from './autoPlanPreviewData.js';

test('the local demo preview fills gaps and suggests a ranked employee', () => {
  const seed = previewSeed();
  const plan = planDraft({
    orgId: PREVIEW_ORG,
    team: PREVIEW_TEAM,
    fromDate: PREVIEW_WEEK,
    toDate: addDays(PREVIEW_WEEK, 6),
    workers: previewWorkers,
    ...seed,
  });

  assert.equal(plan.shifts.every((row) => row.published === false), true);
  assert.equal(plan.shifts.some((row) => row.date === PREVIEW_WEEK && row.start_time === '07:00'), false);
  assert.ok(plan.createdCount >= 5);
  assert.equal(plan.shifts.some((row) => row.worker_id === 'sara'), false);
  assert.equal(plan.shifts.some((row) => row.worker_id === 'kari' && row.date === addDays(PREVIEW_WEEK, 3)), false);
  assert.equal(plan.deleteIds.length, 0);
  assert.equal(plan.usedBudget, true);
  assert.ok(plan.wage.plannedCost > 0);

  const wednesday = addDays(PREVIEW_WEEK, 2);
  const ranked = rankEmployees({
    orgId: PREVIEW_ORG,
    team: PREVIEW_TEAM,
    workers: previewWorkers,
    shifts: seed.shifts,
    availability: previewAvailability(),
    candidate: {
      date: wednesday,
      start_time: '15:00',
      end_time: '23:00',
      shift_label: 'evening',
      break_minutes: 30,
      team: PREVIEW_TEAM,
    },
  });
  assert.ok(ranked.suggestions.length >= 1);
  assert.ok(ranked.suggestions.length <= 5);
  assert.equal(ranked.suggestions.some((row) => row.workerId === 'jonas'), false);
  assert.ok(ranked.byWorkerId.jonas.warnings.some((text) => text.includes('utilgjengelig')));
  assert.match(ranked.suggestions[0].reasons.join(' '), /t denne uka/);
});
