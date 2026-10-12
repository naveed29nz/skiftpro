import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2 } from 'lucide-react';

/**
 * Shown to admin users who have no org yet — lets them set up their organization.
 */
export default function OrgOnboarding({ userId, userEmail }) {
  const [form, setForm] = useState({ name: '', org_number: '', contact_phone: '' });
  const queryClient = useQueryClient();

  const createMut = useMutation({
    mutationFn: async (data) => {
      const org = await base44.entities.Organization.create({
        ...data,
        admin_user_id: userId,
        admin_email: userEmail,
        status: 'active',
        plan: 'basic',
      });
      // Create a default WorkplaceSetting for the org
      await base44.entities.WorkplaceSetting.create({ org_id: org.id, workplace_name: data.name });
      return org;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['workplace-settings'] });
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name) return;
    createMut.mutate(form);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">Velkommen til ShiftFlow!</h1>
          <p className="text-slate-500 text-sm mt-1">Sett opp din organisasjon for å komme i gang.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Organisasjonsnavn *</Label>
            <Input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="f.eks. Kaffehuset AS"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Org.nummer (valgfritt)</Label>
            <Input
              value={form.org_number}
              onChange={e => setForm({ ...form, org_number: e.target.value })}
              placeholder="123 456 789"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Telefon (valgfritt)</Label>
            <Input
              value={form.contact_phone}
              onChange={e => setForm({ ...form, contact_phone: e.target.value })}
              placeholder="+47 123 45 678"
            />
          </div>
          <Button type="submit" className="w-full mt-2" disabled={createMut.isPending}>
            {createMut.isPending ? 'Oppretter...' : 'Opprett organisasjon'}
          </Button>
        </form>
      </div>
    </div>
  );
}