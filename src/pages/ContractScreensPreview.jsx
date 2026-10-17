import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import WorkerForm from '@/components/workers/WorkerForm';
import ContractSignPanel from '@/components/contracts/ContractSignPanel';
import ContractCertificate from '@/components/contracts/ContractCertificate';
import Contracts from '@/pages/Contracts';

const PREVIEW_PDF = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R>>endobj\n4 0 obj<</Length 68>>stream\nBT /F1 18 Tf 40 80 Td (SkiftPro kontrakt) Tj ET\nendstream\nendobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';

const PREVIEW_CONTRACTS = [
  {
    id: 'c-preview-sendt',
    worker_name: 'TEST Naveed Zafar',
    org_name: 'Butikkdrift Nas AS',
    contract_type: 'fast',
    status: 'sendt',
    start_date: '2026-11-01',
    end_date: '2026-12-31',
    weekly_hours: '18.75',
    overtime_hours: '2,5',
    hourly_rate: 200,
    employment_percentage: 50,
    week_number: 44,
    year: 2026,
    reason: 'sesong',
    generated_automatically: false,
    approved_at: 'ikke-en-dato',
  },
  {
    id: 'c-preview-ansatt',
    worker_name: 'Kari Nordmann',
    org_name: 'Butikkdrift Nas AS',
    contract_type: 'fast',
    status: 'signert_ansatt',
    start_date: '2026-11-01',
    end_date: null,
    weekly_hours: 37.5,
    overtime_hours: 0,
    hourly_rate: 220,
    employment_percentage: 100,
    week_number: 44,
    year: 2026,
    reason: 'sesong',
    generated_automatically: false,
  },
];

function previewPdf() {
  return new Blob([PREVIEW_PDF], { type: 'application/pdf' });
}

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
      {screen === 'liste' && (
        <Contracts fixture={PREVIEW_CONTRACTS} wagesVisible loadPdf={previewPdf} />
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
