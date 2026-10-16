import { useState } from 'react';
import { StoreWorkplaceCard } from '@/pages/Settings';
import { storeFieldsForWorker } from '@/contracts/employment';

const COMPANY = {
  workplace_name: 'Kiosk',
  workplace_address: 'Firmaadresse 1',
  apningstid_fra: '08:00',
  apningstid_til: '16:00',
};

const INITIAL = {
  ...COMPANY,
  team1_name: 'Sentrum',
  team1_address: '',
  team1_apningstid_fra: '',
  team1_apningstid_til: '',
  team1_apningstider: '',
  team1_notes: '',
  team2_name: 'Grünerløkka',
  team2_address: 'Butikkveien 2',
  team2_apningstid_fra: '10:00',
  team2_apningstid_til: '22:00',
  team2_apningstider: 'man–lør 10–22',
  team2_notes: 'Inngang fra bakgården',
};

function resolvedLine(worker, workplace) {
  const store = storeFieldsForWorker(worker, workplace);
  const summary = store.apningstider ? ` · ${store.apningstider}` : '';
  return `${store.sted} · ${store.apningstid_fra}–${store.apningstid_til}${summary}`;
}

/** Dev-only view of the per-store workplace card. Not included in production. */
export default function StoreSettingsPreview() {
  const [form, setForm] = useState(INITIAL);
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-xl mx-auto space-y-4">
        <StoreWorkplaceCard teamKeys={['team1', 'team2']} form={form} setForm={setForm} />
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm text-slate-700 space-y-1">
          <p data-testid="team1-resolved">Sentrum: {resolvedLine({ teams: ['team1'] }, form)}</p>
          <p data-testid="team2-resolved">Grünerløkka: {resolvedLine({ teams: ['team2'] }, form)}</p>
        </div>
      </div>
    </div>
  );
}
