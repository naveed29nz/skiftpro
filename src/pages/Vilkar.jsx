import LegalPage from '@/components/legal/LegalPage';
import SubprocessorList from '@/components/legal/SubprocessorList';
import { RETENTION_PARAGRAPH } from '@/legal/publicCopy';

export default function Vilkar() {
  return (
    <LegalPage title="Vilkår for bruk">
      <p>SkiftPro leveres av Zastek AS, org.nr. 938 291 144, post@zastek.no. Vilkårene gjelder mellom Zastek AS og kunden som oppretter en organisasjon. Ansatte bruker tjenesten på vegne av kunden.</p>
      <p>Kunden er ansvarlig for at opplysninger om ansatte er lovlige å legge inn, og for å informere de ansatte. Abonnementet er per butikk, i norske kroner, med merverdiavgift. Prisen vises i Stripe ved bestilling og er ikke fastsatt i denne teksten. Nye kontoer får 30 dagers prøveperiode.</p>
      <p>Tjenesten leveres som den er i prøveperioden. Zastek AS kan stenge tilgang ved manglende betaling eller misbruk. Kunden sier opp i SkiftPro under Innstillinger. Oppsigelsesfristen er 30 dager og begynner den 1. i måneden etter at oppsigelsen er sendt. Abonnementet opphører når de 30 dagene er gått.</p>
      <p>{RETENTION_PARAGRAPH}</p>
      <h2 className="font-semibold text-base">Underleverandører</h2>
      <SubprocessorList />
      <p>Norsk rett gjelder. Verneting er virksomhetens verneting med mindre ufravikelig rett sier noe annet.</p>
    </LegalPage>
  );
}
