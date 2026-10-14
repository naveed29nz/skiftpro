import LegalPage from '@/components/legal/LegalPage';

export default function Databehandleravtale() {
  return (
    <LegalPage title="Databehandleravtale">
      <p>Denne avtalen er et utkast mellom kunden (behandlingsansvarlig) og Zastek AS, org.nr. 938 291 144, post@zastek.no (databehandler), for bruk av SkiftPro.</p>
      <p>Zastek AS behandler personopplysninger bare etter kundens instruks: å levere vaktplan, stempling, timelister, fravær, oppgjør og tilhørende varsler. Zastek AS skal ikke bruke opplysningene til egne formål.</p>
      <p>Underdatabehandlere:</p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Supabase, lagring og autentisering i EU (Frankfurt)</li>
        <li>Vercel, hosting av applikasjonen</li>
        <li>Stripe, abonnementsbetaling, planlagt tatt i bruk senere</li>
        <li>Resend, transaksjonell e-post, planlagt tatt i bruk senere</li>
      </ul>
      <p>Posisjonsdata minimeres slik personvernerklæringen beskriver, og koordinater slettes etter 90 dager. Ved opphør slettes eller tilbakeleveres kundens data innen 90 dager, med unntak av det bokføringsloven krever. Avvik varsles kunden uten ugrunnet opphold.</p>
      <p>Kunden kan be om en signert versjon på post@zastek.no. Ikke ta denne teksten i bruk som bindende avtale før jurist har godkjent den.</p>
    </LegalPage>
  );
}
