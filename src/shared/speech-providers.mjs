// 知跃 · Developed by gulinyue. Presets are suggestions; availability is checked by the user's service.
export const SPEECH_PROVIDERS = [
  { id: 'dashscope', label: '千问百炼 · 中国内地（北京）', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', protocol: 'qwen-asr', models: [['qwen3-asr-flash', 'Qwen3 ASR Flash']], help: '使用百炼北京地域的 API Key。可直接使用默认地址，或填写控制台提供的业务空间专属 compatible-mode/v1 地址；地域与 Key 须一致。热词作为识别上下文发送，中英混合建议选择自动识别。' },
  { id: 'dashscope-intl', label: '千问百炼 · 新加坡', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', protocol: 'qwen-asr', models: [['qwen3-asr-flash', 'Qwen3 ASR Flash']], help: '使用百炼新加坡地域的 API Key，与北京地域不通用。支持控制台提供的业务空间专属 compatible-mode/v1 地址。热词作为识别上下文发送，中英混合建议选择自动识别。' },
  { id: 'zhipu', label: '智谱 BigModel · GLM 语音', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', protocol: 'glm-asr', models: [['glm-asr-2512', 'GLM ASR 2512']], supportsLanguage: false, help: '使用智谱标准 API 的 Key，需开通语音模型权限；不使用 Coding Plan 专用接口。该接口自动识别语言，转写提示作为上下文发送；每片音频不超过 21 秒。' },
  { id: 'openai', label: 'OpenAI · 语音识别', baseUrl: 'https://api.openai.com/v1', models: [['gpt-4o-mini-transcribe', 'GPT-4o Mini Transcribe'], ['gpt-4o-transcribe', 'GPT-4o Transcribe'], ['gpt-transcribe', 'GPT Transcribe'], ['whisper-1', 'Whisper-1']], help: '使用 OpenAI 平台 API Key；ChatGPT 套餐授权不包含此语音接口。' },
  { id: 'groq', label: 'Groq · Whisper', baseUrl: 'https://api.groq.com/openai/v1', models: [['whisper-large-v3-turbo', 'Whisper Large v3 Turbo'], ['whisper-large-v3', 'Whisper Large v3']], help: '使用 Groq API Key。可先选 Turbo，再测试当前账号是否可用。' },
  { id: 'siliconflow', label: '硅基流动 · 中文语音', baseUrl: 'https://api.siliconflow.cn/v1', models: [['FunAudioLLM/SenseVoiceSmall', 'SenseVoiceSmall'], ['TeleAI/TeleSpeechASR', 'TeleSpeechASR']], help: '使用硅基流动 API Key；该接口自动识别语言，暂不发送语言与热词参数。', minimalForm: true },
  { id: 'together', label: 'Together AI · 语音识别', baseUrl: 'https://api.together.ai/v1', models: [['openai/whisper-large-v3', 'Whisper Large v3'], ['nvidia/parakeet-tdt-0.6b-v3', 'Parakeet TDT v3']], help: '使用 Together AI API Key；请按服务商支持范围选择识别语言。' },
  { id: 'local', label: '本机 · Whisper 兼容服务', baseUrl: 'http://127.0.0.1:8000/v1', models: [], help: '先启动本机语音服务，再获取其模型列表；无认证的本机接口可留空 Key。' },
  { id: 'custom', label: '自定义 · 兼容语音接口', baseUrl: '', models: [], help: '填写兼容 OpenAI 音频转写接口的地址与模型 ID；可直接粘贴完整 /audio/transcriptions 地址。' },
];
export const speechProvider = (id) => SPEECH_PROVIDERS.find((item) => item.id === id);
export function inferSpeechProvider(baseUrl) {
  try {
    const url = new URL(baseUrl);
    if (url.pathname.replace(/\/$/, '') === '/compatible-mode/v1') {
      if (/^[a-z0-9-]+\.cn-beijing\.maas\.aliyuncs\.com$/i.test(url.hostname)) return 'dashscope';
      if (/^[a-z0-9-]+\.ap-southeast-1\.maas\.aliyuncs\.com$/i.test(url.hostname)) return 'dashscope-intl';
    }
  } catch {}
  return SPEECH_PROVIDERS.find((item) => item.baseUrl && item.baseUrl === baseUrl)?.id || (/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/)/i.test(baseUrl) ? 'local' : 'custom');
}
export function speechModelChoices(providerId) { return (speechProvider(providerId)?.models || []).map(([id, name]) => ({ id, name })); }
export function isSpeechModel(value, providerId) {
  if (speechProvider(providerId)?.protocol === 'qwen-asr') return /^qwen3-asr-flash(?:$|-)/i.test(value) && !/filetrans|realtime|streaming/i.test(value);
  if (providerId === 'zhipu') return /^glm-asr(?:$|-)/i.test(value);
  return /transcrib|whisper|sensevoice|telespeech|voxtral|parakeet|(?:^|[-/_])asr(?:[-/_.]|$)/i.test(value);
}
