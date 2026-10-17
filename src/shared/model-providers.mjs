// Model IDs are intentionally discovered from the user's account, never guessed.
export const MODEL_PROTOCOLS = {
  'chat-completions': 'OpenAI Chat Completions',
  responses: 'OpenAI Responses',
  anthropic: 'Anthropic Messages',
  gemini: 'Google Gemini',
};
export const MODEL_PROVIDERS = [
  ['custom', '自定义 / 兼容接口', 'https://api.openai.com/v1', 'chat-completions'],
  ['openai', 'OpenAI API', 'https://api.openai.com/v1', 'responses'],
  ['chatgpt', 'ChatGPT 账号授权', 'https://api.openai.com/v1', 'responses'],
  ['anthropic', 'Anthropic · Claude', 'https://api.anthropic.com/v1', 'anthropic'],
  ['google', 'Google · Gemini', 'https://generativelanguage.googleapis.com/v1beta', 'gemini'],
  ['azure', 'Azure OpenAI', 'https://YOUR-RESOURCE.openai.azure.com/openai/v1', 'responses'],
  ['xai', 'xAI · Grok', 'https://api.x.ai/v1', 'responses'],
  ['deepseek', 'DeepSeek', 'https://api.deepseek.com/v1', 'chat-completions'],
  ['mistral', 'Mistral', 'https://api.mistral.ai/v1', 'chat-completions'],
  ['groq', 'Groq', 'https://api.groq.com/openai/v1', 'chat-completions'],
  ['openrouter', 'OpenRouter', 'https://openrouter.ai/api/v1', 'chat-completions'],
  ['qwen-intl', '阿里云 · 通义千问（国际）', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', 'chat-completions'],
  ['qwen-cn', '阿里云 · 通义千问（中国）', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'chat-completions'],
  ['siliconflow', '硅基流动', 'https://api.siliconflow.cn/v1', 'chat-completions'],
  ['moonshot', 'Moonshot · Kimi', 'https://api.moonshot.ai/v1', 'chat-completions'],
  ['zai', 'Z.ai · GLM', 'https://api.z.ai/api/paas/v4', 'chat-completions'],
  ['together', 'Together AI', 'https://api.together.ai/v1', 'chat-completions'],
  ['fireworks', 'Fireworks AI', 'https://api.fireworks.ai/inference/v1', 'chat-completions'],
  ['perplexity', 'Perplexity · Orchestrator', 'https://api.perplexity.ai/router/v1', 'chat-completions'],
  ['ollama', 'Ollama · 本机', 'http://127.0.0.1:11434/v1', 'chat-completions'],
  ['lmstudio', 'LM Studio · 本机', 'http://127.0.0.1:1234/v1', 'chat-completions'],
].map(([id, label, baseUrl, apiMode]) => ({ id, label, baseUrl, apiMode }));
export function modelProvider(id) { return MODEL_PROVIDERS.find((item) => item.id === id); }
