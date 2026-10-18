// Serialized into a sandboxed recruitment page. Reads visible job UI only;
// never reads cookies, local storage, password fields or account form values.
export function recruitmentPageProbe(config, action = 'inspect', expected = {}) {
  const visible = element => { if (!element || element.hidden) return false;const box = element.getBoundingClientRect(), style = window.getComputedStyle(element);return box.width > 2 && box.height > 2 && style.display !== 'none' && style.visibility !== 'hidden'; };
  const content = element => (element?.innerText || element?.textContent || '').replace(/\s+/g, ' ').trim();
  const clean = value => String(value || '').toLowerCase().replace(/[\s·\-_/（）()]/g, '');
  const pick = (root, selector) => [...root.querySelectorAll(selector)].find(visible);
  const body = (document.body?.innerText || '').slice(0, 100000);
  const dialogs = [...document.querySelectorAll('[role=dialog],.dialog,.modal,.dialog-wrap,[class*=login-dialog]')].filter(visible);
  const captcha = [...document.querySelectorAll('iframe[src*=captcha],[class*=captcha],[id*=captcha],[class*=geetest]')].some(visible) || /请完成(?:安全)?验证|拖动滑块|访问过于频繁|操作过于频繁|访问异常|账号异常/.test(body);
  if (captcha) return { blocked: true, reason: '网站要求安全验证或限制操作，请在浏览器手动处理后重新核对队列。' };
  if (/\/(?:login|signin|passport)(?:\/|\.|$)/i.test(window.location.pathname) || dialogs.some(dialog => /验证码登录|扫码登录|手机号登录|登录后(?:投递|沟通)|请先登录/.test(content(dialog)))) return { blocked: true, reason: '请先在招聘浏览器完成登录。' };
  if (action === 'collect') {
    const cards = [...document.querySelectorAll(config.cards)].filter(visible), records = [], seen = new Set();
    const nodes = cards.length ? cards : [...document.querySelectorAll('a[href]')].filter(element => { try { const url = new URL(element.href);return config.detail.includes('.') ? url.hostname === config.detail : url.pathname.includes(config.detail); } catch { return false; } }).map(link => link.closest('article,li,[class*=card],[class*=item]') || link.parentElement);
    for (const card of nodes.slice(0, 150)) {
      const links = [...card.querySelectorAll('a[href]')];if (card.matches('a[href]')) links.unshift(card);
      const link = links.find(element => { try { const url = new URL(element.href);return url.protocol === 'https:' && (url.hostname === config.host || url.hostname.endsWith('.' + config.host)) && (config.detail.includes('.') ? url.hostname === config.detail : url.pathname.includes(config.detail)); } catch { return false; } });
      if (!link || seen.has(link.href)) continue;seen.add(link.href);
      const all = content(card).slice(0, 4000), title = content(pick(card, config.title)) || content(link);
      if (!title || title.length > 200) continue;
      records.push({ platform: config.id, url: link.href, title, company: content(pick(card, config.company)), location: content(pick(card, config.location)), salary: content(pick(card, config.salary)) || /(?:\d+(?:\.\d+)?\s*(?:[kK千万])?\s*[-~至]\s*\d+(?:\.\d+)?\s*(?:[kK千万])|\d+\s*元\/天|薪资面议)/.exec(all)?.[0] || '', experience: /\d+\s*[-~至]\s*\d+\s*年|\d+\s*年以上|经验不限|应届生/.exec(all)?.[0] || '', jobType: /实习/.test(all) ? '实习' : /兼职/.test(all) ? '兼职' : /全职/.test(all) ? '全职' : '', description: '' });
      if (records.length >= 60) break;
    }
    return { jobs: records, pageTitle: document.title.slice(0, 200), note: records.length ? '' : '当前页面未识别到职位卡片。请切到搜索结果页，或手动添加职位链接。' };
  }
  const allButtons = [...document.querySelectorAll('button,a[class*=btn],a[class*=button],a[class*=apply],a[class*=deliver],a[class*=communic],[role=button],input[type=submit]')].filter(visible);
  const buttons = allButtons.filter(element => !element.disabled && element.getAttribute('aria-disabled') !== 'true');
  const label = element => content(element) || element.getAttribute('value') || '';
  const primaryTitle = content(pick(document, '.job-banner h1,.job-detail-header h1,.job-header h1,h1'));
  const primaryCompany = content(pick(document, config.detailCompany || '.company-name,h2'));
  const identityMatches = !!expected.title && !!expected.company && clean(primaryTitle).includes(clean(expected.title)) && clean(primaryCompany).includes(clean(expected.company));
  // A JD, recommendation card or an old toast must never count as a receipt.
  const receipts = () => [...document.querySelectorAll('[role=alert],[role=status],.ant-message-notice,.el-message,.toast,.message-success,.success-message')].filter(visible).map(content).filter(value => value.length < 180 && /简历投递成功|投递成功|申请成功|已成功投递|您已申请该职位/.test(value));
  const area = document.querySelector('[data-zhiyue-action-area]');
  const terminal = allButtons.filter(button => area?.contains(button));
  if (action === 'outcome') {
    const prior = document.documentElement.getAttribute('data-zhiyue-prior-receipts');
    const receipt = prior === null ? null : receipts().find(value => !JSON.parse(prior).includes(value));
    if (receipt || terminal.some(button => /^(?:已投递|已申请)$/.test(label(button)))) return { outcome: 'applied', evidence: receipt || '刚操作的职位入口已变为已投递 / 已申请' };
    if (config.greeting && terminal.some(button => /^(?:继续沟通|已沟通)$/.test(label(button)))) return { outcome: 'contacted', evidence: '官网职位入口已变为继续沟通；不代表附件简历已发送' };
  }
  const description = content(pick(document, config.description)).slice(0, 20000);
  if (action === 'outcome') {
    const confirmDialog = dialogs.find(dialog => /简历|投递|申请职位/.test(content(dialog)));
    if (confirmDialog) {
      if (/完善简历|上传简历|选择简历|请选择|补充信息|开通|支付|购买/.test(content(confirmDialog)) || confirmDialog.querySelectorAll('input[type=radio],input[type=checkbox],textarea,input[type=text]').length > 1) return { blocked: true, reason: '网站需要选择简历、补充信息或其他人工确认，已暂停。' };
      if (action === 'outcome' && expected.confirm === true) {
        const confirm = [...confirmDialog.querySelectorAll('button,a,[role=button]')].find(button => visible(button) && /^(?:确认投递|确认申请|确认发送简历)$/.test(label(button)));
        if (confirm) { confirm.click();return { clicked: true, kind: 'confirmation', evidence: '已点击明确的简历提交确认，等待网站回执' }; }
      }
    }
    return { waiting: true };
  }
  if (action === 'inspect') return { description, pageTitle: document.title.slice(0, 200), identityMatches, needsLogin: !!pick(document, '[class*=login-panel],[class*=login-box]') };
  if (action !== 'apply') return { blocked: true, reason: '无效的页面操作。' };
  if (expected.url) {
    const targetUrl = new URL(expected.url), currentUrl = new URL(window.location.href);
    if (targetUrl.origin !== currentUrl.origin || targetUrl.pathname !== currentUrl.pathname || targetUrl.pathname === '/' && targetUrl.search !== currentUrl.search) return { blocked: true, reason: '网页已离开本批确认的职位链接，已暂停。' };
  }
  if (!identityMatches) return { blocked: true, reason: '页面主职位或公司与待投队列不一致，已暂停以免误投。' };
  if (dialogs.length) return { blocked: true, reason: '页面存在待处理弹窗，请先在浏览器处理。' };
  if (/职位已下线|职位已关闭|停止招聘|职位不存在/.test(body)) return { blocked: true, reason: '职位已下线或停止招聘。' };
  const apply = buttons.filter(button => /^(?:投递简历|立即投递|申请职位|立即申请|投个简历)$/.test(label(button)));
  const greeting = buttons.filter(button => /^立即沟通$/.test(label(button)));
  const candidates = apply.length ? apply : config.greeting && expected.allowGreeting === true ? greeting : [];
  if (candidates.length !== 1) return { blocked: true, reason: candidates.length ? '页面有多个提交入口，无法确定目标，请手动核对。' : config.greeting && greeting.length ? '此职位通过发送站内招呼开始沟通，请先在求职偏好中明确允许。' : '未找到确定的投递按钮，请在招聘浏览器手动处理。' };
  const target = candidates[0], parent = target.parentElement;
  if (expected.expiresAt && Date.now() >= expected.expiresAt) return { blocked: true, reason: '网页操作已过期，未点击提交。' };
  (parent && content(parent).length < 800 && parent.querySelectorAll('button,a').length < 12 ? parent : target).setAttribute('data-zhiyue-action-area', 'true');
  document.documentElement.setAttribute('data-zhiyue-prior-receipts', JSON.stringify(receipts()));
  target.click();return { clicked: true, kind: apply.length ? 'application' : 'greeting', evidence: '已点击官网入口，等待回执；尚未确认成功' };
}
