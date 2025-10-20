import type { ExplainRequestPayload, ProfileTemplate, QuickExplainResponse } from './types.js';
import { DEFAULT_PROFILE_PREFERENCE } from './profile.js';

interface OpenAIQuickBody {
  model: string;
  input: string;
  temperature: number;
  max_output_tokens: number;
  text: {
    format: {
      name: 'plain_text' | 'json_schema';
      type: 'plain_text' | 'json_schema';
      strict?: boolean;
      schema?: {
        type: 'object';
        properties: {
          literal: { type: 'string' };
          context: { type: 'string' };
        };
        required: ['literal', 'context'];
        additionalProperties: false;
      };
    };
  };
}

export async function fetchQuickExplain(
  payload: ExplainRequestPayload,
  apiKey: string,
  baseUrl = 'https://api.openai.com/v1',
  profile?: ProfileTemplate
): Promise<QuickExplainResponse> {
  const prompt = buildQuickPrompt(payload, profile);
  const body: OpenAIQuickBody = {
    model: 'gpt-4o-mini',
    input: prompt,
    temperature: 0.3,
    max_output_tokens: 512,
    text: {
      format: {
        name: 'json_schema',
        type: 'json_schema',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            literal: { type: 'string' },
            context: { type: 'string' }
          },
          required: ['literal', 'context'],
          additionalProperties: false
        }
      }
    }
  };

  console.info('[LinguaLens][OpenAI] 准备请求快速解释', {
    请求地址: `${baseUrl.replace(/\/$/, '')}/responses`,
    请求模型: body.model,
    最大输出: body.max_output_tokens
  });
  console.info('[LinguaLens][OpenAI] 请求提示词预览', {
    前120字符: prompt.slice(0, 120),
    字符总数: prompt.length
  });

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  console.info('[LinguaLens][OpenAI] 快速解释响应状态', {
    状态码: response.status,
    状态文本: response.statusText
  });

  if (!response.ok) {
    const message = await response.text();
    console.error('[LinguaLens][OpenAI] 快速解释请求失败', {
      状态码: response.status,
      原始响应: message
    });
    throw new Error(`OpenAI request failed: ${message}`);
  }

  const data = await response.json();
  console.info('[LinguaLens][OpenAI] 快速解释原始响应', data);
  const refusalReason = detectRefusal(data);
  if (refusalReason) {
    throw new Error(`模型拒绝回答：${refusalReason}`);
  }
  const rawOutput = extractOutputText(data);
  console.info('[LinguaLens][OpenAI] 提取到的原始文本', rawOutput);
  const [literal, context] = parseQuickResponse(rawOutput);
  console.info('[LinguaLens][OpenAI] 解析后的结果', { literal, context });
  if (!literal && !context) {
    throw new Error('模型未返回有效的解释内容');
  }
  const ttl = 1000 * 60 * 30; // 30 minutes
  return {
    requestId: payload.requestId,
    literal,
    context,
    languages: payload.languages,
    detectedAt: payload.timestamp,
    expiresAt: Date.now() + ttl
  };
}

function buildQuickPrompt(payload: ExplainRequestPayload, profile?: ProfileTemplate) {
  const profileContext = profile
    ? [
        `User profile: ${profile.name} (id: ${profile.id})`,
        `Profile locale: ${profile.demographics.region}`,
        `Demographics: age_range=${profile.demographics.ageRange}, region=${profile.demographics.region}, occupation=${profile.demographics.occupation}, gender=${profile.demographics.gender || 'unspecified'}`,
        `Cultural focus: ${profile.cultures.join(', ') || 'none'}`,
        `Tone preference: ${profile.tone}`,
        `Personal preference: ${profile.personalPreference || DEFAULT_PROFILE_PREFERENCE}`,
        `Learning goals: ${profile.goals || 'none specified'}`,
        `Profile description: ${profile.description}`,
        `Adapt literal/context to resonate with ${profile.name} while staying accurate.`,
        `Use examples tied to ${profile.cultures.join(', ') || 'their cultural background'} and everyday situations common in ${profile.demographics.region}.`,
        `Keep explanations aligned with the desired tone (${profile.tone}) and highlight any implications relevant to ${profile.goals || 'their learning goals'}.`
      ]
    : [];
  const primaryLanguage = payload.languages.primary;
  const languageInstructions = [
    `All output MUST be written in ${primaryLanguage}. This is the ONLY output language.`,
    'IGNORE any language hints from profiles, subtitles, knowledge base entries, or examples; they do NOT override the required output language.',
  ].filter(Boolean);
  const outputConstraints = [
    `IMPORTANT: The literal field must be written entirely in ${primaryLanguage}; do not mix in other languages unless quoting the original subtitle.`,
    `IMPORTANT: The context field must be written entirely in ${primaryLanguage}. If you cite terms from other languages, include them in parentheses while the explanation stays in ${primaryLanguage}.`
  ];
  const qualityChecks = [
    `Before returning, re-read both literal and context. If either sentence contains wording that is not natural ${primaryLanguage}, rewrite it until it is.`,
    `If you are unsure how to express an idea in ${primaryLanguage}, respond with the ${primaryLanguage} equivalent of "translation unavailable" instead of switching languages.`
  ];

  return [
    'You are LinguaLens Quick Explain.',
    'Return a JSON object with fields literal and context.',
    `Primary language: ${primaryLanguage}`,
    ...languageInstructions,
    ...outputConstraints,
    ...qualityChecks,
    `Subtitle: ${payload.subtitleText}`,
    payload.surrounding ? `Context: ${payload.surrounding}` : '',
    `literal: translate the subtitle into ${primaryLanguage} using natural wording.`,
    `context: concise explanation (≤120 tokens) in ${primaryLanguage} describing intent or tone, tailored to the profile's cultural background and goals.`,
    ...profileContext,
    profile
      ? 'When cultural nuance or slang appears, compare it to a concept familiar to the profile.'
      : 'When cultural nuance or slang appears, compare it to a widely understood concept.'
  ]
    .filter(Boolean)
    .join('\n');
}

function extractOutputText(data: unknown): string {
  if (!data) return '';
  if (typeof data === 'string') return data;

  const asAny = data as Record<string, unknown>;

  const outputJson = asAny.output_json ?? asAny.json;
  if (outputJson && typeof outputJson === 'object') {
    return JSON.stringify(outputJson);
  }

  const outputText = asAny.output_text;
  if (typeof outputText === 'string') return outputText;
  if (Array.isArray(outputText)) {
    return outputText.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join('\n');
  }

  const outputs = Array.isArray(asAny.output) ? asAny.output : [];
  for (const item of outputs) {
    if (!item || typeof item !== 'object') continue;
    const content = (item as { content?: unknown }).content;
    const extracted = extractFromContent(content);
    if (extracted) return extracted;
  }

  const content = asAny.content;
  const extracted = extractFromContent(content);
  if (extracted) return extracted;

  const choices = Array.isArray(asAny.choices) ? asAny.choices : [];
  for (const choice of choices) {
    if (!choice || typeof choice !== 'object') continue;
    const message = (choice as { message?: unknown }).message;
    const msgContent = extractFromContent(
      message && typeof message === 'object' ? (message as { content?: unknown }).content : undefined
    );
    if (msgContent) return msgContent;
    const text = (choice as { text?: unknown }).text;
    if (typeof text === 'string' && text) return text;
  }

  return '';
}

function extractFromContent(content: unknown): string | null {
  if (!content) return null;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    for (const piece of content) {
      const extracted = extractFromContentPiece(piece);
      if (extracted) return extracted;
    }
    return null;
  }
  if (typeof content === 'object') {
    return extractFromContentPiece(content);
  }
  return null;
}

function extractFromContentPiece(piece: unknown): string | null {
  if (!piece || typeof piece !== 'object') return null;
  const asAny = piece as Record<string, unknown>;
  const type = typeof asAny.type === 'string' ? asAny.type : undefined;

  if (type === 'output_json' || type === 'json') {
    const payload = asAny.output_json ?? asAny.json ?? asAny.data;
    if (payload && typeof payload === 'object') {
      return JSON.stringify(payload);
    }
  }

  if (type === 'output_text') {
    const text = asAny.text;
    const normalized = normalizeTextValue(text);
    if (normalized) return normalized;
  }

  const textValue = normalizeTextValue(asAny.text);
  if (textValue) return textValue;

  if ('content' in asAny) {
    return extractFromContent(asAny.content);
  }

  const jsonLike = asAny.output_json ?? asAny.json;
  if (jsonLike && typeof jsonLike === 'object') {
    return JSON.stringify(jsonLike);
  }

  return null;
}

function normalizeTextValue(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    const flattened = value
      .map((part) => (typeof part === 'string' ? part : JSON.stringify(part)))
      .filter(Boolean)
      .join('\n');
    return flattened || null;
  }
  if (typeof value === 'object') {
    const asAny = value as { value?: unknown };
    if (typeof asAny.value === 'string') {
      return asAny.value;
    }
  }
  return null;
}

function parseQuickResponse(responseText: string): [string, string] {
  try {
    const parsed = JSON.parse(responseText);
    const literal = typeof parsed.literal === 'string' ? parsed.literal : '';
    const context = typeof parsed.context === 'string' ? parsed.context : '';
    if (literal || context) {
      return [literal, context];
    }
  } catch {
    const [firstLine, ...rest] = responseText.split('\n');
    return [firstLine ?? '', rest.join('\n').trim()];
  }

  const [firstLine, ...rest] = responseText.split('\n');
  return [firstLine ?? '', rest.join('\n').trim()];
}

function detectRefusal(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const status = (data as { status?: string }).status;
  if (status && status !== 'completed') {
    const reason = (data as { status_details?: { type?: string; reason?: string; message?: string } }).status_details;
    if (reason?.type === 'blocked') {
      return reason.reason ?? reason.message ?? '内容被安全策略拦截';
    }
  }
  const outputs = (data as { output?: unknown }).output;
  if (Array.isArray(outputs)) {
    for (const item of outputs) {
      if (!item || typeof item !== 'object') continue;
      if ((item as { status?: string }).status === 'incomplete') {
        return (item as { status_details?: { message?: string } }).status_details?.message ?? '生成被中断';
      }
      const content = (item as { content?: unknown }).content;
      if (Array.isArray(content)) {
        for (const piece of content) {
          if (!piece || typeof piece !== 'object') continue;
          const type = (piece as { type?: string }).type;
          if (type === 'refusal') {
            const refusal = (piece as { refusal?: { reason?: string; message?: string } }).refusal;
            return refusal?.reason ?? refusal?.message ?? '模型拒绝回答';
          }
          if (type === 'error') {
            const error = (piece as { error?: { message?: string } }).error;
            return error?.message ?? '模型响应错误';
          }
        }
      }
    }
  }
  return null;
}
