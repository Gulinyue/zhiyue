import { RECRUITMENT_SITES } from './recruitment-sites.mjs';
export function parseJobCsv(input) {
  if (typeof input !== 'string' || input.length > 500000) throw new Error('CSV 内容过大，一次最多导入 200 个职位。');
  const rows = [];let row = [], field = '', quoted = false;
  const source = input.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  for (let i = 0; i <= source.length; i++) {
    const char = source[i];
    if (char === '"') { if (quoted && source[i + 1] === '"') { field += '"';i++; } else if (!field || quoted) quoted = !quoted;else field += char; }
    else if (!quoted && (char === ',' || char === '\n' || char === undefined)) { row.push(field.trim());field = '';if (char !== ',') { if (row.some(Boolean)) rows.push(row);row = []; } }
    else if (char !== undefined) field += char;
  }
  if (quoted) throw new Error('CSV 引号未闭合，请检查文件。');
  if (rows.length < 2 || rows.length > 201) throw new Error('请提供表头及 1–200 条职位。');
  const aliases = { platform: ['平台', 'platform'], title: ['职位', '职位名称', 'title'], company: ['公司', '公司名称', 'company'], url: ['链接', '职位链接', 'url'], location: ['地点', '工作地点', 'location'], salary: ['薪资', 'salary'], description: ['职位描述', 'description'], experience: ['经验', 'experience'], jobType: ['用工类型', 'jobtype'] };
  const headers = rows[0].map(value => value.toLowerCase());const indexes = Object.fromEntries(Object.entries(aliases).map(([key, values]) => [key, headers.findIndex(value => values.includes(value))]));
  if (indexes.platform < 0 || indexes.title < 0 || indexes.company < 0 || indexes.url < 0) throw new Error('CSV 至少需要：平台、职位、公司、链接。');
  return rows.slice(1).map((cells, index) => { const value = Object.fromEntries(Object.entries(indexes).map(([key, position]) => [key, position >= 0 ? cells[position] || '' : '']));const site = RECRUITMENT_SITES.find(site => [site.id.toLowerCase(), site.name.toLowerCase()].includes(value.platform.toLowerCase()));if (!site) throw new Error(`第 ${index + 2} 行招聘平台不受支持。`);return { ...value, platform: site.id, status: 'saved' }; });
}
export function jobCsv(jobs) {
  const keys = [['platform', '平台'], ['title', '职位'], ['company', '公司'], ['url', '链接'], ['location', '地点'], ['salary', '薪资'], ['status', '状态'], ['lastResult', '结果'], ['notes', '备注']];
  const escape = value => { const source = String(value ?? '');return '"' + (/^[=+\-@\t\r]/.test(source) ? "'" + source : source).replaceAll('"', '""') + '"'; };
  return '\uFEFF' + [keys.map(([, label]) => escape(label)).join(','), ...jobs.map(job => keys.map(([key]) => escape(job[key])).join(','))].join('\r\n');
}
