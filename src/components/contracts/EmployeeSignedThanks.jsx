export const EMPLOYEE_SIGNED_THANKS = 'Takk for at du signerte! Du får en PDF-kopi på e-post når arbeidsgiveren din har signert.';

export default function EmployeeSignedThanks() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-lg bg-white rounded-2xl border border-slate-200 p-8">
        <p className="text-lg text-slate-900">{EMPLOYEE_SIGNED_THANKS}</p>
      </div>
    </div>
  );
}
