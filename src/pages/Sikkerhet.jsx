import LegalPage from '@/components/legal/LegalPage';
import { SECURITY_POINTS } from '@/legal/publicCopy';

export default function Sikkerhet() {
  return (
    <LegalPage title="Sikkerhet">
      <ul className="list-disc pl-5 space-y-1">
        {SECURITY_POINTS.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <p>Spørsmål om sikkerhet kan sendes til post@zastek.no.</p>
    </LegalPage>
  );
}
