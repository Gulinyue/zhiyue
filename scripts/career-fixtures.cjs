// Synthetic pages only. These fixtures do not establish live-site compatibility.
const names = {
  boss: ['job-card-wrapper', 'job-name', 'company-name', 'salary', 'job-area', 'job-sec-text'],
  zhaopin: ['joblist-box__item', 'jobinfo__name', 'companyinfo__name', 'jobinfo__salary', 'jobinfo__area', 'describtion__detail-content'],
  job51: ['joblist-item', 'jname', 'cname', 'sal', 'area', 'job_msg'],
  liepin: ['job-card-pc-container', 'job-title', 'company-name', 'job-salary', 'area', 'job-description'],
  lagou: ['list_item', 'position-name', 'company-name', 'money', 'add', 'job-detail'],
  shixiseng: ['intern-wrap', 'intern-name', 'company-name', 'day', 'city', 'job_detail'],
};
function detailUrl(site, mode = 'success') { const host = site.detail.includes('.') ? site.detail : 'www.' + site.host;return `https://${host}${site.detail.includes('.') ? '/' : site.detail}${mode}.html?fixture=${mode}`; }
function page(site, rawUrl) {
  const url = new URL(rawUrl), mode = url.searchParams.get('fixture') || 'success', [card, title, company, salary, city, description] = names[site.id];
  const detail = url.hostname === site.detail || url.pathname.includes(site.detail);
  const start = site.greeting ? '立即沟通' : site.id === 'lagou' ? '投个简历' : site.id === 'job51' ? '申请职位' : '投递简历';
  const success = site.greeting ? "this.textContent='继续沟通'" : "this.disabled=true;this.textContent='已投递';document.querySelector('#receipt').textContent='简历投递成功'";
  const onclick = ['no-receipt', 'old-toast'].includes(mode) ? "this.dataset.clicked='true'" : mode === 'confirmation' ? "document.querySelector('#confirmation').hidden=false" : success;
  return `<!doctype html><meta charset="utf-8"><title>模拟招聘页面 · ${site.name}</title><style>body{font:16px sans-serif;padding:30px}article{padding:20px;border:1px solid #ccc}button{padding:12px}p{max-width:600px}[hidden]{display:none!important}</style>
    ${detail ? `<h1>${mode === 'wrong-job' ? '销售经理' : 'Java后端开发'}</h1><h2>示例测试公司</h2><p>北京 15-25K 全职</p><div class="${description}">负责 Redis 订单服务。术语举例：投递成功。这段职位正文不是实际回执。</div>
      ${mode === 'captcha' ? '<div class="captcha">请完成安全验证</div>' : ''}${mode === 'login' ? '<div role="dialog">请先登录，扫码登录</div>' : ''}
      <div class="job-actions"><button onclick="${onclick}">${start}</button>${mode === 'ambiguous' ? `<button>${start}</button>` : ''}</div>
      ${mode === 'wrong-job' ? '<aside class="recommendation">推荐职位：Java后端开发 示例测试公司</aside>' : ''}
      <div id="receipt" role="status">${mode === 'old-toast' ? '简历投递成功' : ''}</div><div id="confirmation" role="dialog" hidden><p>确认投递此职位的默认简历</p><button onclick="this.parentElement.hidden=true;document.querySelector('#receipt').textContent='简历投递成功'">确认投递</button></div>`
    : `<article class="${card}"><a class="${title}" href="${detailUrl(site)}">Java后端开发</a><p class="${company}">示例测试公司</p><p class="${salary}">15-25K</p><p class="${city}">北京</p><p>全职 Redis</p></article>`}`;
}
module.exports = { page, detailUrl };
