import { Link } from 'react-router-dom';
import TrustLayout from '@/components/legal/TrustLayout';
import DataTable from '@/components/legal/DataTable';
import { CONDITIONAL_SUBPROCESSORS, SUBPROCESSORS } from '@/legal/subprocessors';
import { DPA_UPDATED_LABEL, DPA_VERSION } from '@/lib/dpa';

const BILAG_A = [
  ['Formål', 'Vaktplanlegging, stempling og timeliste, fravær, lønnsgrunnlag, digitale arbeidsavtaler med e-signering, oppgaver, butikkoppgjør og varsler'],
  ['Behandlingens art', 'Innsamling, lagring, strukturering, sammenstilling, visning, utsending av varsler og e-post, eksport og sletting'],
  ['Kategorier registrerte', 'Kundens ansatte, innleide og ekstrahjelp, ledere, administratorer og signatarer'],
  ['Kategorier personopplysninger', 'Identitet og kontakt, fødselsnummer kryptert og bare ved behov, arbeidsforhold, arbeidstid, grove posisjonsdata ved stempling, kasse- og oppgjørsdata, e-signeringsdata, oppgaver, bilder og varsler'],
  ['Særlige kategorier', 'Fravær i form av egenmelding og sykmelding, uten diagnose'],
  ['Varighet', 'Så lenge hovedavtalen gjelder, og deretter til opplysningene er slettet eller tilbakelevert'],
  ['Lokasjon', 'Primærlagring i EU (AWS Frankfurt via Supabase)'],
];

const BILAG_B = [...SUBPROCESSORS, ...CONDITIONAL_SUBPROCESSORS].map((row) => [
  row.name,
  row.purpose,
  row.location,
  row.transfer,
]);

const BILAG_D = [
  ['Arbeidsavtaler og signeringsbevis', '60 måneder etter opphør, med mindre kunden angir en annen frist'],
  ['Timelister, vakter og lønnsgrunnlag', '5 år'],
  ['Fraværsmerking', 'Etter kundens angivelse'],
  ['Brukerkonto etter opphør', '3 måneder, med mindre kunden angir en annen frist'],
  ['Oppgaver og bilder', '12 måneder, med mindre kunden angir en annen frist'],
  ['Varsler', '90 dager'],
  ['Posisjonsdata', '90 dager. Fristen er fast i tjenesten'],
];

export default function Databehandleravtale() {
  return (
    <TrustLayout
      title="Databehandleravtale"
      updated={DPA_UPDATED_LABEL}
      downloadName={`SkiftPro-databehandleravtale-v${DPA_VERSION}.html`}
      lede={`Versjon ${DPA_VERSION}. Avtalen oppfyller personvernforordningen artikkel 28 nr. 3 og inngås mellom kunden som er registrert i SkiftPro og Zastek AS.`}
    >
      <p>
        Mellom kunden som er registrert i SkiftPro («Behandlingsansvarlig» / «Kunden») og Zastek AS, org.nr. 938 291 144, post@zastek.no («Databehandler»).
      </p>

      <h2 className="text-base font-semibold text-slate-900">1. Formål og bakgrunn</h2>
      <p>1.1 Avtalen regulerer Databehandlers behandling av personopplysninger på vegne av Behandlingsansvarlig ved levering av SkiftPro etter tjenesteavtalen mellom partene («Hovedavtalen»).</p>
      <p>1.2 Ved motstrid går denne avtalen foran Hovedavtalen i spørsmål om behandling av personopplysninger.</p>

      <h2 className="text-base font-semibold text-slate-900">2. Definisjoner</h2>
      <p>Begreper har samme betydning som i personvernforordningen artikkel 4 og personopplysningsloven.</p>

      <h2 className="text-base font-semibold text-slate-900">3. Behandlingens art, formål, varighet og kategorier</h2>
      <p>3.1 Behandlingen er beskrevet i bilag A. Den varer så lenge Hovedavtalen gjelder, og frem til opplysningene er slettet eller tilbakelevert etter punkt 12.</p>

      <h2 className="text-base font-semibold text-slate-900">4. Behandlingsansvarliges plikter</h2>
      <p>4.1 Behandlingsansvarlig har ansvar for rettslig grunnlag, for informasjon til de registrerte, for egen protokoll og for å vurdere behov for personvernkonsekvensvurdering.</p>
      <p>4.2 Behandlingsansvarlig er ansvarlig for arbeidsmiljøloven kapittel 9, herunder posisjonskontroll ved stempling, og for drøfting med tillitsvalgte før funksjonene tas i bruk.</p>
      <p>4.3 Behandlingsansvarlig skal ikke legge inn diagnoser eller andre unødvendige helseopplysninger i fritekstfelt.</p>

      <h2 className="text-base font-semibold text-slate-900">5. Databehandlers plikter</h2>
      <p>5.1 Databehandler skal bare behandle personopplysninger etter dokumenterte instrukser fra Behandlingsansvarlig, inkludert denne avtalen, bilag D og innstillinger Kunden gjør i SkiftPro. Det gjelder også ved overføring til tredjeland, med mindre annet følger av lov. Databehandler skal da informere Behandlingsansvarlig før behandlingen, med mindre loven forbyr det.</p>
      <p>5.2 Databehandler skal straks varsle dersom en instruks etter Databehandlers mening er i strid med personvernforordningen.</p>
      <p>5.3 Databehandler skal ikke bruke opplysningene til egne formål, herunder markedsføring, profilering eller trening av maskinlæringsmodeller.</p>

      <h2 className="text-base font-semibold text-slate-900">6. Taushetsplikt og tilgang</h2>
      <p>6.1 Bare personell som trenger tilgang for å levere tjenesten eller gi support, skal ha tilgang. Disse er underlagt skriftlig taushetsplikt.</p>
      <p>6.2 Databehandler fører oversikt over personell med administrativ tilgang og gjennomgår den minst hvert halvår. Tilgang til en kundes data i support skal bare skje etter forespørsel fra Kunden eller når det er nødvendig for å rette feil, og skal logges.</p>

      <h2 className="text-base font-semibold text-slate-900">7. Sikkerhet</h2>
      <p>7.1 Databehandler skal gjennomføre egnede tekniske og organisatoriske tiltak etter artikkel 32, som beskrevet i bilag C. Tiltakene skal vurderes jevnlig og minst årlig.</p>

      <h2 className="text-base font-semibold text-slate-900">8. Underdatabehandlere</h2>
      <p>8.1 Kunden gir generell skriftlig forhåndsgodkjenning til underdatabehandlerne i bilag B.</p>
      <p>8.2 Databehandler skal varsle Kunden skriftlig minst 30 dager før nye underdatabehandlere tas i bruk eller eksisterende byttes. Kunden kan protestere på saklig grunnlag. Dersom partene ikke blir enige, kan Kunden si opp den berørte delen av Hovedavtalen uten kostnad.</p>
      <p>8.3 Databehandler skal pålegge underdatabehandlere tilsvarende plikter som etter denne avtalen, og er ansvarlig overfor Kunden for deres oppfyllelse.</p>

      <h2 className="text-base font-semibold text-slate-900">9. Overføring til tredjeland</h2>
      <p>9.1 Overføring utenfor EØS skjer bare med gyldig overføringsgrunnlag etter personvernforordningen kapittel V. Primærlagring av data skjer i EU (Frankfurt).</p>

      <h2 className="text-base font-semibold text-slate-900">10. Bistand</h2>
      <p>10.1 Databehandler skal, så langt det er mulig, bistå Kunden med de registrertes rettigheter, herunder ved å gi Kunden mulighet til å eksportere, rette og slette opplysninger i SkiftPro. Henvendelser fra registrerte som kommer til Databehandler, videresendes Kunden uten ugrunnet opphold.</p>
      <p>10.2 Databehandler skal bistå med sikkerhet, avvik, personvernkonsekvensvurdering og forhåndsdrøftinger, blant annet ved å stille dokumentasjon om behandlingen og sikkerheten til rådighet.</p>
      <p>10.3 Bistand utover det som er rimelig og standard, avtales særskilt.</p>

      <h2 className="text-base font-semibold text-slate-900">11. Avvik</h2>
      <p>11.1 Databehandler skal varsle Kunden uten ugrunnet opphold, og senest 24 timer etter å ha blitt kjent med et brudd på personopplysningssikkerheten.</p>
      <p>11.2 Varselet skal minst inneholde opplysningene i artikkel 33 nr. 3, så langt de er kjent, og suppleres fortløpende.</p>
      <p>11.3 Databehandler skal iverksette tiltak for å begrense skaden og dokumentere avviket.</p>

      <h2 className="text-base font-semibold text-slate-900">12. Sletting og tilbakelevering</h2>
      <p>12.1 Ved opphør av Hovedavtalen skal Databehandler etter Kundens valg tilbakelevere opplysningene i et maskinlesbart format og/eller slette dem innen 90 dager, med mindre lov krever lagring.</p>
      <p>12.2 Sikkerhetskopier slettes ved utløpet av kopienes ordinære oppbevaringstid.</p>
      <p>12.3 Databehandler skal på forespørsel bekrefte slettingen skriftlig.</p>
      <p>12.4 Under avtaletiden følger sletting lagringstidene i bilag D og de automatiske slettejobbene i tjenesten.</p>

      <h2 className="text-base font-semibold text-slate-900">13. Revisjon</h2>
      <p>13.1 Databehandler skal gjøre tilgjengelig den informasjonen som er nødvendig for å vise at pliktene i artikkel 28 er oppfylt, og bidra til revisjoner som Kunden eller en revisor Kunden har gitt fullmakt, gjennomfører. Revisjon varsles minst 30 dager i forveien og gjennomføres slik at den ikke forstyrrer driften unødig. Kunden dekker egne kostnader.</p>

      <h2 className="text-base font-semibold text-slate-900">14. Ansvar</h2>
      <p>14.1 Ansvar reguleres av personvernforordningen artikkel 82 og Hovedavtalen.</p>

      <h2 className="text-base font-semibold text-slate-900">15. Varighet</h2>
      <p>15.1 Avtalen gjelder så lenge Databehandler behandler personopplysninger for Kunden.</p>

      <h2 className="text-base font-semibold text-slate-900">16. Lovvalg og verneting</h2>
      <p>16.1 Norsk rett. Verneting er Oslo tingrett.</p>

      <h2 className="text-base font-semibold text-slate-900">Inngåelse</h2>
      <p>
        Avtalen inngås når en administrator for Kunden aksepterer versjon {DPA_VERSION} i SkiftPro.
        Aksepten lagres med versjonsnummer, tidspunkt og hvilken bruker som aksepterte.
        Kunden kan be om et eksemplar på post@zastek.no. For Zastek AS signerer Naveed Zafar, daglig leder.
      </p>

      <h2 className="text-base font-semibold text-slate-900">Bilag A – beskrivelse av behandlingen</h2>
      <DataTable columns={['Felt', 'Beskrivelse']} rows={BILAG_A} />

      <h2 className="text-base font-semibold text-slate-900">Bilag B – godkjente underdatabehandlere</h2>
      <DataTable
        columns={['Underdatabehandler', 'Tjeneste', 'Lokasjon', 'Overføringsgrunnlag']}
        rows={BILAG_B}
      />
      <p>
        Den løpende listen med personopplysninger per leverandør ligger på siden for <Link className="underline" to="/personvern/underleverandorer">underleverandører</Link>.
        Stripe behandler abonnementsbetaling som selvstendig behandlingsansvarlig og er ikke underdatabehandler for ansattdata.
      </p>

      <h2 className="text-base font-semibold text-slate-900">Bilag C – sikkerhetstiltak</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Tilgangsstyring med radnivåsikkerhet og isolasjon per kunde. Lønnsfelt er skjult for brukere uten rettighet.</li>
        <li>Kryptering under overføring og ved lagring. Fødselsnummer er feltkryptert.</li>
        <li>Private fillagre med tidsbegrensede lenker.</li>
        <li>E-signering med engangskode, lagret som hash, og hendelseslogg med dokumenthash.</li>
        <li>Automatisk sletting av posisjonsdata etter 90 dager.</li>
        <li>Kryptert sikkerhetskopi av databasen, med begrenset oppbevaringstid.</li>
        <li>Skille mellom test og produksjon, kodegjennomgang og automatiske tester.</li>
        <li>Rutine for avvikshåndtering og varsling innen 24 timer.</li>
      </ul>

      <h2 className="text-base font-semibold text-slate-900">Bilag D – lagringstid</h2>
      <p>Kunden kan angi andre frister der tjenesten har en slik innstilling. Posisjonsdata slettes etter 90 dager.</p>
      <DataTable columns={['Kategori', 'Lagringstid']} rows={BILAG_D} />
    </TrustLayout>
  );
}
