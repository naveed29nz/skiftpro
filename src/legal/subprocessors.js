export const SUBPROCESSOR_COLUMNS = ['Navn', 'Formål', 'Personopplysninger', 'Lokasjon', 'Overføringsgrunnlag'];

export const SUBPROCESSORS = [
  {
    name: 'Supabase Inc.',
    purpose: 'Database, innlogging, fillagring og serverfunksjoner',
    data: 'Opplysningene som lagres i SkiftPro, inkludert kryptert fødselsnummer, fravær, posisjon ved stempling og IP-adresse fra e-signering',
    location: 'Lagring i EU (AWS Frankfurt). Support kan skje fra USA',
    transfer: 'EUs standardkontrakter (SCC)',
  },
  {
    name: 'Vercel Inc.',
    purpose: 'Drift av nettappen',
    data: 'IP-adresse, nettleser og nettadresse i tilgangslogger. Ingen opplysninger fra databasen',
    location: 'Globalt innholdsnettverk. Logger kan behandles i USA',
    transfer: 'EU–US Data Privacy Framework og EUs standardkontrakter',
  },
  {
    name: 'Resend',
    purpose: 'Transaksjonell e-post: invitasjoner, innlogging, signeringslenker og varsler',
    data: 'E-postadresse, navn og innhold i e-posten, inkludert leveringslogger',
    location: 'USA',
    transfer: 'EUs standardkontrakter er hovedgrunnlaget. Leverandøren er også sertifisert under EU–US Data Privacy Framework for data som ikke er HR-data',
  },
  {
    name: 'GitHub Inc. (Microsoft)',
    purpose: 'Kildekode, automatiserte tester og lagring av krypterte sikkerhetskopier',
    data: 'Kryptert kopi av databasen. Leverandøren har ikke dekrypteringsnøkkelen',
    location: 'USA',
    transfer: 'Overføringsgrunnlag etter personvernforordningen kapittel V, herunder EUs standardkontrakter og/eller EU–US Data Privacy Framework',
  },
];

export const CONDITIONAL_SUBPROCESSORS = [
  {
    name: 'Posten Bring AS (Posten Signering)',
    purpose: 'Elektronisk signering med BankID når kunden tar tjenesten i bruk',
    data: 'Avtaledokument, fødselsnummer, navn, e-post og mobilnummer, samt signeringsstatus',
    location: 'Norge',
    transfer: 'Ingen overføring utenfor EØS for selve signeringstjenesten',
  },
];

export const OTHER_RECIPIENTS = [
  {
    name: 'Stripe',
    purpose: 'Abonnementsbetaling for kunden',
    data: 'Firmanavn, kontaktperson, e-post og betalingsinformasjon. Kortdata håndteres av Stripe. Gjelder ikke ansattdata',
    location: 'EU/USA',
    transfer: 'Stripe er selvstendig behandlingsansvarlig for betalingsdata. EU–US Data Privacy Framework og EUs standardkontrakter',
  },
  {
    name: 'Brønnøysundregistrene',
    purpose: 'Oppslag på organisasjonsnummer ved registrering',
    data: 'Organisasjonsnummer, som er en offentlig opplysning',
    location: 'Norge',
    transfer: 'Ingen overføring utenfor EØS. Ingen ansattdata',
  },
  {
    name: 'OpenStreetMap Nominatim',
    purpose: 'Omgjøring av arbeidsstedets adresse til koordinater, fra administratorens nettleser',
    data: 'Adresse til arbeidsstedet og administratorens IP-adresse',
    location: 'Storbritannia',
    transfer: 'Adekvansbeslutning for Storbritannia',
  },
  {
    name: 'Push-tjeneste i nettleseren',
    purpose: 'Levering av varsler til den ansattes enhet',
    data: 'Kryptert varselinnhold og push-endepunkt. Teksten kan vise type fravær',
    location: 'Leverandørens nettverk',
    transfer: 'Innholdet er kryptert etter Web Push-standarden',
  },
  {
    name: 'Unsplash',
    purpose: 'Bilde på forsiden av skiftpro.com',
    data: 'Besøkendes IP-adresse kan bli synlig for Unsplash når bildet lastes',
    location: 'Leverandørens nettverk',
    transfer: 'Gjelder bare forsiden, ikke opplysninger i appen',
  },
];

export function subprocessorRows(list) {
  return list.map((row) => [row.name, row.purpose, row.data, row.location, row.transfer]);
}
