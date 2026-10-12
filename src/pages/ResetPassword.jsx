import { useEffect, useState } from 'react';
import { supabase, clearPasswordSetup } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Clock } from 'lucide-react';

function Shell({ title, children }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-blue-950 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Clock className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">{title}</h1>
        </div>
        {children}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-50">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
    </div>
  );
}

export default function ResetPassword() {
  const { needsNewPassword, passwordLinkError, isLoadingAuth, isAuthenticated } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!isLoadingAuth && isAuthenticated && !needsNewPassword && !passwordLinkError) {
      window.location.assign('/Dashboard');
    }
  }, [isLoadingAuth, isAuthenticated, needsNewPassword, passwordLinkError]);

  if (isLoadingAuth) return <Spinner />;

  if (!needsNewPassword && !passwordLinkError && isAuthenticated) return <Spinner />;

  if (passwordLinkError || !needsNewPassword) {
    return (
      <Shell title="Sett nytt passord">
        <p className="text-sm text-slate-600 text-center">
          {passwordLinkError || 'Lenken er ugyldig eller utløpt'}
        </p>
        <a href="/login" className="mt-6 block text-center text-sm text-blue-700 hover:underline">
          Tilbake til innlogging
        </a>
      </Shell>
    );
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Passordet må ha minst 8 tegn.');
      return;
    }
    if (password !== confirm) {
      setError('Passordene er ikke like.');
      return;
    }
    setPending(true);
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setPending(false);
      setError('Lenken er ugyldig eller utløpt');
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setPending(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    clearPasswordSetup();
    window.location.assign('/Dashboard');
  };

  return (
    <Shell title="Sett nytt passord">
      <p className="text-slate-500 text-sm text-center -mt-4 mb-6">
        Velg et passord for kontoen din.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="new-password">Nytt passord</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Gjenta passord</Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            required
            minLength={8}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? 'Vennligst vent…' : 'Lagre og logg inn'}
        </Button>
      </form>
    </Shell>
  );
}
