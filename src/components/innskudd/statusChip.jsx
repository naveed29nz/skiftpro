const TONE = {
  slate: 'bg-slate-100 text-slate-700',
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-emerald-100 text-emerald-700',
  red: 'bg-red-100 text-red-700',
  amber: 'bg-amber-200 text-amber-900',
};

export default function StatusChip({ tone, children, className = '' }) {
  return (
    <span className={`inline-flex text-xs px-2 py-1 rounded-full font-medium leading-snug ${TONE[tone] || TONE.slate} ${className}`}>
      {children}
    </span>
  );
}
