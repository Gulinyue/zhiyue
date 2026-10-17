import fs from 'node:fs/promises';

export function validateServiceUrl(value, name) {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))) {
    throw new Error(`${name} 必须是 HTTPS 地址（本地开发可使用 HTTP），且不能包含凭据、查询参数或锚点。`);
  }
  return url.href.replace(/\/$/, '');
}

export async function loadPublicConfig(root) {
  const values = {};
  try {
    const text = await fs.readFile(`${root}/.env`, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*(CLIMB_(?:BACKEND|WEB)_URL)\s*=\s*(.*?)\s*$/.exec(line);
      if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return {
    backendUrl: validateServiceUrl(process.env.CLIMB_BACKEND_URL || values.CLIMB_BACKEND_URL || 'https://workclimb.top', 'CLIMB_BACKEND_URL'),
    webUrl: validateServiceUrl(process.env.CLIMB_WEB_URL || values.CLIMB_WEB_URL || 'https://workclimb.top', 'CLIMB_WEB_URL'),
  };
}
