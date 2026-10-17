import { spawn } from 'node:child_process';
import path from 'node:path';
import electron from 'electron';

const root = path.resolve(import.meta.dirname, '..');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
// Keep development settings/credentials separate from any installed original app.
env.CLIMB_USER_DATA_DIR ??= path.join(root, '.runtime', 'local-dev');
const child = spawn(electron, [root], { cwd: root, env, stdio: 'inherit', windowsHide: true });
child.on('error', (error) => { console.error(error); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
