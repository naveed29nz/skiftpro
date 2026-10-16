import { OrgForm } from '@/pages/SuperAdmin';

const ORG = {
  id: 'org-nas',
  name: 'Butikkdrift Nas AS',
  org_number: '912 345 678',
  contact_name: 'ZAS',
  contact_email: 'post@example.com',
  admin_email: 'naveed@example.com',
  admin_user_id: 'naveed',
  employer_signatory_user_id: '',
  status: 'active',
  plan: 'pro',
  notes: '',
};

const PROFILES = [
  { id: 'super', email: 'super@example.com', full_name: 'Plattform Super', role: 'admin' },
  { id: 'other', email: 'other@example.com', full_name: 'Admin Annen', role: 'admin' },
  { id: 'naveed', email: 'naveed@example.com', full_name: 'Naveed Zafar', role: 'admin' },
  { id: 'dept', email: 'dept@example.com', full_name: 'Kari Avdeling', role: 'user' },
  { id: 'zas', email: 'zas@example.com', full_name: 'ZAS', role: 'user' },
];

const WORKERS = [
  { org_id: 'org-nas', email: 'dept@example.com', role: 'sub_admin', team_roles: { team1: 'sub_admin' } },
  { org_id: 'org-nas', email: 'sjef@example.com', role: 'butikksjef', team_roles: { team1: 'butikksjef' } },
  { org_id: 'org-other', email: 'other@example.com', role: 'admin', team_roles: {} },
];

/** Dev-only customer card. Not included in production. */
export default function CustomerCardPreview() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-lg mx-auto bg-white rounded-xl border border-slate-200 p-6">
        <h1 className="text-lg font-bold text-slate-900 mb-4">Rediger kunde</h1>
        <OrgForm
          org={ORG}
          profiles={PROFILES}
          workers={WORKERS}
          onSubmit={() => {}}
          onCancel={() => {}}
        />
      </div>
    </div>
  );
}
