
export default function ColleaguesToday({ shifts, workers, currentWorkerId, today, currentWorkerTeam }) {
  const todayColleagues = shifts
    .filter(s => s.date === today && s.worker_id !== currentWorkerId && s.status !== 'cancelled')
    .map(s => ({ ...s, worker: workers.find(w => w.id === s.worker_id) }))
    .filter(s => s.worker && (!currentWorkerTeam || (s.worker.teams || (s.worker.team ? [s.worker.team] : ['team1'])).includes(currentWorkerTeam)));

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">Colleagues Working Today</h3>
        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{todayColleagues.length} people</span>
      </div>
      {todayColleagues.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">No colleagues scheduled today</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {todayColleagues.map(s => (
            <div key={s.id} className="px-5 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full text-white text-sm flex items-center justify-center font-semibold shrink-0"
                style={{ backgroundColor: s.worker.color || '#3B82F6' }}>
                {s.worker.name?.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{s.worker.name}</p>
                <p className="text-xs text-slate-400">{s.worker.position || 'Worker'}</p>
              </div>
              <div className="text-right text-xs text-slate-500 shrink-0">
                <p className="font-medium text-slate-700">{s.start_time} – {s.end_time}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}