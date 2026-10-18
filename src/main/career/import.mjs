import { Worker } from 'node:worker_threads';
import fs from 'node:fs/promises';
import path from 'node:path';
export async function extractResumeFile(file, workerPath) {
  const extension = path.extname(file).toLowerCase();if (!['.pdf', '.docx', '.txt', '.md'].includes(extension)) throw new Error('请选择 PDF、DOCX、TXT 或 Markdown 简历。');
  const stat = await fs.stat(file);if (!stat.isFile() || stat.size > 10 * 1024 * 1024) throw new Error('简历文件最大 10 MiB。');
  const bytes = await fs.readFile(file);
  if (extension === '.pdf' && !bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error('文件内容不是有效的 PDF。');
  if (extension === '.docx' && bytes.subarray(0, 2).toString() !== 'PK') throw new Error('文件内容不是有效的 DOCX。');
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, { workerData: { extension, bytes }, resourceLimits: { maxOldGenerationSizeMb: 192, stackSizeMb: 4 } });let settled = false;
    const finish = (error, result) => { if (settled) return;settled = true;clearTimeout(timer);void worker.terminate();if (error) reject(error);else resolve({ text: result, name: path.basename(file) }); };
    const timer = setTimeout(() => finish(new Error('简历解析超时，请精简文件或直接粘贴文字。')), 15000);
    worker.once('message', value => value.error ? finish(new Error(value.error)) : finish(null, value.text));
    worker.once('error', () => finish(new Error('简历解析未完成，请尝试粘贴文字。')));
    worker.once('exit', code => { if (!settled) finish(new Error('简历解析已结束，请尝试其他文件。')); });
  });
}
