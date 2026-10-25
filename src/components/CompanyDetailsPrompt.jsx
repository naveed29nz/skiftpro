import { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Building2 } from 'lucide-react';
import CompanyDetailsFields from '@/components/CompanyDetailsFields';
import { companyDetailsError, completeOrganizationArgs } from '@/lib/orgNumber';
import { queryClientInstance } from '@/lib/query-client';

export default function CompanyDetailsPrompt({ org, userEmail }) {
  const [form, setForm] = useState({
    companyName: org?.name || '',
    orgNumber: org?.org_number || '',
    contactName: org?.contact_name || '',
    phone: org?.contact_phone || '',
    storeCount: org?.store_quantity ? String(org.store_quantity) : '1',
  });
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const problem = companyDetailsError(form);
    if (problem) {
      setError(problem);
      return;
    }
    setPending(true);
    setError('');
    const { error: rpcError } = await supabase.rpc('complete_organization_profile', completeOrganizationArgs(form));
    if (rpcError) {
      setPending(false);
      setError(rpcError.message);
      return;
    }
    await queryClientInstance.invalidateQueries({ queryKey: ['organizations'] });
    setPending(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center p-4 py-8">
      <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-200 shadow-lg p-8 w-full max-w-md space-y-4">
        <div className="text-center">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">Opplysninger om bedriften</h1>
          <p className="text-slate-500 text-sm mt-1">
            Organisasjonsnummeret mangler. Bare administratoren ser dette. Ansatte kan jobbe som vanlig.
          </p>
        </div>
        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Firmanavn skal være bedriftens navn. Kontaktperson er personen som administrerer kontoen.
        </p>
        <CompanyDetailsFields value={form} onChange={setForm} email={userEmail} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? 'Lagrer…' : 'Lagre opplysninger'}
        </Button>
      </form>
    </div>
  );
}
