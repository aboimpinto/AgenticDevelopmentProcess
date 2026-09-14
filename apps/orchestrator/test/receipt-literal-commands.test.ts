import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { receiptCommandMatches } from "../src/manual-test-verification/receipt-command-binding.js";

const equivalent = [
  ['npx vitest run --outputFile=/run/report.json', 'npx  vitest\trun --outputFile="/run/report.json"'],
  ['dotnet test suite.csproj --filter "Category=Twin&Category=Local"', "dotnet test 'suite.csproj' --filter 'Category=Twin&Category=Local'"],
  ['dotnet test suite.csproj --filter Category=Twin', 'dotnet test suite.csproj --filter "Category=Twin"'],
  ['OUTPUT=x node runner.cjs --setting KEY=value', 'OUTPUT="x" node runner.cjs --setting "KEY=value"'],
  ['> /run/log OUTPUT=x node runner.cjs', '> "/run/log" OUTPUT="x" node runner.cjs'],
  ['node first.cjs && OUTPUT=x node second.cjs KEY=value', 'node "first.cjs" && OUTPUT="x" node second.cjs "KEY=value"'],
  ['cargo test --manifest-path native/Cargo.toml --locked', 'cargo test --manifest-path "native/Cargo.toml" --locked'],
  ['node runner.cjs --path="/project/test files"', 'node runner.cjs --path=/project/test\\ files'],
  ["node runner.cjs --label='it'\\''s ready'", 'node runner.cjs --label="it\'s ready"'],
  ['OUTPUT=/run/results node runner.cjs', 'OUTPUT="/run/results" node "runner.cjs"'],
  ['node runner.cjs ""', "node runner.cjs ''"],
  ['node runner.cjs \\* \\$HOME', "node runner.cjs '*' '$HOME'"],
  ['node first.cjs && node second.cjs', 'node "first.cjs"&&node second.cjs'],
  ['node runner.cjs > /run/results.json 2>&1', 'node "runner.cjs">"/run/results.json" 2>&1'],
  ['node runner.cjs --flag value', 'node runner.cjs \\\n --flag value'],
];
it.each(equivalent)("accepts equivalent literal invocation %s", (planned, actual) => {
  expect(receiptCommandMatches(actual, planned, '/project')).toBe(true);
  expect(receiptCommandMatches(planned, actual, '/project')).toBe(true);
});
it.each([
  ['node runner.cjs &>/run/log', 'node runner.cjs & > /run/log'],
  ['node runner.cjs |& cat', 'node runner.cjs | & cat'],
  ['((1))', '( (1) )'],
  ['OUTPUT+=x node runner.cjs', '"OUTPUT+=x" node runner.cjs'],
  ['node runner.cjs --select A', 'node runner.cjs --select B'],
  ['node runner.cjs "two words"', 'node runner.cjs two words'],
  ['node runner.cjs ""', 'node runner.cjs'],
  ['node runner.cjs "$HOME"', "node runner.cjs '$HOME'"],
  ['node runner.cjs *.ts', 'node runner.cjs "*.ts"'],
  ['node runner.cjs ~', 'node runner.cjs "~"'],
  ['OUTPUT=x node runner.cjs', '"OUTPUT=x" node runner.cjs'],
  ['node runner.cjs > /run/results.json', 'node runner.cjs > /run/other.json'],
  ['node runner.cjs 2>/run/log', 'node runner.cjs 2 > /run/log'],
  ['node runner.cjs 2>&1 > /run/log', 'node runner.cjs > /run/log 2>&1'],
  ['node a.cjs && node b.cjs', 'node a.cjs ; node b.cjs'],
  ['node runner.cjs', 'node runner.cjs || true'],
  ['node runner.cjs', 'node runner.cjs # comment'],
  ['node runner.cjs value', 'node runner.cjs "value'],
  ['node runner.cjs "$(echo value)"', 'node runner.cjs value'],
  ['node runner.cjs "`echo value`"', 'node runner.cjs value'],
  ['node runner.cjs', "node runner.cjs\ntrue"],
])("preserves shell semantics and scope: %s", (planned, actual) => {
  expect(receiptCommandMatches(actual, planned, '/project')).toBe(false);
});

const binding = { directory: '/run', logPath: 'console.log', nativePaths: ['report.json'] };
it.each(equivalent.filter(([planned]) => !planned!.includes(">") && !planned!.includes("&&")))('allows equivalent quoting with bound capture: %s', (planned, actual) => {
  expect(receiptCommandMatches(`${actual} > "/run/console.log" 2>&1`, planned, '/project', binding)).toBe(true);
});
it('preserves capture scope for AND lists and never allows report overwrite', () => {
  const planned = 'node first.cjs && node second.cjs';
  expect(receiptCommandMatches('(node "first.cjs"&&node "second.cjs") > /run/console.log 2>&1', planned, '/project', binding)).toBe(true);
  expect(receiptCommandMatches('node "first.cjs"&&node "second.cjs" > /run/console.log 2>&1', planned, '/project', binding)).toBe(false);
  expect(receiptCommandMatches('node "first.cjs"&&node "second.cjs" > /run/console.log 2>&1', planned, '/project', {...binding, nonTest: true})).toBe(true);
  expect(receiptCommandMatches('node "runner.cjs" > /run/report.json', 'node runner.cjs', '/project', {...binding, logPath:'report.json'})).toBe(false);
  expect(receiptCommandMatches('node "runner.cjs" > /run/other.log', 'node runner.cjs', '/project', binding)).toBe(false);
});
it.each([
  ['--path=/run/report.json', '--path="/run/report.json"'],
  ['--path="/project/test files"', '--path=/project/test\\ files'],
  ["''", '""'],
  ["'literal$HOME'", 'literal\\$HOME'],
])('checks argument equivalence against actual bash execution: %s', (planned, actual) => {
  const runner = `${JSON.stringify(process.execPath)} -e 'console.log(JSON.stringify(process.argv.slice(1)))' -- `;
  const run = (args: string) => execFileSync('bash', ['-c', runner + args], {encoding:'utf8', timeout:10000});
  expect(run(actual)).toBe(run(planned));
  expect(receiptCommandMatches(runner + actual, runner + planned, '/project')).toBe(true);
});
