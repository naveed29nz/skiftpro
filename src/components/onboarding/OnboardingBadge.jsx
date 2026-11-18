// @ts-nocheck
export default function OnboardingBadge({ status }) {
  if (!status) return null;
  const complete = status.done === status.total;
  return (
    <div
      className={`mt-3 rounded-lg px-2.5 py-2 text-xs ${complete ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}
      data-testid="onboarding-status"
    >
      <p className="font-medium">Oppstart {status.done}/{status.total}</p>
      {complete ? (
        <p className="mt-0.5">Sjekklisten er fullført.</p>
      ) : (
        <p className="mt-0.5">Mangler: {status.missing.join(', ')}</p>
      )}
    </div>
  );
}
