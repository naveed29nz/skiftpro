import { Link } from 'react-router-dom';
import TrustLayout from '@/components/legal/TrustLayout';
import { DPA_UPDATED_LABEL } from '@/lib/dpa';

const MEASURES = [
  ['EU-hosting i Frankfurt', 'Database, innlogging, fillagring og serverfunksjoner ligger hos Supabase i AWS-region eu-central-1 (Frankfurt). Primærlagringen skjer i EU.'],
  ['Isolasjon per virksomhet', 'Radnivåsikkerhet i databasen skiller kundene. En virksomhet får ikke tilgang til en annen virksomhets data.'],
  ['Kryptering', 'Trafikk krypteres under overføring. Data lagres kryptert hos leverandøren. Fødselsnummer er i tillegg feltkryptert og vises maskert.'],
  ['Sikkerhetskopi', 'Databasen inngår i sikkerhetskopieringen. Kopiene krypteres og oppbevares i en begrenset periode.'],
  ['Tilgangsstyring', 'Tilgang følger rolle. Lønnsfelt er skjult for brukere uten rettighet. Filer ligger i private lagre og deles med tidsbegrensede lenker. Signeringshendelser lagres med tidspunkt og dokumenthash.'],
];

export default function Sikkerhet() {
  return (
    <TrustLayout
      title="Sikkerhet"
      updated={DPA_UPDATED_LABEL}
      lede="SkiftPro er bygget slik at hver kundes data holdes adskilt. Dette er de viktigste tiltakene."
    >
      {MEASURES.map(([title, text]) => (
        <section key={title} className="space-y-1">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <p>{text}</p>
        </section>
      ))}
      <p>
        Grove koordinater fra stempling slettes automatisk etter 90 dager. Nøyaktig posisjon lagres ikke.
        Underleverandører og overføringsgrunnlag står i <Link className="underline" to="/personvern/underleverandorer">underleverandørlisten</Link>.
        Pliktene overfor kunden står i <Link className="underline" to="/personvern/databehandleravtale">databehandleravtalen</Link>.
      </p>
      <p>Spørsmål om sikkerhet kan sendes til post@zastek.no.</p>
    </TrustLayout>
  );
}
