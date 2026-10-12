import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, Users } from 'lucide-react';

const COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'];
const emptyRow = () => ({ name: '', position: '', hourly_rate: '', teams: ['team1'], color: COLORS[Math.floor(Math.random() * COLORS.length)] });

export default function BulkAddWorkers({ onClose, onSave, teamNames = { team1: 'Team 1', team2: 'Team 2', team3: 'Team 3' } }) {
  const [rows, setRows] = useState([emptyRow(), emptyRow()]);
  const [loading, setLoading] = useState(false);

  const update = (i, field, value) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, [field]: value } : r));

  const toggleTeam = (i, key) => setRows(rs => rs.map((r, idx) => {
    if (idx !== i) return r;
    const has = r.teams.includes(key);
    if (has && r.teams.length === 1) return r;
    return { ...r, teams: has ? r.teams.filter(t => t !== key) : [...r.teams, key] };
  }));

  const addRow = () => setRows(rs => [...rs, emptyRow()]);
  const removeRow = (i) => setRows(rs => rs.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    const valid = rows.filter(r => r.name.trim() && r.hourly_rate);
    if (!valid.length) return;
    setLoading(true);
    await onSave(valid.map(r => ({ ...r, hourly_rate: parseFloat(r.hourly_rate) || 0, status: 'active' })));
    setLoading(false);
    onClose();
  };

  const validCount = rows.filter(r => r.name.trim() && r.hourly_rate).length;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            Add Multiple Workers
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_1fr_100px_auto_32px] gap-2 text-xs font-medium text-slate-500 px-1">
            <span>Name *</span>
            <span>Position</span>
            <span>Hourly Rate *</span>
            <span>Teams</span>
            <span></span>
          </div>

          {rows.map((row, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_100px_auto_32px] gap-2 items-center bg-slate-50 rounded-lg px-3 py-2">
              <Input
                value={row.name}
                onChange={e => update(i, 'name', e.target.value)}
                placeholder="Full name"
                className="h-8 text-sm bg-white"
              />
              <Input
                value={row.position}
                onChange={e => update(i, 'position', e.target.value)}
                placeholder="Position"
                className="h-8 text-sm bg-white"
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                value={row.hourly_rate}
                onChange={e => update(i, 'hourly_rate', e.target.value)}
                placeholder="0.00"
                className="h-8 text-sm bg-white"
              />
              <div className="flex gap-3 flex-wrap">
                {[['team1', teamNames.team1], ['team2', teamNames.team2], ['team3', teamNames.team3]].map(([key, name]) => (
                  <label key={key} className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox checked={row.teams.includes(key)} onCheckedChange={() => toggleTeam(i, key)} className="h-3.5 w-3.5" />
                    <span className="text-xs text-slate-600">{name}</span>
                  </label>
                ))}
              </div>
              <button
                onClick={() => rows.length > 1 && removeRow(i)}
                className="text-slate-300 hover:text-red-400 transition-colors disabled:opacity-30"
                disabled={rows.length === 1}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          <Button variant="outline" size="sm" className="w-full gap-2 border-dashed" onClick={addRow}>
            <Plus className="w-3.5 h-3.5" /> Add Row
          </Button>
        </div>

        <div className="flex justify-between items-center pt-2">
          <span className="text-sm text-slate-400">{validCount} worker{validCount !== 1 ? 's' : ''} ready to save</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={loading || validCount === 0}>
              {loading ? 'Saving...' : `Save ${validCount} Worker${validCount !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}