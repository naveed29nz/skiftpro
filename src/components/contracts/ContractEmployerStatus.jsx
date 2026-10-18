import { Link } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ContractEmployerStatus({
  title,
  workerName,
  typeLabel,
  employeeLine = '',
  countersign = false,
  notice = '',
  backHref = '/Contracts',
  backLabel = 'Tilbake til kontrakter',
}) {
  return (
    <article className="bg-white text-slate-900 rounded-xl border border-slate-200 shadow-sm px-4 py-6 sm:px-6">
      <div className="flex items-start gap-3">
        <Clock className="w-8 h-8 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
        <h1 className="text-xl sm:text-2xl font-bold leading-snug">{title}</h1>
      </div>
      <div className="mt-5 space-y-1.5 text-sm sm:text-base text-slate-800">
        <p className="font-semibold text-slate-900">{workerName || '–'}</p>
        {typeLabel ? <p>{typeLabel}</p> : null}
        {employeeLine ? <p>{employeeLine}</p> : null}
        {notice ? <p role="alert" className="text-red-600">{notice}</p> : null}
      </div>
      <div className="mt-5 flex flex-col sm:flex-row gap-2">
        {countersign ? (
          <Button type="button" className="min-h-11 w-full sm:w-auto" asChild>
            <a href="#motsigner">Motsigner</a>
          </Button>
        ) : null}
        <Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto" asChild>
          <Link to={backHref}>{backLabel}</Link>
        </Button>
      </div>
    </article>
  );
}
