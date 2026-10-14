import { base44 } from '@/api/base44Client';

export function flushNotifications() {
  base44.functions.invoke('dispatch-notifications', {}).catch(() => {});
}

export function coarseCoordinate(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 1000) / 1000;
}
