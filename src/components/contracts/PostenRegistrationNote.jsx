import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { POSTEN_REGISTRATION_URL, ZASTEK_BEHANDLER_NAME, ZASTEK_BEHANDLER_ORG } from '@/contracts/postenSigning';

export function PostenAdminHint() {
  const { data } = useQuery({
    queryKey: ['posten-signering-config'],
    queryFn: async () => {
      try {
        const res = await base44.functions.invoke('posten-signering-config', {});
        return res?.data || null;
      } catch {
        return null;
      }
    },
    retry: false,
  });
  if (data?.cert_configured === true) return <PostenRegistrationNote />;
  return <p className="text-xs text-slate-400">Posten Signering kommer snart.</p>;
}

export default function PostenRegistrationNote() {
  return (
    <p className="text-xs text-slate-500">
      Kunden må registrere seg på{" "}
      <a className="underline" href={POSTEN_REGISTRATION_URL} target="_blank" rel="noreferrer">
        signering.posten.no
      </a>
      {" "}
      og knytte {ZASTEK_BEHANDLER_NAME} (org.nr {ZASTEK_BEHANDLER_ORG}) som behandler.
      Kunden vises som avsender av signeringsoppdraget. Zastek AS er teknisk behandler.
    </p>
  );
}
