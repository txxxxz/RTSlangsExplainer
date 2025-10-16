import type { ExplainRequestPayload, ProfileTemplate, QuickExplainResponse } from './types';

interface OpenAIQuickBody {
  model: string;
  input: string;
  temperature: number;
  max_output_tokens: number;
}

export async function fetchQuickExplain(
  payload: ExplainRequestPayload,
  apiKey: string,
  baseUrl = 'https://api.openai.com/v1',
  profile?: ProfileTemplate
): Promise<QuickExplainResponse> {
  const prompt = buildQuickPrompt(payload, profile);
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(<OpenAIQuickBody>{
      model: 'gpt-4o-mini',
      input: prompt,
      temperature: 0.3,
      max_output_tokens: 360
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`OpenAI request failed: ${message}`);
  }

  const data = await response.json();
  const rawOutput = extractOutputText(data);
  const [literal, context] = parseQuickResponse(rawOutput);
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
  const fallbackSecondary = payload.languages.secondary
    ? `Secondary language: ${payload.languages.secondary}`
    : 'Secondary language: none';
  const profileContext = profile
    ? [
        `User profile: ${profile.name} (id: ${profile.id})`,
        `Primary language preference: ${profile.primaryLanguage}`,
        `Demographics: age_range=${profile.demographics.ageRange}, region=${profile.demographics.region}, occupation=${profile.demographics.occupation}, gender=${profile.demographics.gender || 'unspecified'}`,
        `Cultural focus: ${profile.cultures.join(', ') || 'none'}`,
        `Tone preference: ${profile.tone}`,
        `Learning goals: ${profile.goals || 'none specified'}`,
        `Profile description: ${profile.description}`,
        'Adapt literal/context to resonate with the profile while staying accurate.'
      ]
    : [];
  return [
    'You are LinguaLens Quick Explain.',
    'Return a JSON object with fields literal and context.',
    `Primary language: ${payload.languages.primary}`,
    fallbackSecondary,
    `Subtitle: ${payload.subtitleText}`,
    payload.surrounding ? `Context: ${payload.surrounding}` : '',
    'literal: direct translation in the requested language(s).',
    'context: concise explanation (≤120 tokens) of intent or tone.',
    ...profileContext
  ]
    .filter(Boolean)
    .join('\n');
}

function extractOutputText(data: unknown): string {
  if (!data) return '';
  if (typeof data === 'string') return data;

  const outputText = (data as { output_text?: unknown }).output_text;
  if (typeof outputText === 'string') return outputText;
  if (Array.isArray(outputText)) {
    return outputText.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join('\n');
  }

  const output = (data as { output?: unknown }).output;
  if (Array.isArray(output)) {
    const flattened = output
      .map((item) => extractOutputText((item as { content?: unknown }).content))
      .filter(Boolean);
    if (flattened.length) return flattened.join('\n');
  }

  const content = (data as { content?: unknown }).content;
  if (Array.isArray(content)) {
    const flattened = content
      .map((piece) => {
        if (!piece) return '';
        if (typeof piece === 'string') return piece;
        if (typeof piece === 'object') {
          if ('text' in (piece as { text?: unknown }) && typeof (piece as { text?: unknown }).text === 'string') {
            return (piece as { text: string }).text;
          }
          if ('content' in piece) {
            return extractOutputText((piece as { content?: unknown }).content);
          }
        }
        return '';
      })
      .filter(Boolean);
    if (flattened.length) return flattened.join('\n');
  }

  if (content && typeof content === 'object' && 'text' in (content as { text?: unknown })) {
    const textValue = (content as { text?: unknown }).text;
    if (typeof textValue === 'string') return textValue;
  }

  const choices = (data as { choices?: unknown }).choices;
  if (Array.isArray(choices) && choices.length) {
    const choiceText = choices
      .map((choice) => {
        if (!choice || typeof choice !== 'object') return '';
        const message = (choice as { message?: unknown }).message;
        if (message && typeof message === 'object') {
          const msgContent = (message as { content?: unknown }).content;
          if (typeof msgContent === 'string') return msgContent;
          if (Array.isArray(msgContent)) {
            return msgContent
              .map((item) => {
                if (!item) return '';
                if (typeof item === 'string') return item;
                if (typeof item === 'object') {
                  if ('text' in item && typeof (item as { text?: unknown }).text === 'string') {
                    return (item as { text: string }).text;
                  }
                }
                return '';
              })
              .filter(Boolean)
              .join('\n');
          }
        }
        const text = (choice as { text?: unknown }).text;
        if (typeof text === 'string') return text;
        return '';
      })
      .filter(Boolean)
      .join('\n');
    if (choiceText) return choiceText;
  }

  return '';
}

function parseQuickResponse(responseText: string): [string, string] {
  try {
    const parsed = JSON.parse(responseText);
    return [parsed.literal ?? '', parsed.context ?? ''];
  } catch {
    const [firstLine, ...rest] = responseText.split('\n');
    return [firstLine ?? '', rest.join('\n').trim()];
  }
}
