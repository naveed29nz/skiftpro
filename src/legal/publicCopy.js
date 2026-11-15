/**
 * Shared wording for the public legal pages.
 * Personvern, vilkår and the databehandleravtale must stay on the same
 * retention rule and the same subprocessor list.
 */

export const LEGAL_UPDATED = '15. november 2026';

export const RETENTION_PARAGRAPH = 'Kundedata oppbevares i 60 dager etter at abonnementet er avsluttet, og slettes deretter manuelt. Data slettes ikke automatisk. Zastek AS registrerer slettedatoen, og en superadministrator sletter kundedata manuelt. Kunden kan før den tid be om eksport av dataene og om tidligere sletting. Skriftlig bekreftelse på sletting gis på forespørsel. Opplysninger som må oppbevares etter bokføringsreglene, slettes ikke ved den datoen.';

export const DPA_INTRO = 'Denne avtalen er et utkast mellom kunden (behandlingsansvarlig) og Zastek AS, org.nr. 938 291 144, post@zastek.no (databehandler), for bruk av SkiftPro.';

export const DPA_CLOSING = 'Kunden kan be om en signert versjon på post@zastek.no. Ikke ta denne teksten i bruk som bindende avtale før jurist har godkjent den.';

export const DATA_LOCATION_ANSWER = 'Databasen ligger i EU (Frankfurt). Noen underleverandører kan behandle opplysninger utenfor EU på grunnlag av EUs standardkontraktsklausuler (SCC).';

export const SUBPROCESSORS = [
  {
    name: 'Supabase',
    text: 'Supabase, database, autentisering og fillagring. AWS eu-central-1 (Frankfurt, EU).',
  },
  {
    name: 'Vercel',
    text: 'Vercel, hosting av nettappen. Amerikansk selskap. Overføring kan skje utenfor EU på grunnlag av EUs standardkontraktsklausuler (SCC) eller EU-US Data Privacy Framework.',
  },
  {
    name: 'Resend',
    text: 'Resend, utsending av e-post. Amerikansk selskap. Overføring skjer på grunnlag av EUs standardkontraktsklausuler (SCC).',
  },
  {
    name: 'Stripe',
    text: 'Stripe, betaling. Overføring kan skje utenfor EU på grunnlag av EUs standardkontraktsklausuler (SCC) eller EU-US Data Privacy Framework.',
  },
  {
    name: 'Posten',
    text: 'Posten, elektronisk signering av arbeidsavtaler via Posten Signering når kunden velger den metoden. Norge.',
  },
];

export const SECURITY_POINTS = [
  'Forbindelsen krypteres med TLS mens opplysningene er i transit.',
  'Data lagres kryptert i ro hos databaseleverandøren.',
  'Fødselsnummer lagres kryptert.',
  'Hver kunde har bare tilgang til egne data, styrt med radnivåsikkerhet i databasen.',
  'Tilgang i appen styres av rolle.',
  'Det tas regelmessig kryptert sikkerhetskopi av databasen.',
  'Sikkerhetsbrudd varsles uten ugrunnet opphold.',
  'SkiftPro leveres av det norske selskapet Zastek AS, org.nr. 938 291 144. Norsk rett gjelder.',
];
