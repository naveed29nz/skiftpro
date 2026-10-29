import { Link } from 'react-router-dom';
import TrustLayout from '@/components/legal/TrustLayout';
import { TRUST_CARDS } from '@/legal/routes';
import { DPA_UPDATED_LABEL } from '@/lib/dpa';

export default function Personvern() {
  return (
    <TrustLayout
      bare
      kicker="Zastek AS"
      title="Personvern og sikkerhet"
      updated={DPA_UPDATED_LABEL}
      lede="SkiftPro er en nettbasert løsning for vaktplan, stempling, timelister, fravær, lønnsgrunnlag, digitale arbeidsavtaler, oppgaver og butikkoppgjør. Her finner du hvem som er ansvarlig for personopplysningene, hvilke underleverandører vi bruker, og hvordan opplysningene sikres."
    >
      <div className="grid gap-4 md:grid-cols-2">
        {TRUST_CARDS.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-800"
          >
            <h2 className="text-lg font-semibold text-slate-900">{card.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{card.description}</p>
          </Link>
        ))}
      </div>
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-700">
        <h2 className="text-base font-semibold text-slate-900">Roller</h2>
        <p className="mt-2">
          Kunden, altså arbeidsgiveren, er behandlingsansvarlig for opplysninger om egne ansatte.
          Zastek AS er databehandler og behandler disse opplysningene bare etter kundens instruks.
        </p>
        <p className="mt-2">
          Zastek AS er selv behandlingsansvarlig for kunde- og fakturaopplysninger, og i begrenset grad for drifts- og sikkerhetslogger.
          Ansatte som vil bruke rettighetene sine, kontakter arbeidsgiveren. Henvendelser til post@zastek.no sendes videre.
        </p>
      </div>
    </TrustLayout>
  );
}
