import LegalPage from '@/components/legal/LegalPage';

export default function Personvern() {
  return (
    <LegalPage title="Personvernerklæring">
      <p>Behandlingsansvarlig er Zastek AS, org.nr. 938 291 144, e-post post@zastek.no. SkiftPro brukes til vaktplan, timelister, stempling og oppgjør for virksomhetens ansatte.</p>
      <p>Vi behandler navn, e-post, telefon, rolle, vakter, fravær, stemplingstidspunkt og lønnsgrunnlag som arbeidsgiveren legger inn. Formålet er å administrere arbeidstid og lønn. Grunnlaget er avtale med kunden og berettiget interesse i å føre timelister, samt rettslig plikt der bokføringsregler krever oppbevaring.</p>
      <h2 className="font-semibold text-base">Posisjon ved stempling</h2>
      <p>Ved første stempling blir du bedt om å godta at posisjon brukes for å kontrollere at du er på arbeidsstedet. Vi lagrer ikke den nøyaktige GPS-posisjonen. Vi lagrer avstand i meter, om du var innenfor geofence, og grove koordinater avrundet til tre desimaler (omtrent 100 meter). Rå og grove koordinater slettes automatisk etter 90 dager. Avstand og innenfor/utenfor beholdes som del av timelisten.</p>
      <p>Du kan be arbeidsgiveren eller Zastek AS om innsyn, retting eller sletting der reglene tillater det. Klage kan sendes til Datatilsynet.</p>
      <h2 className="font-semibold text-base">Elektronisk signering</h2>
      <p>Når en arbeidsavtale signeres i SkiftPro, lagrer vi avtaleteksten, tidspunkt, hvilken metode som ble brukt, IP-adresse og nettleserinformasjon. Det er dokumentasjon på at avtalen ble signert. Vi ber ikke om fødselsnummer. Opplysningene slettes ikke automatisk. Arbeidsgiver må bekrefte sletting etter at oppbevaringstiden er ute.</p>
      <h2 className="font-semibold text-base">Databehandlere</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>Supabase, database og innlogging, EU-region Frankfurt</li>
        <li>Vercel, drifting av nettappen</li>
        <li>Stripe, betaling, tas i bruk senere</li>
        <li>Resend, e-postutsending, tas i bruk senere</li>
      </ul>
    </LegalPage>
  );
}
