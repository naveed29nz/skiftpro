import { Link } from 'react-router-dom';
import LegalFooter from '@/components/LegalFooter';
import { LEGAL_UPDATED } from '@/legal/publicCopy';

export default function LegalPage({ title, children }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
        <Link to="/login" className="text-sm text-blue-700 hover:underline">Tilbake til innlogging</Link>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-slate-500">Sist oppdatert: {LEGAL_UPDATED}</p>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 text-sm leading-6">
          {children}
        </div>
        <LegalFooter />
      </div>
    </div>
  );
}
