import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'acorn';
import { analyze } from 'eslint-scope';

const root = path.resolve(import.meta.dirname, '..');
const globals = new Set([
  ...Object.getOwnPropertyNames(globalThis), 'require', 'module', 'exports', '__dirname', '__filename',
  '__CLIMB_BACKEND_URL__', '__CLIMB_WEB_URL__', 'window', 'document', 'navigator',
  'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', 'sessionStorage',
  'HTMLElement', 'Element', 'HTMLInputElement', 'HTMLMediaElement', 'Audio', 'Image',
  'MediaStream', 'MediaRecorder', 'AudioContext', 'AudioWorkletNode', 'AudioWorkletProcessor', 'registerProcessor', 'FileReader', 'ResizeObserver',
  'MutationObserver', 'Node', 'DOMParser', 'XMLSerializer', 'Event', 'CustomEvent',
  'KeyboardEvent', 'MouseEvent', 'WebSocket', 'WebSocketPair', 'MediaSource',
  'HTMLAudioElement', 'HTMLVideoElement', 'SpeechSynthesisUtterance', 'screen', 'location', 'performance',
]);
async function files(directory) {
  const found = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await files(file));
    else if (/\.(mjs|cjs|js)$/.test(file)) found.push(file);
  }
  return found;
}
const sources = await files(path.join(root, 'src'));
const failures = [];
const moduleMap = {};
for (const file of sources) {
  const code = await fs.readFile(file, 'utf8');
  const sourceType = file.endsWith('.cjs') ? 'script' : 'module';
  const ast = parse(code, { ecmaVersion: 'latest', sourceType, ranges: true, locations: true });
  moduleMap[path.relative(root, file).replaceAll('\\', '/')] = {
    lines: code.split('\n').length,
    imports: ast.body.filter((node) => node.type === 'ImportDeclaration').map((node) => node.source.value),
  };
  // Vendor snapshots retain the original bundler's cross-environment shims.
  if (file.includes(`${path.sep}vendor${path.sep}`) || sourceType === 'script') continue;
  const scopes = analyze(ast, { ecmaVersion: 2024, sourceType, optimistic: true, ignoreEval: true });
  for (const ref of scopes.globalScope.through) {
    if (!globals.has(ref.identifier.name)) failures.push(`${path.relative(root, file)}:${ref.identifier.loc.start.line} unresolved ${ref.identifier.name}`);
  }
}
if (failures.length) {
  console.error([...new Set(failures)].join('\n'));
  process.exitCode = 1;
} else console.log(`Checked ${sources.length} source files: syntax and lexical references passed.`);
if (!failures.length && process.argv.includes('--write-map')) {
  await fs.writeFile(path.join(root, 'docs/module-map.json'), JSON.stringify(moduleMap, null, 2) + '\n');
}
