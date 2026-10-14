import LegalPage from '@/components/legal/LegalPage';

export default function Vilkar() {
  return (
    <LegalPage title="Vilkår for bruk">
      <p>SkiftPro leveres av Zastek AS, org.nr. 938 291 144, post@zastek.no. Vilkårene gjelder mellom Zastek AS og kunden som oppretter en organisasjon. Ansatte bruker tjenesten på vegne av kunden.</p>
      <p>Kunden er ansvarlig for at opplysninger om ansatte er lovlige å legge inn, og for å informere de ansatte. Abonnementet er per butikk, i norske kroner, med merverdiavgift. Prisen vises i Stripe ved bestilling og er ikke fastsatt i denne teksten. Nye kontoer får 30 dagers prøveperiode.</p>
      <p>Tjenesten leveres som den er i prøveperioden. Zastek AS kan stenge tilgang ved manglende betaling eller misbruk. Kunden kan si opp via Stripe-kundeportalen når betaling er aktivert.</p>
      <p>Norsk rett gjelder. Verneting er virksomhetens verneting med mindre ufravikelig rett sier noe annet.</p>
    </LegalPage>
  );
}
