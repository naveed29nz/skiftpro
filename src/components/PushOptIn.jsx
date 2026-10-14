import { useEffect, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export default function PushOptIn({ userId }) {
  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  const [state, setState] = useState('ukjent');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!publicKey || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('utilgjengelig');
      return;
    }
    navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setState(subscription ? 'pa' : 'av'))
      .catch(() => setState('av'));
  }, [publicKey]);

  const enable = async () => {
    setMessage('');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setMessage('Varsler er ikke tillatt i nettleseren.');
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    const json = subscription.toJSON();
    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
    }, { onConflict: 'user_id,endpoint' });
    if (error) {
      setMessage('Kunne ikke lagre varslingsvalget.');
      return;
    }
    setState('pa');
  };

  const disable = async () => {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await supabase.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', subscription.endpoint);
      await subscription.unsubscribe();
    }
    setState('av');
  };

  if (state === 'utilgjengelig') {
    return (
      <p className="text-xs text-slate-500">
        Push-varsler er ikke satt opp ennå. På iPhone virker de bare i den installerte SkiftPro-appen.
      </p>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
      <h3 className="text-sm font-semibold text-slate-800">Varsler</h3>
      <p className="text-xs text-slate-500">
        Få varsel om ny eller endret vakt, svar på vaktbytte, fravær og påminnelse om å stemple inn.
        På iPhone må SkiftPro være installert som app.
      </p>
      {state === 'pa' ? (
        <Button type="button" variant="outline" size="sm" onClick={disable}>Slå av varsler</Button>
      ) : (
        <Button type="button" size="sm" onClick={enable}>Slå på varsler</Button>
      )}
      {message && <p className="text-xs text-red-600">{message}</p>}
    </div>
  );
}
