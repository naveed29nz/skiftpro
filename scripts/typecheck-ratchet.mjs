import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baseline = Number(readFileSync(join(root, 'scripts/typecheck-baseline.txt'), 'utf8').trim());
const result = spawnSync('npx', ['tsc', '-p', 'jsconfig.json', '--pretty', 'false', '--noEmit'], {
  cwd: root,
  encoding: 'utf8',
});
const text = `${result.stdout || ''}\n${result.stderr || ''}`;
const errors = text.split('\n').filter((line) => /error TS\d+:/.test(line));

console.log(`npm run typecheck (tsc -p jsconfig.json): ${errors.length} errors, baseline ${baseline}`);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
if (errors.length === 0 && result.status !== 0) {
  process.stderr.write(text);
  process.exit(result.status || 1);
}
if (errors.length > baseline) {
  process.stderr.write(errors.slice(0, 30).join('\n'));
  process.stderr.write(`\n::error::Typecheck grew from ${baseline} to ${errors.length}.\n`);
  process.exit(1);
}
if (errors.length < baseline) {
  console.log(`Baseline can be lowered from ${baseline} to ${errors.length}.`);
}
