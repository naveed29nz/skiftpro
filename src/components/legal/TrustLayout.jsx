import { useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { TRUST_NAV } from '@/legal/routes';
import LegalFooter from '@/components/LegalFooter';

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  }[char]));
}

function downloadArticle(filename, title, updated) {
  const article = document.getElementById('legal-article');
  if (!article) return;
  const heading = `<h1>${escapeHtml(title)}</h1>${updated ? `<p>Sist oppdatert ${escapeHtml(updated)}</p>` : ''}`;
  const html = `<!DOCTYPE html><html lang="nb"><head><meta charset="utf-8"><title>${escapeHtml(title)} – SkiftPro</title>
<style>
  body{font-family:Georgia,serif;max-width:800px;margin:2rem auto;padding:0 1rem;line-height:1.55;color:#1e293b}
  h1,h2,h3{font-family:system-ui,sans-serif}
  table{border-collapse:collapse;width:100%;font-family:system-ui,sans-serif;font-size:13px}
  td,th{border:1px solid #cbd5e1;padding:6px 8px;vertical-align:top;text-align:left}
</style></head><body>${heading}${article.innerHTML}</body></html>`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function TrustLayout({
  title,
  kicker = 'Personvern og sikkerhet',
  updated = '',
  lede = '',
  children,
  downloadName = '',
  bare = false,
}) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} – SkiftPro`;
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <div className="legal-shell min-h-screen bg-[#f6f4ef] text-slate-800">
      <header className="legal-no-print bg-[#172554] text-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link to="/" className="text-sm font-semibold tracking-tight text-white">SkiftPro</Link>
          <Link to="/login" className="text-sm text-blue-200 hover:text-white hover:underline">Logg inn</Link>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-900">{kicker}</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-serif text-3xl text-slate-900">{title}</h1>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {updated && <p className="text-slate-500">Sist oppdatert {updated}</p>}
            {downloadName && (
              <div className="legal-no-print flex gap-3">
                <button type="button" className="text-blue-800 underline" onClick={() => window.print()}>
                  Skriv ut
                </button>
                <button type="button" className="text-blue-800 underline" onClick={() => downloadArticle(downloadName, title, updated)}>
                  Last ned
                </button>
              </div>
            )}
          </div>
        </div>
        <nav className="legal-no-print mt-6 flex flex-wrap gap-2" aria-label="Personvern og sikkerhet">
          {TRUST_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `rounded-full px-3 py-1.5 text-sm ${isActive ? 'bg-[#172554] text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        {lede && <p className="mt-6 max-w-3xl text-base leading-7 text-slate-700">{lede}</p>}
        {bare ? (
          <div className="mt-6">{children}</div>
        ) : (
          <article id="legal-article" className="legal-article mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-sm leading-6 shadow-sm">
            {children}
          </article>
        )}
        <div className="legal-no-print mt-6">
          <LegalFooter />
        </div>
      </div>
    </div>
  );
}
