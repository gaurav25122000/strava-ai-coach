// Lightweight runner for pure-logic unit tests that don't need the RN runtime.
// Transpiles the test (and its imports) with the TypeScript compiler — no jest
// install required — then runs them in node. Add more *.test.ts files under
// src/services/__tests__ here as the pure-logic surface grows.
const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(require('os').tmpdir(), 'sac-logic-tests');
fs.rmSync(OUT, { recursive: true, force: true });

const FILES = [
  // [source relative to repo root, output relative to OUT]
  ['src/services/matchActivity.ts', 'matchActivity.js'],
  ['src/services/__tests__/matchActivity.test.ts', '__tests__/matchActivity.test.js'],
];
const RUN = ['__tests__/matchActivity.test.js'];

const opt = { compilerOptions: { module: 'commonjs', target: 'es2019', esModuleInterop: true } };
for (const [src, dst] of FILES) {
  const code = fs.readFileSync(path.join(ROOT, src), 'utf8');
  const js = ts.transpileModule(code, opt).outputText;
  const full = path.join(OUT, dst);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, js);
}

let failed = false;
for (const r of RUN) {
  try {
    require(path.join(OUT, r));
  } catch (e) {
    console.error(e);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
