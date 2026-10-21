import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Clock } from 'lucide-react';

export default function EmployeeNoInvite({ email, onRetry, pending = false }) {
  const shownEmail = email || 'din e-post';
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-8 w-full max-w-md space-y-4">
        <div className="text-center">
          <div className="w-14 h-14 bg-blue-950 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Clock className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">Vi fant deg ikke</h1>
        </div>
        <p className="text-sm text-slate-600">
          Vi fant deg ikke som ansatt. Be lederen din om å legge inn e-posten din ({shownEmail}) på ansattkortet ditt eller sende deg en invitasjon.
        </p>
        <Button type="button" className="w-full" onClick={onRetry} disabled={pending}>
          {pending ? 'Sjekker…' : 'Prøv igjen'}
        </Button>
        <Button type="button" variant="outline" className="w-full" onClick={() => base44.auth.logout()}>
          Logg ut
        </Button>
      </div>
    </div>
  );
}
