import LegalPage from '@/components/legal/LegalPage';
import SubprocessorList from '@/components/legal/SubprocessorList';
import { DPA_CLOSING, DPA_INTRO, RETENTION_PARAGRAPH } from '@/legal/publicCopy';

export default function Databehandleravtale() {
  return (
    <LegalPage title="Databehandleravtale">
      <p>{DPA_INTRO}</p>
      <p>Zastek AS behandler personopplysninger bare etter kundens instruks: å levere vaktplan, stempling, timelister, fravær, oppgjør og tilhørende varsler. Zastek AS skal ikke bruke opplysningene til egne formål.</p>
      <p>Underdatabehandlere:</p>
      <SubprocessorList />
      <p>Posisjonsdata minimeres slik personvernerklæringen beskriver, og koordinater slettes etter 90 dager.</p>
      <p>{RETENTION_PARAGRAPH}</p>
      <p>Avvik varsles kunden uten ugrunnet opphold.</p>
      <p>{DPA_CLOSING}</p>
    </LegalPage>
  );
}
