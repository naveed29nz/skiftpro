// @ts-nocheck
import { Link } from 'react-router-dom';
import { Check, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function OnboardingChecklist({
  items,
  progress,
  highlight = '',
  phone,
  address,
  onPhone,
  onAddress,
  onSaveProfile,
  savingProfile = false,
  profileError = '',
  onAckNotifications,
  onDismiss,
  pushSlot = null,
  standalone = false,
}) {
  return (
    <section className="rounded-xl border border-blue-200 bg-white shadow-sm" data-testid="onboarding-checklist">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Kom i gang</p>
          <p className="text-xs text-slate-500">{progress.done} av {progress.total} ferdig. Du kan skjule listen og fullføre senere.</p>
        </div>
        <button type="button" className="text-xs font-medium text-slate-500 hover:text-slate-800" onClick={onDismiss}>
          Skjul
        </button>
      </div>
      <ol className="divide-y divide-slate-100">
        {items.map((item) => (
          <li key={item.id} className="px-4 py-3" data-testid={`check-${item.id}`}>
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${item.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 text-transparent'}`}>
                <Check className="h-3 w-3" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={`text-sm font-medium ${item.done ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{item.title}</p>
                  {!item.done && item.id !== 'profile' && (
                    <Link to={item.href} className="text-xs font-medium text-blue-700 hover:underline">Åpne</Link>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{item.detail}</p>
                {item.id === 'profile' && !item.done && (
                  <form
                    className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                    data-highlight={highlight === 'profil' ? 'true' : 'false'}
                    onSubmit={(event) => {
                      event.preventDefault();
                      onSaveProfile?.();
                    }}
                  >
                    <Input value={phone} onChange={(event) => onPhone(event.target.value)} placeholder="Telefon" aria-label="Telefon" />
                    <Input value={address} onChange={(event) => onAddress(event.target.value)} placeholder="Adresse" aria-label="Adresse" />
                    <Button type="submit" size="sm" disabled={savingProfile}>Lagre</Button>
                    {profileError && <p className="sm:col-span-3 text-xs text-red-600">{profileError}</p>}
                  </form>
                )}
                {item.id === 'notifications' && !item.done && (
                  <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3" data-highlight={highlight === 'varsler' ? 'true' : 'false'}>
                    <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                      <Smartphone className="h-3.5 w-3.5" /> Legg til på hjemskjermen
                    </p>
                    <p className="text-xs text-slate-500">
                      På iPhone: del-knappen og «Legg til på Hjem-skjerm». På Android: nettlesermenyen og «Installer app» eller «Legg til på startskjermen».
                      {standalone ? ' SkiftPro kjører allerede som app.' : ''}
                    </p>
                    {pushSlot}
                    <Button type="button" variant="outline" size="sm" onClick={onAckNotifications}>Jeg har satt opp varsler eller hjemskjerm</Button>
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
