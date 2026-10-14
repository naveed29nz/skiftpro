import { Link } from 'react-router-dom';

export default function LegalFooter({ className = '' }) {
  return (
    <footer className={`text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-1 ${className}`}>
      <Link to="/personvern" className="hover:text-slate-800 hover:underline">Personvernerklæring</Link>
      <Link to="/vilkar" className="hover:text-slate-800 hover:underline">Vilkår</Link>
      <Link to="/databehandleravtale" className="hover:text-slate-800 hover:underline">Databehandleravtale</Link>
    </footer>
  );
}
