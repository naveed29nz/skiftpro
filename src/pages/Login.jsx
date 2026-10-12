import { useEffect, useState } from 'react';
import { supabase, isPasswordSetupRequired } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import ResetPassword from '@/pages/ResetPassword';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Clock } from 'lucide-react';

function safeNextPath(raw) {
  if (!raw) return '/Dashboard';
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return '/Dashboard';
    if (url.pathname === '/login' || url.pathname === '/reset-password') return '/Dashboard';
    return `${url.pathname}${url.search}${url.hash}` || '/Dashboard';
  } catch {
    return '/Dashboard';
  }
}

export default function Login() {
  const { needsNewPassword, passwordLinkError } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const nextPath = safeNextPath(params.get('from'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('password');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (needsNewPassword || passwordLinkError) return undefined;
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled || isPasswordSetupRequired()) return;
      if (data.session) window.location.assign(nextPath);
    });
    return () => {
      cancelled = true;
    };
  }, [nextPath, needsNewPassword, passwordLinkError]);

  if (needsNewPassword || passwordLinkError) return <ResetPassword />;

  const handlePassword = async (event) => {
    event.preventDefault();
    setPending(true);
    setError('');
    setMessage('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setPending(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    window.location.assign(nextPath);
  };

  const handleReset = async (event) => {
    event.preventDefault();
    setPending(true);
    setError('');
    setMessage('');
    const redirectTo = `${window.location.origin}/reset-password`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setPending(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setMessage('Hvis kontoen finnes, er en lenke for å sette passord sendt.');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-blue-950 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Clock className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">SkiftPro</h1>
          <p className="text-slate-500 text-sm mt-1">Logg inn for å åpne vaktplanen.</p>
        </div>

        <form onSubmit={mode === 'reset' ? handleReset : handlePassword} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-post</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          {mode === 'password' && (
            <div className="space-y-1.5">
              <Label htmlFor="password">Passord</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-emerald-700">{message}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Vennligst vent…' : mode === 'reset' ? 'Send lenke' : 'Logg inn'}
          </Button>
        </form>

        <button
          type="button"
          className="mt-4 text-sm text-blue-700 hover:underline"
          onClick={() => {
            setMode(mode === 'reset' ? 'password' : 'reset');
            setError('');
            setMessage('');
          }}
        >
          {mode === 'reset' ? 'Tilbake til innlogging' : 'Glemt passord?'}
        </button>
      </div>
    </div>
  );
}
