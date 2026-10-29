import { Link } from 'react-router-dom';
import TrustLayout from '@/components/legal/TrustLayout';
import DataTable from '@/components/legal/DataTable';
import { DPA_UPDATED_LABEL, DPA_VERSION } from '@/lib/dpa';

const ROWS = [
  ['Navn, e-post, telefon, rolle og organisasjonsnummer for kontaktperson, administrator og signatar', 'Opprette og administrere kundeforholdet, gi support og varsle om tjenesten', 'Avtale. Berettiget interesse for kontaktpersoner som ikke selv er avtalepart', 'Avtaletiden og 12 måneder etter'],
  ['Brukerkonto: e-post, passord lagret som hash, innloggingstidspunkt', 'Sikker innlogging', 'Avtale', 'Til kontoen slettes'],
  ['Faktura- og abonnementsdata, inkludert kunde-ID hos betalingsleverandør, plan, antall butikker og status', 'Fakturering og regnskap', 'Rettslig plikt etter bokføringsloven', '5 år etter regnskapsårets slutt'],
  ['Aksept av vilkår og databehandleravtale, med tidspunkt og versjon', 'Dokumentere avtaleinngåelsen', 'Berettiget interesse', 'Avtaletiden og 3 år etter'],
  ['Tekniske logger: IP-adresse, nettleser og tidspunkt hos driftsleverandørene', 'Drift, sikkerhet og feilsøking', 'Berettiget interesse', 'En begrenset periode hos den enkelte leverandør'],
  ['Henvendelser til post@zastek.no', 'Besvare spørsmål', 'Berettiget interesse', 'Inntil 2 år'],
];

export default function PersonvernKunder() {
  return (
    <TrustLayout
      title="Personvernerklæring for kunder og besøkende"
      updated={DPA_UPDATED_LABEL}
      lede={`Versjon ${DPA_VERSION}. Denne erklæringen gjelder personopplysninger Zastek AS behandler som behandlingsansvarlig.`}
    >
      <h2 className="text-base font-semibold text-slate-900">1. Om erklæringen</h2>
      <p>
        Erklæringen gjelder kontaktpersoner, administratorer og betalere hos kundene våre, og besøkende på skiftpro.com.
        Opplysninger om kundenes ansatte, som vakter, timer, fravær og avtaler, behandler vi som databehandler på vegne av kunden.
        For det gjelder <Link className="underline" to="/personvern/databehandleravtale">databehandleravtalen</Link> og arbeidsgiverens egen personvernerklæring.
        Ansatte kontakter arbeidsgiveren sin.
      </p>
      <p>
        <strong>Behandlingsansvarlig:</strong> Zastek AS, org.nr. 938 291 144, post@zastek.no. Kontaktperson: Naveed Zafar.
      </p>

      <h2 className="text-base font-semibold text-slate-900">2. Hva vi behandler og hvorfor</h2>
      <DataTable columns={['Opplysninger', 'Formål', 'Rettslig grunnlag', 'Lagringstid']} rows={ROWS} />
      <p>
        Vi bruker ikke analyseverktøy eller markedsføringscookies i appen. Forsiden kan laste et bilde fra Unsplash, som da kan se IP-adressen din.
        Appen bruker nødvendig lokal lagring i nettleseren for innlogging.
      </p>

      <h2 className="text-base font-semibold text-slate-900">3. Hvem vi deler med</h2>
      <p>
        Vi bruker Supabase (database og innlogging, lagring i Frankfurt), Vercel (drift av nettappen), Resend (e-post) og GitHub (krypterte sikkerhetskopier).
        Stripe behandler abonnementsbetaling som selvstendig behandlingsansvarlig. Brønnøysundregistrene brukes til oppslag på organisasjonsnummer, og OpenStreetMap Nominatim til å gjøre om butikkadresse til koordinater.
        Posten Signering brukes hvis kunden tar i bruk BankID-signering.
        Full liste med formål, lokasjon og overføringsgrunnlag står på siden for <Link className="underline" to="/personvern/underleverandorer">underleverandører</Link>.
      </p>
      <p>
        Overføring til USA skjer på grunnlag av EUs standardkontrakter og/eller EU–US Data Privacy Framework.
        Vi selger ikke personopplysninger.
      </p>

      <h2 className="text-base font-semibold text-slate-900">4. Dine rettigheter</h2>
      <p>
        Du har rett til innsyn, retting, sletting, begrensning, dataportabilitet og til å protestere.
        Send e-post til post@zastek.no. Vi svarer innen én måned. Du kan klage til Datatilsynet.
      </p>

      <h2 className="text-base font-semibold text-slate-900">5. Sikkerhet</h2>
      <p>
        Opplysningene overføres og lagres kryptert. Hver virksomhet er skilt fra andre med tilgangsstyring i databasen.
        Les mer på siden om <Link className="underline" to="/personvern/sikkerhet">sikkerhet</Link>.
      </p>

      <h2 className="text-base font-semibold text-slate-900">6. Endringer</h2>
      <p>
        Vesentlige endringer varsles på e-post til kundens administrator minst 30 dager før de trer i kraft.
      </p>
    </TrustLayout>
  );
}
