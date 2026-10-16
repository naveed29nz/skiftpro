/**
 * Norwegian contract emails. Edit the subjects and bodies here.
 * The edge functions send these texts as plain text from RESEND_FROM_EMAIL.
 * {{placeholders}} are filled in at send time. This file does not send anything.
 */

export const CONTRACT_SIGN_ORIGIN = 'https://skiftpro.com';

export const CONTRACT_EMAILS = {
  signingInvite: {
    subject: 'Arbeidsavtale til signering – {{selskap}}',
    body: `Hei {{navn}},

{{selskap}} har sendt deg en arbeidsavtale som skal signeres.

Åpne avtalen her:
{{lenke}}

Lenken er personlig og gjelder denne avtalen. Den er gyldig til {{frist}}.

Du trenger ikke en brukerkonto. Når du åpner lenken, leser du avtalen og ber om en engangskode. Koden sendes til denne e-postadressen. Avtalen er signert først når du har skrevet inn koden.

Hvis du ikke kjenner igjen avtalen, kan du se bort fra denne e-posten.

Vennlig hilsen
SkiftPro`,
  },
  reminder: {
    subject: 'Påminnelse: arbeidsavtale venter på signering – {{selskap}}',
    body: `Hei {{navn}},

Dette er en påminnelse. {{selskap}} venter på at du signerer arbeidsavtalen.

Åpne avtalen her:
{{lenke}}

Lenken er personlig og gjelder denne avtalen. Den er gyldig til {{frist}}.

Du trenger ikke en brukerkonto. Når du åpner lenken, leser du avtalen og ber om en engangskode. Koden sendes til denne e-postadressen. Avtalen er signert først når du har skrevet inn koden.

Hvis du ikke kjenner igjen avtalen, kan du se bort fra denne e-posten.

Vennlig hilsen
SkiftPro`,
  },
  signedEmployee: {
    subject: 'Signert arbeidsavtale – {{selskap}}',
    body: `Hei {{navn}},

Arbeidsavtalen med {{selskap}} er nå signert av begge parter. En kopi av den signerte PDF-en ligger vedlagt.

Dokument-id: {{dokument}}
SHA-256 av PDF-filen: {{sha}}

Vennlig hilsen
SkiftPro`,
  },
  signedEmployer: {
    subject: 'Signert arbeidsavtale – {{navn}}',
    body: `Hei,

Arbeidsavtalen med {{navn}} hos {{selskap}} er signert av begge parter. En kopi av den signerte PDF-en ligger vedlagt.

Dokument-id: {{dokument}}
SHA-256 av PDF-filen: {{sha}}

Vennlig hilsen
SkiftPro`,
  },
  otp: {
    subject: 'Engangskode for signering i SkiftPro',
    body: 'Koden din er {{kode}}. Den er gyldig i 10 minutter og kan brukes fem ganger.',
  },
};

export function renderContractEmail(template, values = {}) {
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const value = values[key];
    return value == null ? '' : String(value);
  });
}

export function signingLink(contractId, token) {
  const id = encodeURIComponent(String(contractId || ''));
  const access = encodeURIComponent(String(token || ''));
  return `${CONTRACT_SIGN_ORIGIN}/signer/${id}?tilgang=${access}`;
}

/** DD.MM.YYYY in Europe/Oslo. */
export function formatNorwegianDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Oslo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date);
  const day = parts.find((part) => part.type === 'day')?.value || '';
  const month = parts.find((part) => part.type === 'month')?.value || '';
  const year = parts.find((part) => part.type === 'year')?.value || '';
  if (!day || !month || !year) return '';
  return `${day}.${month}.${year}`;
}

/**
 * Where the signed PDF copy goes. The customer-card field wins.
 * An empty field uses the customer's admin email, then the contact email.
 */
export function signedCopyRecipient(organization) {
  const pick = (value) => String(value || '').trim();
  return pick(organization?.signert_kopi_epost)
    || pick(organization?.admin_email)
    || pick(organization?.contact_email);
}
