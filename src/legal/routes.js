export const TRUST_NAV = [
  { to: '/personvern', label: 'Oversikt', end: true },
  { to: '/personvern/kunder', label: 'Kunder' },
  { to: '/personvern/ansatte', label: 'Ansatte' },
  { to: '/personvern/underleverandorer', label: 'Underleverandører' },
  { to: '/personvern/databehandleravtale', label: 'Databehandleravtale' },
  { to: '/personvern/sikkerhet', label: 'Sikkerhet' },
  { to: '/vilkar', label: 'Vilkår' },
];

export const TRUST_CARDS = [
  {
    to: '/personvern/kunder',
    title: 'Kunder og besøkende',
    description: 'Zastek AS er behandlingsansvarlig for kontaktpersoner, administratorer, betaling og besøk på skiftpro.com.',
  },
  {
    to: '/personvern/ansatte',
    title: 'Ansatte',
    description: 'Mal til arbeidsgiver. Arbeidsgiveren er behandlingsansvarlig. Zastek AS er databehandler og behandler bare etter instruks.',
  },
  {
    to: '/personvern/underleverandorer',
    title: 'Underleverandører',
    description: 'Hvem som behandler opplysninger, til hvilket formål, hvor data ligger, og overføringsgrunnlaget.',
  },
  {
    to: '/personvern/databehandleravtale',
    title: 'Databehandleravtale',
    description: 'Avtalen mellom kunden og Zastek AS. Versjon 0.9, 28. oktober 2026. Kan skrives ut og lastes ned.',
  },
  {
    to: '/personvern/sikkerhet',
    title: 'Sikkerhet',
    description: 'EU-lagring i Frankfurt, isolasjon per virksomhet, kryptering, sikkerhetskopi og tilgangsstyring.',
  },
];
