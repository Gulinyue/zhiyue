// 知跃 · Developed by gulinyue. Presets are suggestions; availability is checked by the user's service.
export const SPEECH_PROVIDERS = [
  { id: 'openai', label: 'OpenAI · 语音识别', baseUrl: 'https://api.openai.com/v1', models: [['gpt-4o-mini-transcribe', 'GPT-4o Mini Transcribe'], ['gpt-4o-transcribe', 'GPT-4o Transcribe'], ['gpt-transcribe', 'GPT Transcribe'], ['whisper-1', 'Whisper-1']], help: '使用 OpenAI 平台 API Key；ChatGPT 套餐授权不包含此语音接口。' },
  { id: 'groq', label: 'Groq · Whisper', baseUrl: 'https://api.groq.com/openai/v1', models: [['whisper-large-v3-turbo', 'Whisper Large v3 Turbo'], ['whisper-large-v3', 'Whisper Large v3']], help: '使用 Groq API Key。可先选 Turbo，再测试当前账号是否可用。' },
  { id: 'siliconflow', label: '硅基流动 · 中文语音', baseUrl: 'https://api.siliconflow.cn/v1', models: [['FunAudioLLM/SenseVoiceSmall', 'SenseVoiceSmall'], ['TeleAI/TeleSpeechASR', 'TeleSpeechASR']], help: '使用硅基流动 API Key；该接口自动识别语言，暂不发送语言与热词参数。', minimalForm: true },
  { id: 'together', label: 'Together AI · 语音识别', baseUrl: 'https://api.together.ai/v1', models: [['openai/whisper-large-v3', 'Whisper Large v3'], ['nvidia/parakeet-tdt-0.6b-v3', 'Parakeet TDT v3']], help: '使用 Together AI API Key；请按服务商支持范围选择识别语言。' },
  { id: 'local', label: '本机 · Whisper 兼容服务', baseUrl: 'http://127.0.0.1:8000/v1', models: [], help: '先启动本机语音服务，再获取其模型列表；无认证的本机接口可留空 Key。' },
  { id: 'custom', label: '自定义 · 兼容语音接口', baseUrl: '', models: [], help: '填写兼容 OpenAI 音频转写接口的地址与模型 ID；可直接粘贴完整 /audio/transcriptions 地址。' },
];
export const speechProvider = (id) => SPEECH_PROVIDERS.find((item) => item.id === id);
export function inferSpeechProvider(baseUrl) {
  return SPEECH_PROVIDERS.find((item) => item.baseUrl && item.baseUrl === baseUrl)?.id || (/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/)/i.test(baseUrl) ? 'local' : 'custom');
}
export function speechModelChoices(providerId) { return (speechProvider(providerId)?.models || []).map(([id, name]) => ({ id, name })); }
export function isSpeechModel(value) { return /transcrib|whisper|sensevoice|telespeech|voxtral|parakeet|(?:^|[-/_])asr(?:[-/_.]|$)/i.test(value); }
