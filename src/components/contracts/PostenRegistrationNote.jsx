import { POSTEN_REGISTRATION_URL, ZASTEK_BEHANDLER_NAME, ZASTEK_BEHANDLER_ORG } from '@/contracts/postenSigning';

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
