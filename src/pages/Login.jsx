import { useEffect, useState } from 'react';
import { supabase, isPasswordSetupRequired } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import ResetPassword from '@/pages/ResetPassword';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link } from 'react-router-dom';
import { Clock } from 'lucide-react';
import LegalFooter from '@/components/LegalFooter';

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
  const [fullName, setFullName] = useState('');
  const [consent, setConsent] = useState(false);
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

  const handleSignup = async (event) => {
    event.preventDefault();
    if (!consent) {
      setError('Du må godta vilkårene og personvernerklæringen.');
      return;
    }
    setPending(true);
    setError('');
    setMessage('');
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          signup: 'self_serve',
          terms_accepted: 'true',
          full_name: fullName,
          role: 'user',
        },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });
    setPending(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    if (data.session) {
      window.location.assign('/Dashboard');
      return;
    }
    setMessage('Kontoen er opprettet. Bekreft e-posten hvis du får en melding, og logg deretter inn for å opprette organisasjonen.');
  };

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

        <form onSubmit={mode === 'reset' ? handleReset : mode === 'signup' ? handleSignup : handlePassword} className="space-y-4">
          {mode === 'signup' && (
            <div className="space-y-1.5">
              <Label htmlFor="name">Navn</Label>
              <Input id="name" value={fullName} onChange={(event) => setFullName(event.target.value)} required />
            </div>
          )}
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
          {mode !== 'reset' && (
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
          {mode === 'signup' && (
            <label className="flex items-start gap-2 text-xs text-slate-600">
              <input type="checkbox" className="mt-0.5" checked={consent} onChange={(event) => setConsent(event.target.checked)} required />
              <span>
                Jeg godtar <Link to="/vilkar" className="underline">vilkårene</Link>, <Link to="/personvern" className="underline">personvernerklæringen</Link> og <Link to="/databehandleravtale" className="underline">databehandleravtalen</Link>. Tekstene er utkast og skal gjennomgås juridisk.
              </span>
            </label>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-emerald-700">{message}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Vennligst vent…' : mode === 'reset' ? 'Send lenke' : mode === 'signup' ? 'Opprett konto' : 'Logg inn'}
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
        {mode !== 'signup' && (
          <button type="button" className="mt-2 text-sm text-blue-700 hover:underline" onClick={() => { setMode('signup'); setError(''); setMessage(''); }}>
            Opprett konto
          </button>
        )}
        {mode === 'signup' && (
          <button type="button" className="mt-2 text-sm text-blue-700 hover:underline" onClick={() => { setMode('password'); setError(''); setMessage(''); }}>
            Har du allerede konto? Logg inn
          </button>
        )}
        <LegalFooter className="mt-6 justify-center" />
      </div>
    </div>
  );
}
