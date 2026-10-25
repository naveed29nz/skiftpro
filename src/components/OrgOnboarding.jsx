import { useEffect, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Building2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import BillingCard from '@/components/BillingCard';
import CompanyDetailsFields from '@/components/CompanyDetailsFields';
import { companyDetailsError, startOrganizationArgs } from '@/lib/orgNumber';

export default function OrgOnboarding({ userId, userEmail }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    companyName: '',
    orgNumber: '',
    contactName: '',
    phone: '',
    storeCount: '1',
  });
  const [invites, setInvites] = useState('');
  const [orgId, setOrgId] = useState(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      const meta = data?.user?.user_metadata || {};
      setForm((current) => ({
        companyName: current.companyName || meta.company_name || '',
        orgNumber: current.orgNumber || meta.org_number || '',
        contactName: current.contactName || meta.full_name || '',
        phone: current.phone || meta.contact_phone || '',
        storeCount: meta.store_count || current.storeCount || '1',
      }));
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const createOrg = async (event) => {
    event.preventDefault();
    const problem = companyDetailsError(form);
    if (problem) {
      setError(problem);
      return;
    }
    setPending(true);
    setError('');
    const { data, error: rpcError } = await supabase.rpc('start_organization', startOrganizationArgs(form));
    setPending(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setOrgId(row?.id || null);
    setStep(2);
  };

  const sendInvites = async () => {
    setPending(true);
    setError('');
    const emails = invites.split(/[\s,;]+/).map((email) => email.trim()).filter(Boolean);
    for (const email of emails) {
      try {
        await base44.users.inviteUser(email, 'user');
      } catch (inviteError) {
        setError(inviteError.message || 'Kunne ikke invitere alle.');
        setPending(false);
        return;
      }
    }
    setPending(false);
    setStep(3);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center p-4 py-8">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-8 w-full max-w-md space-y-4">
        <div className="text-center">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">Velkommen til SkiftPro</h1>
          <p className="text-slate-500 text-sm mt-1">Steg {step} av 3. Opprett organisasjon, butikk og ansatte.</p>
        </div>

        {step === 1 && (
          <form onSubmit={createOrg} className="space-y-4">
            <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Er du ansatt? Ikke opprett bedrift – be lederen din om invitasjon.
            </p>
            <CompanyDetailsFields value={form} onChange={setForm} email={userEmail} />
            <Button type="submit" className="w-full" disabled={pending}>{pending ? 'Oppretter…' : 'Opprett organisasjon'}</Button>
          </form>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <Label>Inviter ansatte</Label>
            <textarea
              className="w-full min-h-28 border border-slate-200 rounded-lg p-3 text-sm"
              placeholder="en e-post per linje"
              value={invites}
              onChange={(event) => setInvites(event.target.value)}
            />
            <p className="text-xs text-slate-500">De får rollen ansatt. Bare administrator kan senere endre rolle og timelønn.</p>
            <Button type="button" className="w-full" disabled={pending} onClick={sendInvites}>
              {pending ? 'Sender…' : 'Send invitasjoner'}
            </Button>
            <button type="button" className="text-sm text-slate-500 underline" onClick={() => setStep(3)}>Hopp over</button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <BillingCard orgId={orgId} />
            <Button type="button" className="w-full" onClick={() => window.location.assign('/Dashboard')}>Gå til oversikten</Button>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        <p className="text-[11px] text-slate-400">Kontoen {userEmail || userId} er knyttet til denne organisasjonen.</p>
        <p className="text-[11px] text-slate-500">
          <Link to="/personvern" className="underline">Personvern</Link>
          {' · '}
          <Link to="/vilkar" className="underline">Vilkår</Link>
        </p>
      </div>
    </div>
  );
}
