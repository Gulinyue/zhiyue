// Text extraction is isolated from the interview/UI process and terminated on timeout.
import { parentPort, workerData } from 'node:worker_threads';
try {
  const bytes = new Uint8Array(workerData.bytes);let text = '';
  if (workerData.extension === '.pdf') {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({ data: bytes, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, useWorkerFetch: false, verbosity: 0 });
    const document = await task.promise;
    try {
      if (document.numPages > 30) throw new Error('简历 PDF 最多支持 30 页，请先拆分。');
      for (let page = 1; page <= document.numPages && text.length <= 60000; page++) {
        const content = await (await document.getPage(page)).getTextContent();
        text += content.items.filter(item => typeof item.str === 'string').map(item => item.str + (item.hasEOL ? '\n' : ' ')).join('') + '\n\n';
      }
      text = text.normalize('NFKC').replace(/([\p{Script=Han}]) +(?=[\p{Script=Han}])/gu, '$1');
    } finally { await task.destroy(); }
  } else if (workerData.extension === '.docx') {
    const mammoth = (await import('mammoth')).default;
    text = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
  } else {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  }
  text = text.replaceAll('\0', '').trim();
  if (!text) throw new Error('没有提取到文字。扫描件或图片型 PDF 请先转成文字，或手动粘贴简历。');
  if (text.length > 60000) throw new Error('简历文字超过 6 万字，请精简后再导入。');
  parentPort.postMessage({ text });
} catch (error) {
  const friendly = typeof error.message === 'string' && /^(?:简历|没有提取到文字)/.test(error.message) ? error.message : '简历解析失败。请使用未加密的 PDF、DOCX 或 UTF-8 文本，也可直接粘贴内容。';
  parentPort.postMessage({ error: friendly });
}
