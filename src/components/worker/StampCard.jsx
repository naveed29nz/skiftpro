import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { MapPin, LogIn, LogOut, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { nb } from 'date-fns/locale';
import { coarseCoordinate } from '@/utils/notify';

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function StampCard({ worker, workplaceSetting, todayStamp, onStampChange }) {
  const [noticeOpen, setNoticeOpen] = useState(() => localStorage.getItem('skiftpro.gpsNoticeAccepted') !== '1');
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const today = format(new Date(), 'yyyy-MM-dd');
  const hasStampedIn = !!todayStamp?.stamp_in;
  const hasStampedOut = !!todayStamp?.stamp_out;

  const getGPS = () => new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 })
  );

  const handleStamp = async (type) => {
    // Pick team-specific location if set, else fall back to global
    const teamKey = (worker?.teams || ['team1'])[0] || 'team1';
    const teamLat = workplaceSetting?.[`${teamKey}_latitude`];
    const teamLng = workplaceSetting?.[`${teamKey}_longitude`];
    const teamRadius = workplaceSetting?.[`${teamKey}_radius_meters`];
    const useLat = teamLat || workplaceSetting?.latitude;
    const useLng = teamLng || workplaceSetting?.longitude;
    const useRadius = teamRadius || workplaceSetting?.radius_meters || 100;

    if (!useLat) {
      setStatus('error:Arbeidsstedet mangler posisjon. Be administrator sette den i innstillinger.');
      return;
    }
    if (localStorage.getItem('skiftpro.gpsNoticeAccepted') !== '1') {
      setNoticeOpen(true);
      return;
    }
    setLoading(true);
    setStatus('detecting:Henter posisjonen din...');
    let pos;
    try {
      pos = await getGPS();
    } catch {
      setLoading(false);
      setStatus('error:Kunne ikke hente posisjon. Tillat posisjon i nettleseren.');
      return;
    }

    const dist = getDistance(pos.coords.latitude, pos.coords.longitude, useLat, useLng);
    const within = dist <= useRadius;

    if (!within) {
      setLoading(false);
      setStatus(`error:Du er ${Math.round(dist)} m fra arbeidsstedet (maks ${useRadius} m). Gå nærmere for å stemple ${type === 'in' ? 'inn' : 'ut'}.`);
      return;
    }

    const now = new Date().toISOString();
    try {
      if (type === 'in') {
        const stamp = await base44.entities.Stamp.create({
          worker_id: worker.id,
          worker_name: worker.name,
          date: today,
          stamp_in: now,
          stamp_in_lat: coarseCoordinate(pos.coords.latitude),
          stamp_in_lng: coarseCoordinate(pos.coords.longitude),
          is_within_range: true,
          distance_meters: Math.round(dist),
        });
        onStampChange(stamp);
        setStatus(`success:Stemplet inn kl. ${format(new Date(now), 'HH:mm')} — ${Math.round(dist)} m fra arbeidsstedet`);
      } else {
        const updated = await base44.entities.Stamp.update(todayStamp.id, {
          stamp_out: now,
          stamp_out_lat: coarseCoordinate(pos.coords.latitude),
          stamp_out_lng: coarseCoordinate(pos.coords.longitude),
        });
        onStampChange(updated);
        setStatus(`success:Stemplet ut kl. ${format(new Date(now), 'HH:mm')}`);
      }
      queryClient.invalidateQueries({ queryKey: ['stamps'] });
    } catch (e) {
      setStatus('error:Noe gikk galt. Prøv igjen.');
    }
    setLoading(false);
  };

  const statusType = status.split(':')[0];
  const statusMsg = status.split(':').slice(1).join(':');

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      {noticeOpen && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-950 space-y-2">
          <p className="font-semibold">Posisjon ved stempling</p>
          <p>
            SkiftPro sjekker at du er på arbeidsstedet. Vi lagrer avstand, om du er innenfor området,
            og grove koordinater. Nøyaktig posisjon slettes etter 90 dager. Les mer i personvernerklæringen.
          </p>
          <button
            type="button"
            className="text-blue-800 underline"
            onClick={() => {
              localStorage.setItem('skiftpro.gpsNoticeAccepted', '1');
              setNoticeOpen(false);
            }}
          >
            Jeg forstår
          </button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">Stemple inn / ut</h3>
        <span className="text-xs text-slate-400">{format(new Date(), 'EEEE d. MMM', { locale: nb })}</span>
      </div>

      {workplaceSetting?.workplace_name && (
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <MapPin className="w-3.5 h-3.5 text-blue-500" />
          {workplaceSetting.workplace_name} · {workplaceSetting.radius_meters} m radius
        </div>
      )}

      {/* Stamp status display */}
      {hasStampedIn && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-emerald-50 rounded-lg p-3 text-center">
            <p className="text-xs text-emerald-600 font-medium">Stemplet inn</p>
            <p className="text-lg font-bold text-emerald-700">{format(new Date(todayStamp.stamp_in), 'HH:mm')}</p>
          </div>
          <div className={`rounded-lg p-3 text-center ${hasStampedOut ? 'bg-blue-50' : 'bg-slate-50'}`}>
            <p className={`text-xs font-medium ${hasStampedOut ? 'text-blue-600' : 'text-slate-400'}`}>Stemplet ut</p>
            <p className={`text-lg font-bold ${hasStampedOut ? 'text-blue-700' : 'text-slate-300'}`}>
              {hasStampedOut ? format(new Date(todayStamp.stamp_out), 'HH:mm') : '--:--'}
            </p>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        {!hasStampedIn && (
          <Button onClick={() => handleStamp('in')} disabled={loading} className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
            Stemple inn
          </Button>
        )}
        {hasStampedIn && !hasStampedOut && (
          <Button onClick={() => handleStamp('out')} disabled={loading} className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            Stemple ut
          </Button>
        )}
        {hasStampedIn && hasStampedOut && (
          <div className="flex-1 flex items-center justify-center gap-2 text-sm text-emerald-600 font-medium py-2">
            <CheckCircle2 className="w-4 h-4" /> Vakten er stemplet for i dag
          </div>
        )}
      </div>

      {/* Status message */}
      {statusMsg && (
        <div className={`flex items-start gap-2 text-xs p-3 rounded-lg ${
          statusType === 'success' ? 'bg-emerald-50 text-emerald-700' :
          statusType === 'error' ? 'bg-red-50 text-red-700' :
          'bg-slate-50 text-slate-500'
        }`}>
          {statusType === 'success' ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> :
           statusType === 'error' ? <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : null}
          {statusMsg}
        </div>
      )}
    </div>
  );
}