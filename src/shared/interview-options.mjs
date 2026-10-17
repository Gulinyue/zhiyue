// 知跃 · Developed by gulinyue.
export const DEFAULT_INTERVIEW_OPTIONS = Object.freeze({ opacity: .52, showShortcutHints: true, silenceMs: 1100, threshold: .008, autoAnswer: true, answerLanguage: '中文', prompt: '', useKnowledge: true });
export function normalizeInterviewOptions(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const clamp = (key, min, max) => typeof value[key] === 'number' && Number.isFinite(value[key]) ? Math.max(min, Math.min(max, value[key])) : DEFAULT_INTERVIEW_OPTIONS[key];
  return { opacity: clamp('opacity', .15, .85), showShortcutHints: value.showShortcutHints !== false, silenceMs: Math.round(clamp('silenceMs', 500, 2500)), threshold: clamp('threshold', .002, .05), autoAnswer: value.autoAnswer !== false, useKnowledge: value.useKnowledge !== false, answerLanguage: typeof value.answerLanguage === 'string' ? value.answerLanguage.replace(/[\u0000-\u001f]/g, '').slice(0, 40) || '中文' : '中文', prompt: typeof value.prompt === 'string' ? value.prompt.replaceAll('\0', '').slice(0, 4000) : '' };
}
