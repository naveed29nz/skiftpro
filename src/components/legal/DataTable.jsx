export default function DataTable({ columns, rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-xs">
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th key={`${column}-${index}`} className="border-b border-slate-200 py-2 pr-3 font-semibold text-slate-700">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row[0] || rowIndex} className="align-top">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="border-b border-slate-100 py-2 pr-3 text-slate-700">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
