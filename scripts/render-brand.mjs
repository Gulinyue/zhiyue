// 知跃 / Zhiyue · Developed by gulinyue.
import { spawn } from 'node:child_process';
import path from 'node:path';
import electron from 'electron';
const root = path.resolve(import.meta.dirname, '..');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, [path.join(root, 'scripts/render-brand.cjs')], { cwd: root, env, stdio: 'inherit', windowsHide: true });
child.on('error', (error) => { console.error(error); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
