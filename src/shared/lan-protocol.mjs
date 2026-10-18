// 知跃 · Developed by gulinyue. Only visible text crosses the LAN boundary.
export const LAN_COMMANDS = Object.freeze(['capture', 'desktop-scroll-up', 'desktop-scroll-down', 'desktop-show', 'desktop-hide', 'exit-mode']);
export function normalizeLanSnapshot(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('无效的同步内容。');
  const text = (value, max) => typeof value === 'string' ? value.replaceAll('\0', '').slice(0, max) : '';
  let budget = 240000;
  const messages = (Array.isArray(raw.messages) ? raw.messages : []).slice(-6).filter(value => value && ['user', 'assistant'].includes(value.role)).reverse().map((value, index) => {
    const content = text(value.text, Math.min(120000, budget)); budget -= content.length;
    return { id: text(value.id, 80) || String(index), role: value.role, text: content, status: ['failed', 'cancelled'].includes(value.status) ? value.status : 'completed' };
  }).reverse();
  return { conversationId: text(raw.conversationId, 80), title: text(raw.title, 80), mode: ['chat', 'written', 'interview', 'practice'].includes(raw.mode) ? raw.mode : 'chat', busy: raw.busy === true, capturing: raw.capturing === true, error: text(raw.error, 240), messages };
}
export function isPrivateIpv4(value) {
  const parts = typeof value === 'string' && /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value) ? value.split('.').map(Number) : [];
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || parts[0] === 192 && parts[1] === 168 || parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
}
