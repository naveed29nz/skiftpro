import { Link } from 'react-router-dom';
import LegalFooter from '@/components/LegalFooter';

export default function LegalPage({ title, children }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
        <Link to="/login" className="text-sm text-blue-700 hover:underline">Tilbake til innlogging</Link>
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Utkast — må gjennomgås av jurist før lansering</p>
          <p className="mt-1">Denne teksten er et arbeidsutkast for SkiftPro og er ikke en endelig juridisk vurdering.</p>
        </div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 text-sm leading-6">
          {children}
        </div>
        <LegalFooter />
      </div>
    </div>
  );
}
