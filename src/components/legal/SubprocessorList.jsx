import { SUBPROCESSORS } from '@/legal/publicCopy';

export default function SubprocessorList() {
  return (
    <ul className="list-disc pl-5 space-y-1">
      {SUBPROCESSORS.map((item) => (
        <li key={item.name}>{item.text}</li>
      ))}
    </ul>
  );
}
