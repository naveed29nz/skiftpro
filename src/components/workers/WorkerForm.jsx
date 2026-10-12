import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

const COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'];

export default function WorkerForm({ worker, onSubmit, onCancel, teamNames = { team1: 'Team 1' } }) {
  const [form, setForm] = useState({
    name: worker?.name || '',
    email: worker?.email || '',
    phone: worker?.phone || '',
    hourly_rate: worker?.hourly_rate || '',
    position: worker?.position || '',
    status: worker?.status || 'active',
    color: worker?.color || COLORS[Math.floor(Math.random() * COLORS.length)],
    teams: worker?.teams || (worker?.team ? [worker.team] : ['team1']),
    role: worker?.role || 'user',
    team_roles: worker?.team_roles || {},
    employment_type: worker?.employment_type || 'timelønn',
    employment_percentage: worker?.employment_percentage ?? 100,
    disabled_extras: worker?.disabled_extras || [],
    can_see_resultat: worker?.can_see_resultat || false,
  });

  const toggleTeam = (teamKey) => {
    setForm(f => {
      const has = f.teams.includes(teamKey);
      if (has && f.teams.length === 1) return f; // must have at least one
      return { ...f, teams: has ? f.teams.filter(t => t !== teamKey) : [...f.teams, teamKey] };
    });
  };

  const toggleExtra = (extra) => {
    setForm(f => ({
      ...f,
      disabled_extras: f.disabled_extras.includes(extra)
        ? f.disabled_extras.filter(e => e !== extra)
        : [...f.disabled_extras, extra],
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Derive global role = highest role across assigned teams
    const ROLE_RANK = { admin: 4, sub_admin: 3, butikksjef: 2, user: 1 };
    const teamRoleValues = form.teams.map(t => form.team_roles[t] || 'user');
    const highestRole = teamRoleValues.reduce((best, r) => (ROLE_RANK[r] || 1) > (ROLE_RANK[best] || 1) ? r : best, 'user');
    onSubmit({ ...form, hourly_rate: parseFloat(form.hourly_rate) || 0, role: highestRole });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Name *</Label>
          <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full name" required />
        </div>
        <div className="space-y-1.5">
          <Label>Position</Label>
          <Input value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} placeholder="e.g. Barista, Server" />
        </div>
        <div className="space-y-1.5">
          <Label>Hourly Rate *</Label>
          <Input type="number" step="0.01" min="0" value={form.hourly_rate} onChange={e => setForm({ ...form, hourly_rate: e.target.value })} placeholder="0.00" required />
        </div>
        <div className="space-y-1.5">
          <Label>Stillingsprosent (%)</Label>
          <Input type="number" min="1" max="100" step="1" value={form.employment_percentage} onChange={e => setForm({ ...form, employment_percentage: parseFloat(e.target.value) || 100 })} placeholder="100" />
        </div>
        <div className="space-y-1.5">
          <Label>Ansatttype</Label>
          <Select value={form.employment_type} onValueChange={v => setForm({ ...form, employment_type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="timelønn">Timelønn</SelectItem>
              <SelectItem value="fastlønn">Fastlønn</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Avdelinger og rolle per avdeling</Label>
          <div className="mt-1 space-y-2">
            {Object.entries(teamNames).map(([key, name]) => (
              <div key={key} className="flex items-center gap-3">
                <Checkbox
                  checked={form.teams.includes(key)}
                  onCheckedChange={() => toggleTeam(key)}
                />
                <span className="text-sm text-slate-700 w-24 shrink-0">{name}</span>
                {form.teams.includes(key) && (
                  <Select
                    value={form.team_roles[key] || form.role || 'user'}
                    onValueChange={v => setForm(f => ({ ...f, team_roles: { ...f.team_roles, [key]: v } }))}
                  >
                    <SelectTrigger className="h-7 text-xs w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">Ansatt</SelectItem>
                      <SelectItem value="butikksjef">Butikksjef</SelectItem>
                      <SelectItem value="sub_admin">Sub-admin</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-1">Rolle bestemmer tilgang per avdeling når den ansatte er logget inn.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
        </div>
        <div className="space-y-1.5">
          <Label>Phone</Label>
          <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+1 234 567 890" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Tilgang</Label>
        <div className="flex gap-4 flex-wrap mt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={form.can_see_resultat}
              onCheckedChange={v => setForm(f => ({ ...f, can_see_resultat: !!v }))}
            />
            <span className="text-sm text-slate-700">Resultat-tilgang</span>
          </label>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Tillegg som gjelder</Label>
        <div className="flex gap-4 flex-wrap mt-1">
          {[['sunday', 'Søndagstillegg'], ['holiday', 'Helligdagstillegg']].map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={!form.disabled_extras.includes(key)}
                onCheckedChange={() => toggleExtra(key)}
              />
              <span className="text-sm text-slate-700">{label}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Color</Label>
        <div className="flex gap-2 flex-wrap">
          {COLORS.map(c => (
            <button key={c} type="button" onClick={() => setForm({ ...form, color: c })}
              className={`w-8 h-8 rounded-full border-2 transition-all ${form.color === c ? 'border-slate-800 scale-110' : 'border-transparent'}`}
              style={{ backgroundColor: c }} />
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit">{worker ? 'Update' : 'Add Worker'}</Button>
      </div>
    </form>
  );
}