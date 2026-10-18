// 知跃 · Developed by gulinyue.
import { React } from '../vendor/react-icons-state.mjs';
const h = React.createElement, api = window.api;
export function LanSettings({ report, settings }) {
  const [state, setState] = React.useState({ enabled: false, addresses: [], pending: [], devices: [] });
  const [address, setAddress] = React.useState('');
  const [busy, setBusy] = React.useState(false), [now, setNow] = React.useState(Date.now());
  const apply = value => { setState(value);setAddress(old => value.addresses.some(item => item.address === old) ? old : value.addresses[0]?.address || ''); };
  React.useEffect(() => { let alive = true;const unsubscribe = api.lan.onStatus(value => { if (alive) apply(value); });api.lan.status().then(value => { if (alive) apply(value); }).catch(error => report(error.message));const timer = setInterval(() => setNow(Date.now()), 1000);return () => { alive = false;unsubscribe();clearInterval(timer); }; }, []);
  const run = async fn => { setBusy(true);try { apply(await fn()); } catch (error) { report(error.message); } finally { setBusy(false); } };
  const remaining = Math.max(0, Math.ceil((state.expiresAt - now) / 1000));
  return h('section', { className: 'panel lan-settings', 'data-lan-settings': true },
    h('div', { className: 'row between' }, h('div', null, h('h3', null, '双端互通 · 同一局域网'), h('p', { className: 'muted small' }, '手机扫码打开知跃网页，电脑确认配对后，即可遥控截图、同步看答案；电脑可让手机答案上下滚动。')), h('button', { type: 'button', className: state.enabled ? '' : 'primary', disabled: busy || !state.enabled && !address, 'data-lan-toggle': true, onClick: () => run(() => state.enabled ? api.lan.stop() : api.lan.start(address)) }, busy ? '切换中…' : state.enabled ? '关闭互通' : '开启局域网互通')),
    !state.enabled ? h('div', null, h('label', { className: 'field' }, h('span', null, '选择与手机同网的电脑地址'), h('select', { value: address, 'data-lan-address': true, onChange: e => setAddress(e.target.value) }, h('option', { value: '', disabled: true }, '选择局域网网卡'), ...state.addresses.map(item => h('option', { key: item.address, value: item.address }, `${item.name} · ${item.address}`)))), !state.addresses.length && h('p', { className: 'muted small' }, '未找到局域网地址。请连接 Wi-Fi 或有线网络后重新打开设置。')) : h(React.Fragment, null,
      h('div', { className: 'lan-pair-layout' }, h('div', { className: 'lan-qr' }, state.qr && h('img', { src: state.qr, alt: '手机扫描此二维码打开配对页面' }), h('span', null, '手机系统相机扫码，使用浏览器打开')), h('div', null,
        h('label', { className: 'field' }, h('span', null, '手机也可在浏览器手动输入此地址'), h('input', { readOnly: true, value: state.url, 'data-lan-url': true, onFocus: e => e.target.select() })),
        h('div', { className: 'lan-code' }, h('span', null, '配对码'), h('strong', { 'data-lan-code': true }, state.code), h('span', null, remaining ? `${remaining} 秒内有效` : '已过期，请刷新')),
        h('div', { className: 'row wrap' }, h('button', { type: 'button', disabled: busy, 'data-lan-refresh': true, onClick: () => run(() => api.lan.rotate()) }, '刷新配对码'), h('button', { type: 'button', onClick: async () => { try { await api.lan.copyLink();report('已复制配对链接，内含临时配对码。', true); } catch (error) { report(error.message); } } }, '复制配对链接')),
        h('p', { className: 'muted small' }, '手机填写设备名并申请配对，然后在电脑确认。只在可信私人网络启用；网页使用局域网 HTTP，网络内的设备可能监听传输。关闭互通或退出软件后须重新配对。'))),
      ...state.pending.map(item => h('div', { key: item.id, className: 'lan-device pending', 'data-lan-pending': item.id }, h('div', null, h('strong', null, `${item.name} 请求配对`), h('p', null, item.address)), h('div', { className: 'row' }, h('button', { type: 'button', disabled: busy, onClick: () => run(() => api.lan.approve(item.id, false)) }, '拒绝'), h('button', { type: 'button', className: 'primary', disabled: busy, 'data-lan-approve': true, onClick: () => run(() => api.lan.approve(item.id, true)) }, '允许配对')))),
      state.devices.length ? h('div', { className: 'lan-device-list' }, ...state.devices.map(item => h('div', { key: item.id, className: 'lan-device' }, h('div', null, h('strong', null, item.name), h('p', null, `${item.address} · ${item.connected ? '已连接' : '等待手机连接'}`)), h('button', { type: 'button', disabled: busy, onClick: () => run(() => api.lan.revoke(item.id)) }, '断开并撤销')))) : h('p', { className: 'muted small' }, '暂无已配对设备。'),
      h('div', { className: 'row wrap' }, h('button', { type: 'button', disabled: !state.devices.length || state.blocked, 'data-lan-scroll': 'up', onClick: () => api.lan.scroll('up') }, '手机答案 ↑'), h('button', { type: 'button', disabled: !state.devices.length || state.blocked, 'data-lan-scroll': 'down', onClick: () => api.lan.scroll('down') }, '手机答案 ↓'), h('span', { className: 'muted small' }, `${settings?.hotkeys?.['mobile:scrollUp'] || '未设置'} / ${settings?.hotkeys?.['mobile:scrollDown'] || '未设置'} 也可控制手机滚动`))),
    h('details', { className: 'lan-help' }, h('summary', null, '第一次连接 / 手机打不开页面？'), h('ol', null,
      h('li', null, '电脑和手机接同一路由器或手机热点，关闭会隔离设备的访客网络；有多张网卡时选择手机能访问的地址。'),
      h('li', null, '开启后若 Windows 询问网络权限，仅按需允许“专用网络”。软件不会自动修改防火墙。'),
      h('li', null, '手机相机扫码后，选浏览器打开；微信内打不开时改用 Safari 或 Chrome，或手动输入地址及配对码。'),
      h('li', null, '在电脑允许配对。手机点“截图并解题”会进入电脑笔试悬浮窗，退出可在手机点“退出当前模式”或用电脑退出键。'),
      h('li', null, '答案按生成进度同步，手机可手动滚动或跟随最新；页面后台挂起后回到前台会自动重连。锁屏或休眠时暂停互通。'))));
}
