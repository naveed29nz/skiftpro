import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import WorkerForm from '@/components/workers/WorkerForm';
import ContractSignPanel from '@/components/contracts/ContractSignPanel';
import ContractCertificate from '@/components/contracts/ContractCertificate';

const SAMPLE_BODY = `ANSETTELSESAVTALE
mellom
Kiosken Oslo AS
(Arbeidsgiveren)
og
Kari Nordmann
(Arbeidstakeren)

Arbeidsforhold

Arbeidstakeren ansettes hos Arbeidsgiveren med tiltredelse 1. november 2026. Arbeidstakeren er ansatt i en 53,33 % stilling.

De vilkår og betingelser som gjelder i arbeidsforholdet er inntatt i denne Arbeidsavtalen og i Vedlegg 1.

Stilling

Arbeidstakeren er ansatt som selger, som for tiden innebærer salg og kundeservice, renhold, varepåfylling, tilberedning av mat og matsikkerhet.

Arbeidstid

Arbeidstiden er gjennomsnittlig på 20 timer per uke. Den gjennomsnittlige daglige arbeidstiden er 5 timer i kioskens åpningstid som for tiden er mellom klokken 07:00 og 23:00.

Lønn

Timelønn er 220,50 kroner. Lønn utbetales den 15. hver måned.

Ferie

Ferie utgjør fire uker og 1 dag. Feriepenger er 10,2 prosent og utbetales i mai.

Oppsigelse

Den gjensidige oppsigelsesfristen følger arbeidsmiljøloven. I prøvetiden på 6 måneder er fristen 14 dager.

Underskrifter

Ved å signere bekrefter partene at de har lest avtalen. Signeringen skjer med engangskode på e-post.`;

const SAMPLE_EVENTS = [
  { id: '1', event_type: 'opprettet', actor_role: 'arbeidsgiver', actor_id: 'admin-1', ip: '203.0.113.10', user_agent: 'Mozilla/5.0', created_at: '2026-10-15T08:00:00.000Z' },
  { id: '2', event_type: 'sendt', actor_role: 'arbeidsgiver', actor_id: 'admin-1', ip: '203.0.113.10', user_agent: 'Mozilla/5.0', created_at: '2026-10-15T08:01:00.000Z' },
  { id: '3', event_type: 'åpnet', actor_role: 'ansatt', actor_id: 'user-kari', ip: '198.51.100.24', user_agent: 'Mozilla/5.0 (iPhone)', created_at: '2026-10-15T09:12:00.000Z' },
  { id: '4', event_type: 'otp_sendt', actor_role: 'ansatt', actor_id: 'user-kari', ip: '198.51.100.24', user_agent: 'Mozilla/5.0 (iPhone)', created_at: '2026-10-15T09:14:00.000Z' },
  { id: '5', event_type: 'signert', actor_role: 'ansatt', actor_id: 'user-kari', ip: '198.51.100.24', user_agent: 'Mozilla/5.0 (iPhone)', created_at: '2026-10-15T09:15:11.000Z' },
  { id: '6', event_type: 'motsignert', actor_role: 'arbeidsgiver', actor_id: 'admin-1', ip: '203.0.113.10', user_agent: 'Mozilla/5.0', created_at: '2026-10-15T10:02:40.000Z' },
];

export default function ContractScreensPreview() {
  const [params] = useSearchParams();
  const screen = params.get('skjerm') || 'skjema';

  useEffect(() => {
    if (screen !== 'skjerm') return;
    const box = document.getElementById('send-arbeidsavtale');
    box?.scrollIntoView({ block: 'center' });
  }, [screen]);

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      {screen === 'skjema' && (
        <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 p-6">
          <h1 className="text-lg font-bold text-slate-900 mb-4">Ny ansatt</h1>
          <WorkerForm
            showWages
            onSubmit={() => {}}
            onCancel={() => {}}
            teamNames={{ team1: 'Kiosk' }}
            employerSettings={{
              selskap: 'Kiosken Oslo AS',
              org_nr: '999 999 999',
              adresse: 'Karl Johans gate 1, Oslo',
              signatur_navn: 'Ola Hansen',
              signatur_stilling: 'Daglig leder',
              alminnelig_ukentlig_arbeidstid: 37.5,
            }}
            workplace={{ workplace_name: 'Kiosk Karl Johan', workplace_address: 'Karl Johans gate 1', apningstid_fra: '07:00', apningstid_til: '23:00' }}
          />
        </div>
      )}
      {screen === 'signering' && (
        <ContractSignPanel
          title="Arbeidsavtale for Kari Nordmann"
          body={SAMPLE_BODY}
          role="ansatt"
          emailHint="kari@example.com"
          initialScrolled
          initialAccepted
          initialCodeSent
          onRequestCode={async () => {}}
          onVerify={() => {}}
          onReject={() => {}}
        />
      )}
      {screen === 'sertifikat' && (
        <div className="max-w-3xl mx-auto">
          <ContractCertificate
            documentId="c0ffee00-1111-4222-8333-444455556666"
            templateKey="fast"
            templateVersion={1}
            contentSha256="6f1d8e0a9c2b4e7d11aa22bb33cc44dd55ee66ff77889900aabbccddeeff0011"
            pdfSha256="ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12"
            workerName="Kari Nordmann"
            workerEmail="kari@example.com"
            companyName="Butikkdrift Nas AS"
            signatoryName="Naveed Zafar"
            employeeSignedAt="2026-10-15T09:15:11.000Z"
            employeeSignedBy="user-kari"
            employerSignedAt="2026-10-15T10:02:40.000Z"
            employerSignedBy="11111111-1111-1111-1111-111111111111"
            countersignerName="Naveed Zafar"
            countersignerEmail="naveed@example.com"
            events={SAMPLE_EVENTS}
          />
        </div>
      )}
    </div>
  );
}
