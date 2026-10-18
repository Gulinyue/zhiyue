// Public website navigation only. No private recruitment APIs or credential access.
export const RECRUITMENT_SITES = Object.freeze([
  { id: 'boss', name: 'BOSS直聘', host: 'zhipin.com', home: 'https://www.zhipin.com/', search: 'https://www.zhipin.com/web/geek/jobs', query: 'query', detail: '/job_detail/', action: '沟通 / 申请发送简历', greeting: true },
  { id: 'zhaopin', name: '智联招聘', host: 'zhaopin.com', home: 'https://www.zhaopin.com/', search: 'https://www.zhaopin.com/sou/', query: 'kw', detail: 'jobs.zhaopin.com', action: '投递简历' },
  { id: 'job51', name: '前程无忧', host: '51job.com', home: 'https://www.51job.com/', search: 'https://we.51job.com/pc/search', query: 'keyword', detail: 'jobs.51job.com', action: '申请职位' },
  { id: 'liepin', name: '猎聘', host: 'liepin.com', home: 'https://www.liepin.com/', search: 'https://www.liepin.com/zhaopin/', query: 'key', detail: '/job/', action: '投递简历' },
  { id: 'lagou', name: '拉勾招聘', host: 'lagou.com', home: 'https://www.lagou.com/', search: 'https://www.lagou.com/wn/jobs', query: 'kd', detail: '/jobs/', action: '投个简历' },
  { id: 'shixiseng', name: '实习僧', host: 'shixiseng.com', home: 'https://www.shixiseng.com/', search: 'https://www.shixiseng.com/interns', query: 'keyword', detail: '/intern/', action: '投递简历' },
]);
export const recruitmentSite = id => RECRUITMENT_SITES.find(site => site.id === id);
export function recruitmentUrl(raw, platform, { detail = false } = {}) {
  const site = recruitmentSite(platform);if (!site) throw new Error('不支持此招聘平台。');
  let url;try { url = new URL(raw); } catch { throw new Error('请填写完整的 HTTPS 职位链接。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' || !(url.hostname === site.host || url.hostname.endsWith('.' + site.host))) throw new Error('职位链接必须属于所选招聘网站，且使用 HTTPS。');
  if (detail && !(site.detail.includes('.') ? url.hostname === site.detail : url.pathname.includes(site.detail))) throw new Error('请使用职位详情页链接，搜索页不能直接投递。');
  url.hash = '';for (const key of ['ka', 'lid', 'securityId', 'sessionId', 'token', 'access_token', 'click_id', 'headckid', 'ckid']) url.searchParams.delete(key);
  return url.href;
}
export function jobSearchUrl(platform, keyword) { const site = recruitmentSite(platform);if (!site) throw new Error('不支持此招聘平台。');const url = new URL(site.search);url.searchParams.set(site.query, String(keyword || '').slice(0, 120));return url.href; }
export function recruitmentJobKey(raw, platform) {
  try { const url = new URL(recruitmentUrl(raw, platform, { detail: true }));return platform + ':' + url.hostname + url.pathname + (url.pathname === '/' ? url.search : ''); }
  catch { return platform + ':' + String(raw || ''); }
}
export function siteDomConfig(platform) {
  const site = recruitmentSite(platform);if (!site) throw new Error('不支持此招聘平台。');
  const configs = {
    boss: { cards: '.job-card-wrapper,.job-card-box', title: '.job-name', company: '.company-name,.boss-name', salary: '.salary', location: '.job-area,.job-area-wrapper', description: '.job-sec-text,.job-detail' },
    zhaopin: { cards: '.joblist-box__item,.joblist-box__iteminfo,.joblist-item', title: '.jobinfo__name,.job-name', company: '.companyinfo__name,.company-name', salary: '.jobinfo__salary,.salary', location: '.jobinfo__area,.job-area', description: '.describtion__detail-content,.job-detail,.job-detail-content' },
    job51: { cards: '.joblist-item,.j_joblist .e', title: '.jname,.jobname,.job-name', company: '.cname,.company-name', salary: '.sal,.salary', location: '.area,.jobarea', description: '.job_msg,.job-detail,.bmsg.job_msg' },
    liepin: { cards: '.job-card-pc-container,.job-info', title: '.job-title,.job-name', company: '.company-name', salary: '.job-salary,.salary', location: '.area,.job-dq-box', description: '.job-intro-container,.job-description,.content-word' },
    lagou: { cards: '.list_item,[class*=item__]', title: '.position_link h3,.position-name,[class*=p-top__] a', company: '.company_name,.company-name,[class*=company-name]', salary: '.money,.salary,[class*=money__]', location: '.add,.job-address,[class*=add__]', description: '.job-detail,.job_bt,.job-description' },
    shixiseng: { cards: '.intern-wrap,.intern-item', title: '.f-l.intern-name,.intern-name,.job-name', company: '.company-name,.company-info', salary: '.day,.salary,.intern-salary', location: '.city,.intern-area', description: '.job_detail,.job-desc,.job-detail' },
  };
  const companySelectors = {
    boss: '.sider-company .company-info a,.sider-company .company-name,.job-company .company-name,h2',
    zhaopin: '.company .company__title,.company-name,.company-name a,h2',
    job51: '.cname a,.company-name,h2',
    liepin: '.company-name,.company-name-link,h2',
    lagou: '.job_company .company,.job_company .fl,.company-name,h2',
    shixiseng: '.com-name,.company-name,h2',
  };
  return { ...site, ...configs[platform], detailCompany: companySelectors[platform] };
}
