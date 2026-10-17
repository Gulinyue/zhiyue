import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import electron from 'electron';

const root = path.resolve(import.meta.dirname, '..');
await fs.mkdir(path.join(root, '.runtime'), { recursive: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const target = process.argv[2] === 'guide' ? 'smoke-guide.cjs' : process.argv[2] === 'auth' ? 'smoke-auth.cjs' : process.argv[2] === 'interview' ? 'smoke-interview.cjs' : 'smoke-local.cjs';
const child = spawn(electron, [path.join(root, 'scripts', target)], { cwd: root, env, stdio: 'inherit', windowsHide: true });
child.on('error', (error) => { console.error(error); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
