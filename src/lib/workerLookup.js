import { base44 } from '@/api/base44Client';
import { sameEmail } from '@/lib/emails';

export async function findWorkerByEmail(email, role) {
  const raw = String(email ?? '').trim();
  if (!raw) return null;
  const exact = await base44.entities.Worker.filter({ email: raw });
  if (exact.length > 0) return exact[0];
  if (role === 'admin') return null;
  const workers = await base44.entities.Worker.list();
  return workers.find((worker) => sameEmail(worker.email, raw)) || null;
}

export { sameEmail };
