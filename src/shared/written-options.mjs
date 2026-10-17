// 知跃 / Zhiyue · Developed by gulinyue.
export const CODING_LANGUAGES = ['auto', 'Python', 'Java', 'C++', 'C', 'JavaScript', 'TypeScript', 'Go', 'Rust', 'C#', 'SQL'];
export const ANSWER_LANGUAGES = ['auto', '中文', 'English', '日本語', '한국어', 'Français', 'Deutsch', 'Español'];
export const DEFAULT_WRITTEN_OPTIONS = Object.freeze({ opacity: 0.52, showShortcutHints: true, codingLanguage: 'auto', answerLanguage: '中文', prompt: '', knowledgeMode: 'all', documentIds: [] });
export function normalizeWrittenOptions(raw) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    showShortcutHints: typeof value.showShortcutHints === 'boolean' ? value.showShortcutHints : DEFAULT_WRITTEN_OPTIONS.showShortcutHints,
    opacity: typeof value.opacity === 'number' && Number.isFinite(value.opacity) ? Math.round(Math.max(0.15, Math.min(0.85, value.opacity)) * 100) / 100 : DEFAULT_WRITTEN_OPTIONS.opacity,
    codingLanguage: CODING_LANGUAGES.includes(value.codingLanguage) ? value.codingLanguage : DEFAULT_WRITTEN_OPTIONS.codingLanguage,
    answerLanguage: ANSWER_LANGUAGES.includes(value.answerLanguage) ? value.answerLanguage : DEFAULT_WRITTEN_OPTIONS.answerLanguage,
    prompt: typeof value.prompt === 'string' ? value.prompt.replace(/\u0000/g, '').slice(0, 4000) : '',
    knowledgeMode: ['off', 'all', 'selected'].includes(value.knowledgeMode) ? value.knowledgeMode : DEFAULT_WRITTEN_OPTIONS.knowledgeMode,
    documentIds: Array.isArray(value.documentIds) ? [...new Set(value.documentIds.filter((id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(id)))].slice(0, 10) : [],
  };
}
