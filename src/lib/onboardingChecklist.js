// New-employee checklist. Bank account is not a field in SkiftPro, so the
// profile item is phone and address only. Ekstrahjelp has no availability tab.

const PENDING = new Set(['sendt', 'apnet']);

export function hasText(value) {
  return Boolean(String(value || '').trim());
}

export function isEkstraWorker(worker) {
  return worker?.ansettelsestype === 'tilkalling';
}

export function pendingContracts(contracts, workerId) {
  return (contracts || []).filter((contract) => (
    contract.worker_id === workerId && PENDING.has(contract.status)
  ));
}

export function checklistItems({
  worker,
  contracts = [],
  availabilityCount = 0,
  notificationsOn = false,
}) {
  const pending = pendingContracts(contracts, worker?.id);
  const items = [
    {
      id: 'profile',
      title: 'Fyll ut profil',
      detail: 'Legg inn telefon og adresse. Kontonummer samles ikke i SkiftPro.',
      done: hasText(worker?.phone) && hasText(worker?.address),
      href: '/WorkerPortal?sjekk=profil',
    },
    {
      id: 'contract',
      title: 'Signer avtale',
      detail: pending.length
        ? `${pending.length} avtale${pending.length === 1 ? '' : 'r'} venter på signatur`
        : 'Ingen avtale venter på deg',
      done: pending.length === 0,
      href: pending[0] ? `/kontrakt/${pending[0].id}` : '/WorkerPortal?tab=contracts',
    },
    {
      id: 'notifications',
      title: 'Varsler og hjemskjerm',
      detail: 'Slå på varsler, eller legg SkiftPro til på hjemskjermen.',
      done: Boolean(notificationsOn),
      href: '/WorkerPortal?sjekk=varsler',
    },
  ];
  if (!isEkstraWorker(worker)) {
    items.push({
      id: 'availability',
      title: 'Registrer tilgjengelighet',
      detail: 'Merk dagene du kan jobbe.',
      done: Number(availabilityCount) > 0,
      href: '/WorkerPortal?tab=availability',
    });
  }
  return items;
}

export function checklistProgress(items) {
  const total = items.length;
  const done = items.filter((item) => item.done).length;
  return { done, total, complete: total > 0 && done === total };
}

export function shouldShowChecklist({ items, dismissed }) {
  if (dismissed) return false;
  return (items || []).some((item) => !item.done);
}

export function statusFromOverview(row, worker) {
  if (!row) return null;
  const items = [
    { title: 'Profil', done: Boolean(row.has_phone && row.has_address) },
    { title: 'Avtale', done: Number(row.pending_contracts) === 0 },
    { title: 'Varsler', done: Boolean(row.notifications_done) },
  ];
  if (!isEkstraWorker(worker)) {
    items.push({ title: 'Tilgjengelighet', done: Boolean(row.has_availability) });
  }
  const done = items.filter((item) => item.done).length;
  return {
    done,
    total: items.length,
    missing: items.filter((item) => !item.done).map((item) => item.title),
    dismissed: Boolean(row.dismissed),
  };
}
