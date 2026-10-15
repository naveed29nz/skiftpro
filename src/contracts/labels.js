export const CONTRACT_STATUS = {
  utkast: { label: 'Utkast', color: 'bg-slate-100 text-slate-700' },
  sendt: { label: 'Sendt', color: 'bg-blue-100 text-blue-700' },
  apnet: { label: 'Åpnet', color: 'bg-sky-100 text-sky-800' },
  signert_ansatt: { label: 'Signert av ansatt', color: 'bg-amber-100 text-amber-800' },
  signert: { label: 'Signert', color: 'bg-emerald-100 text-emerald-700' },
  godkjent: { label: 'Signert', color: 'bg-emerald-100 text-emerald-700' },
  avvist: { label: 'Avvist', color: 'bg-red-100 text-red-700' },
  utlopt: { label: 'Utløpt', color: 'bg-orange-100 text-orange-800' },
  trukket: { label: 'Trukket', color: 'bg-slate-100 text-slate-500' },
};

export const CONTRACT_TYPES = {
  fast: { label: 'Fast', color: 'bg-indigo-100 text-indigo-700' },
  midlertidig_vikar: { label: 'Midlertidig vikar', color: 'bg-violet-100 text-violet-700' },
  tilkalling_ramme: { label: 'Tilkalling', color: 'bg-amber-100 text-amber-700' },
  butikksjef_ledende: { label: 'Butikksjef, ledende', color: 'bg-slate-800 text-white' },
  merarbeid: { label: 'Merarbeid', color: 'bg-orange-100 text-orange-800' },
  bilag: { label: 'Bilag', color: 'bg-teal-100 text-teal-800' },
  ekstrahjelp: { label: 'Ekstrahjelp', color: 'bg-amber-100 text-amber-700' },
};

export function contractStatus(status) {
  return CONTRACT_STATUS[status] || CONTRACT_STATUS.utkast;
}

export function contractType(type) {
  return CONTRACT_TYPES[type] || { label: type || 'Avtale', color: 'bg-slate-100 text-slate-700' };
}
