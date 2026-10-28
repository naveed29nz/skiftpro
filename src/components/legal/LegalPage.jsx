import TrustLayout from '@/components/legal/TrustLayout';

export default function LegalPage({ title, children }) {
  return (
    <TrustLayout title={title}>
      {children}
    </TrustLayout>
  );
}
