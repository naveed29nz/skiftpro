import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shield } from 'lucide-react';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin', desc: 'Full tilgang til alt' },
  { value: 'butikksjef', label: 'Butikksjef', desc: 'Timesheet, ansatte og lønn for eget team' },
  { value: 'user', label: 'Ansatt', desc: 'Kun Min Portal' },
];

const ROLE_COLORS = {
  admin: 'bg-purple-100 text-purple-700',
  butikksjef: 'bg-blue-100 text-blue-700',
  user: 'bg-slate-100 text-slate-600',
};

export default function UserAccessSection({ currentUserId }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(null);

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  const handleRoleChange = async (userId, newRole) => {
    setSaving(userId);
    await base44.entities.User.update(userId, { role: newRole });
    queryClient.invalidateQueries({ queryKey: ['users'] });
    setSaving(null);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="w-5 h-5 text-blue-600" />
        <h2 className="text-base font-semibold text-slate-800">Brukertilgang</h2>
      </div>
      <p className="text-xs text-slate-400">Endre tilgangsnivå for hver bruker i systemet.</p>

      <div className="space-y-2">
        {users.map(u => (
          <div key={u.id} className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 last:border-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-semibold text-sm shrink-0">
                {u.full_name?.charAt(0) || u.email?.charAt(0) || '?'}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{u.full_name || '—'}</p>
                <p className="text-xs text-slate-400 truncate">{u.email}</p>
              </div>
              {u.id === currentUserId && <span className="text-xs text-slate-400 shrink-0">(deg)</span>}
            </div>
            <div className="shrink-0">
              {u.id === currentUserId ? (
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ROLE_COLORS[u.role] || ROLE_COLORS.user}`}>
                  {ROLE_OPTIONS.find(r => r.value === u.role)?.label || u.role}
                </span>
              ) : (
                <Select
                  value={u.role || 'user'}
                  onValueChange={v => handleRoleChange(u.id, v)}
                  disabled={saving === u.id}
                >
                  <SelectTrigger className="h-8 text-xs w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map(r => (
                      <SelectItem key={r.value} value={r.value}>
                        <div>
                          <span className="font-medium">{r.label}</span>
                          <span className="text-slate-400 ml-1.5 text-xs">{r.desc}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        ))}
        {users.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Ingen brukere funnet</p>}
      </div>
    </div>
  );
}