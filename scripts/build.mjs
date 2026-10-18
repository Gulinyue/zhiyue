import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { BRAND } from '../src/shared/brand.mjs';

const root = path.resolve(import.meta.dirname, '..');
process.chdir(root);
const outputDirectory = path.resolve(root, 'out');
if (path.relative(root, outputDirectory) !== 'out') throw new Error('Unsafe build output path');
await fs.rm(outputDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
await fs.mkdir('out/main', { recursive: true });
await fs.mkdir('out/preload', { recursive: true });
await fs.mkdir('out/renderer/assets', { recursive: true });
await fs.mkdir('out/mobile/assets', { recursive: true });
const common = { bundle: true, sourcemap: true, metafile: true, logLevel: 'info', legalComments: 'eof', banner: { js: `/*! ${BRAND.sourceWatermark} */` } };
const define = {};
const results = await Promise.all([
  build({ ...common, entryPoints: ['src/shared/brand.mjs'], outfile: 'out/main/brand.cjs', platform: 'node', target: 'node22', format: 'cjs' }),
  build({ ...common, entryPoints: ['src/main/index.mjs'], outfile: 'out/main/runtime.cjs', platform: 'node', target: 'node22', format: 'cjs', packages: 'external', define }),
  build({ ...common, entryPoints: ['src/main/career/import-worker.mjs'], outfile: 'out/main/resume-worker.mjs', platform: 'node', target: 'node22', format: 'esm', packages: 'external' }),
  build({ ...common, entryPoints: ['src/preload/index.cjs'], outfile: 'out/preload/index.js', platform: 'node', target: 'node22', format: 'cjs', external: ['electron'] }),
  build({ ...common, entryPoints: ['src/renderer/local/app.mjs'], outfile: 'out/renderer/assets/app.js', platform: 'browser', target: 'chrome140', format: 'esm', define }),
  build({ ...common, entryPoints: ['src/renderer/local/style.css'], outfile: 'out/renderer/assets/app.css', loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file' }, assetNames: '[name]-[hash]' }),
  build({ ...common, entryPoints: ['src/renderer/mobile/app.mjs'], outfile: 'out/mobile/assets/app.js', platform: 'browser', target: ['safari16', 'chrome110'], format: 'esm' }),
  build({ ...common, entryPoints: ['src/renderer/mobile/style.css'], outfile: 'out/mobile/assets/app.css', loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file' }, assetNames: '[name]-[hash]' }),
]);
await fs.mkdir('artifacts', { recursive: true });
await fs.writeFile('artifacts/build-inputs.json', JSON.stringify([...new Set([...results.flatMap((result) => Object.keys(result.metafile.inputs)), 'src/renderer/local/interview-worklet.js', 'src/renderer/mobile/index.html'])].sort(), null, 2) + '\n');
await fs.copyFile('src/main/bootstrap.cjs', 'out/main/index.js');
await fs.copyFile('src/renderer/index.html', 'out/renderer/index.html');
await fs.copyFile('src/renderer/local/interview-worklet.js', 'out/renderer/assets/interview-worklet.js');
await fs.copyFile('resources/icon.png', 'out/renderer/assets/icon.png');
await fs.copyFile('resources/logo.svg', 'out/renderer/assets/logo.svg');
await fs.copyFile('src/renderer/mobile/index.html', 'out/mobile/index.html');
await fs.copyFile('resources/logo.svg', 'out/mobile/assets/logo.svg');
for (const file of ['out/main/runtime.cjs', 'out/renderer/assets/app.js', 'out/mobile/assets/app.js']) {
  const source = await fs.readFile(file, 'utf8');
  if (/\/v1\/(?:auth\/|byok\/entitlements|client\/version|remote-control|asr\/stream)/.test(source)) {
    throw new Error(`Local build unexpectedly includes an application-server path: ${file}`);
  }
}
console.log(`${BRAND.name} built. Developed by ${BRAND.developer}.`);
