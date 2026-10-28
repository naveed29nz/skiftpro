import { Link } from 'react-router-dom';
import TrustLayout from '@/components/legal/TrustLayout';
import DataTable from '@/components/legal/DataTable';
import { DPA_UPDATED_LABEL, DPA_VERSION } from '@/lib/dpa';

const PURPOSE_ROWS = [
  ['Navn, e-post, telefon, adresse, fødselsdato, stilling, team og rolle', 'Administrere arbeidsforholdet, gi tilgang til appen og kontakte deg om vakter', 'Arbeidsavtalen'],
  ['Fødselsnummer, lagret kryptert og vist maskert', 'Identifisere deg i arbeidsavtalen og ved signering med BankID, der det trengs', 'Arbeidsavtalen og rettslig plikt, personopplysningsloven § 12'],
  ['Arbeidsavtale, stillingsprosent, timelønn, arbeidstid, prøvetid og oppsigelsesfrist', 'Oppfylle kravet til skriftlig arbeidsavtale', 'Rettslig plikt, arbeidsmiljøloven § 14-5 og § 14-6'],
  ['Vakter, pauser, vaktbytter og tilgjengelighet', 'Planlegge arbeidet', 'Arbeidsavtalen og arbeidsmiljøloven kapittel 10'],
  ['Stemplingstidspunkt, korrigeringer og godkjente timer', 'Føre oversikt over arbeidstid og beregne lønn', 'Rettslig plikt, arbeidsmiljøloven § 10-7 og bokføringsloven'],
  ['Posisjon ved stempling', 'Kontrollere at stempling skjer på arbeidsstedet', 'Berettiget interesse, etter at arbeidsgiveren har drøftet kontrolltiltaket med tillitsvalgte etter arbeidsmiljøloven kapittel 9'],
  ['Fravær: ferie, egenmelding og sykmelding', 'Planlegging, lønn og sykepenger i arbeidsgiverperioden, ferie og oppfølging', 'Rettslig plikt og unntaket for arbeidsrettslige plikter. Diagnose lagres ikke'],
  ['Lønnsgrunnlag: timer, tillegg og overtid', 'Utbetale riktig lønn', 'Arbeidsavtalen og rettslig plikt'],
  ['Kasse- og oppgjørsregistreringer', 'Kontanthåndtering og bokføring', 'Rettslig plikt og berettiget interesse'],
  ['Oppgaver og bilder du laster opp', 'Daglig drift', 'Berettiget interesse'],
  ['E-signering: tidspunkt, IP-adresse, nettleser og engangskode lagret som hash', 'Bevise at avtalen er signert og ikke endret', 'Berettiget interesse'],
  ['Push-varsler og e-postvarsler', 'Gi beskjed om vakter, endringer og avtaler', 'Berettiget interesse'],
];

const RETENTION_ROWS = [
  ['Brukerkonto', 'Til arbeidsforholdet opphører, deretter deaktivert eller slettet innen fristen arbeidsgiveren setter. Forslag: 3 måneder'],
  ['Timelister, vakter og lønnsgrunnlag', 'Forslag: 5 år etter utløpet av regnskapsåret'],
  ['Arbeidsavtaler og signeringsbevis', 'Forslag: 60 måneder etter at arbeidsforholdet opphørte'],
  ['Fraværsmerking', 'Fristen settes av arbeidsgiveren. Forslag: 3 år, deretter anonymiseres merkingen'],
  ['Grove koordinater fra stempling', '90 dager, deretter slettes de automatisk'],
  ['Varsler', 'Forslag: 90 dager'],
  ['Fødselsnummer', 'Til det ikke lenger trengs, senest når ansattkortet slettes'],
];

export default function PersonvernAnsatte() {
  return (
    <TrustLayout
      title="Personvernerklæring for ansatte"
      updated={DPA_UPDATED_LABEL}
      lede={`Mal versjon ${DPA_VERSION}, levert av Zastek AS. Arbeidsgiveren er behandlingsansvarlig og gjør den endelige teksten tilgjengelig for de ansatte.`}
    >
      <p className="rounded-lg bg-slate-50 px-3 py-2">
        Til arbeidsgiver: Dette er en mal. Arbeidsgiveren må fylle inn eget navn, organisasjonsnummer, adresse og kontaktpunkt, kontrollere rettslig grunnlag og lagringstid, og gjøre erklæringen tilgjengelig, for eksempel i personalhåndboken og ved første innlogging.
        Zastek viser denne teksten i appen. Lagringstider merket «forslag» er ikke arbeidsgiverens endelige valg.
      </p>

      <h2 className="text-base font-semibold text-slate-900">1. Hvem er ansvarlig</h2>
      <p>
        Arbeidsgiveren din er behandlingsansvarlig for personopplysningene om deg i SkiftPro.
        Arbeidsgiveren setter inn navn, organisasjonsnummer, adresse og kontaktpunkt for personvern eller HR.
        SkiftPro leveres av Zastek AS (org.nr. 938 291 144, post@zastek.no), som er databehandler.
        Zastek behandler opplysningene bare etter arbeidsgiverens instruks og bruker dem ikke til egne formål.
      </p>

      <h2 className="text-base font-semibold text-slate-900">2. Hvilke opplysninger, hvorfor og på hvilket grunnlag</h2>
      <DataTable columns={['Opplysninger', 'Formål', 'Rettslig grunnlag']} rows={PURPOSE_ROWS} />
      <p>
        SkiftPro lagrer ikke diagnose eller årsak til sykdom. Arbeidsgiveren registrerer at du har egenmelding eller sykmelding.
        Ikke skriv helseopplysninger i merknadsfelt.
      </p>

      <h2 className="text-base font-semibold text-slate-900">3. Posisjon ved stempling</h2>
      <p>
        Når du stempler, bruker appen posisjonen fra telefonen for å sjekke om du er på arbeidsstedet.
        Appen spør om tillatelse i nettleseren. Nøyaktig posisjon lagres ikke.
        Vi lagrer avstand i meter, om du var innenfor området, og grove koordinater avrundet til omtrent 100 meter.
        Koordinatene slettes automatisk etter 90 dager. Posisjon hentes bare i det øyeblikket du stempler.
      </p>

      <h2 className="text-base font-semibold text-slate-900">4. Hvem får tilgang</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Ledere og administratorer hos arbeidsgiveren, etter rolle. Lønn er bare synlig for dem med rettighet.</li>
        <li>Andre ansatte ser vaktplanen, med navn og vakter, der arbeidsgiveren har valgt det.</li>
        <li>Zastek AS, som databehandler, for drift og support.</li>
        <li>
          Underleverandører til Zastek: Supabase (lagring i Frankfurt), Vercel (drift av nettsiden), Resend (e-post) og GitHub (krypterte sikkerhetskopier).
          Posten Signering i Norge brukes hvis arbeidsgiveren tar i bruk BankID-signering.
          Overføring til USA skjer på grunnlag av EUs standardkontrakter og/eller EU–US Data Privacy Framework.
          Se <Link className="underline" to="/personvern/underleverandorer">underleverandørlisten</Link>.
        </li>
        <li>Myndigheter når loven krever det, for eksempel Arbeidstilsynet, Skatteetaten og NAV.</li>
      </ul>

      <h2 className="text-base font-semibold text-slate-900">5. Hvor lenge opplysningene lagres</h2>
      <DataTable columns={['Opplysning', 'Lagringstid']} rows={RETENTION_ROWS} />

      <h2 className="text-base font-semibold text-slate-900">6. Dine rettigheter</h2>
      <p>
        Du har rett til innsyn, retting, sletting når opplysningene ikke lenger er nødvendige eller lovpålagt lagret, begrensning, dataportabilitet og til å protestere mot behandling som bygger på berettiget interesse.
        Send henvendelsen til arbeidsgiveren. Du kan også kontakte Zastek på post@zastek.no, så sender vi henvendelsen videre. Du får svar innen én måned.
      </p>
      <p>
        Du kan klage til Datatilsynet (datatilsynet.no). Arbeidstidsoversikten kan også kreves fremlagt for tillitsvalgte og Arbeidstilsynet etter arbeidsmiljøloven § 10-7.
      </p>

      <h2 className="text-base font-semibold text-slate-900">7. Sikkerhet</h2>
      <p>
        Opplysningene lagres kryptert i EU (Frankfurt). Hver virksomhet er skilt fra andre med tilgangsregler i databasen.
        Fødselsnummer er i tillegg kryptert. Filer er private og deles bare via tidsbegrensede lenker.
        Mer står på siden om <Link className="underline" to="/personvern/sikkerhet">sikkerhet</Link>.
      </p>

      <h2 className="text-base font-semibold text-slate-900">8. Endringer</h2>
      <p>Arbeidsgiveren varsler i appen eller på e-post ved vesentlige endringer.</p>
    </TrustLayout>
  );
}
