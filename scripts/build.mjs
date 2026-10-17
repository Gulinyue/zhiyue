import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { loadPublicConfig } from './config.mjs';

const root = path.resolve(import.meta.dirname, '..');
process.chdir(root);
const config = await loadPublicConfig(root);
const outputDirectory = path.resolve(root, 'out');
if (path.relative(root, outputDirectory) !== 'out') throw new Error('Unsafe build output path');
await fs.rm(outputDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
await fs.mkdir('out/main', { recursive: true });
await fs.mkdir('out/preload', { recursive: true });
await fs.mkdir('out/renderer/assets', { recursive: true });
const common = { bundle: true, sourcemap: true, logLevel: 'info', legalComments: 'eof' };
const define = {
  __CLIMB_BACKEND_URL__: JSON.stringify(config.backendUrl),
  __CLIMB_WEB_URL__: JSON.stringify(config.webUrl),
};
await Promise.all([
  build({ ...common, entryPoints: ['src/main/index.mjs'], outfile: 'out/main/runtime.cjs', platform: 'node', target: 'node22', format: 'cjs', packages: 'external', define }),
  build({ ...common, entryPoints: ['src/preload/index.cjs'], outfile: 'out/preload/index.js', platform: 'node', target: 'node22', format: 'cjs', external: ['electron'] }),
  build({ ...common, entryPoints: ['src/renderer/app.mjs'], outfile: 'out/renderer/assets/app.js', platform: 'browser', target: 'chrome140', format: 'esm', define }),
  build({ ...common, entryPoints: ['src/renderer/styles.css'], outfile: 'out/renderer/assets/app.css', loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file' }, assetNames: '[name]-[hash]' }),
]);
await fs.copyFile('src/main/bootstrap.cjs', 'out/main/index.js');
await fs.copyFile('src/renderer/index.html', 'out/renderer/index.html');
await fs.copyFile('resources/icon.png', 'out/renderer/assets/icon-CxNa5fSW.png');
console.log(`Climb built. Backend: ${config.backendUrl}`);
