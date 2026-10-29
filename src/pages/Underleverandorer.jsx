import { Link } from 'react-router-dom';
import TrustLayout from '@/components/legal/TrustLayout';
import DataTable from '@/components/legal/DataTable';
import {
  CONDITIONAL_SUBPROCESSORS,
  OTHER_RECIPIENTS,
  SUBPROCESSOR_COLUMNS,
  SUBPROCESSORS,
  subprocessorRows,
} from '@/legal/subprocessors';
import { DPA_UPDATED_LABEL } from '@/lib/dpa';

export default function Underleverandorer() {
  return (
    <TrustLayout
      title="Underleverandører"
      updated={DPA_UPDATED_LABEL}
      lede="Zastek AS bruker disse underleverandørene for å levere SkiftPro. Kunden gir generell forhåndsgodkjenning. Endringer varsles minst 30 dager i forveien, og kunden kan protestere på saklig grunnlag."
    >
      <h2 className="text-base font-semibold text-slate-900">Underdatabehandlere i bruk</h2>
      <DataTable columns={SUBPROCESSOR_COLUMNS} rows={subprocessorRows(SUBPROCESSORS)} />

      <h2 className="text-base font-semibold text-slate-900">Tas i bruk når kunden aktiverer tjenesten</h2>
      <DataTable columns={SUBPROCESSOR_COLUMNS} rows={subprocessorRows(CONDITIONAL_SUBPROCESSORS)} />
      <p>
        Ved BankID-signering er kunden avsender. Zastek opptrer som behandler overfor Posten på vegne av kunden.
      </p>

      <h2 className="text-base font-semibold text-slate-900">Andre mottakere</h2>
      <p>Disse er ikke underdatabehandlere for ansattdata, men kan motta opplysninger i forbindelse med tjenesten.</p>
      <DataTable columns={SUBPROCESSOR_COLUMNS} rows={subprocessorRows(OTHER_RECIPIENTS)} />

      <h2 className="text-base font-semibold text-slate-900">Endringer</h2>
      <p>
        Nye underleverandører, eller bytte av en eksisterende, varsles skriftlig minst 30 dager før endringen.
        Kunden kan protestere på saklig grunnlag. Blir partene ikke enige, kan kunden si opp den berørte delen av avtalen uten kostnad.
        Vilkårene står i <Link className="underline" to="/personvern/databehandleravtale">databehandleravtalen</Link>.
      </p>
    </TrustLayout>
  );
}
