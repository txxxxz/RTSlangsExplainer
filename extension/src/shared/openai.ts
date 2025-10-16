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
  const text = Array.isArray(data.output_text) ? data.output_text.join('\n') : data.output_text;
  const [literal, context] = parseQuickResponse(text);
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

function parseQuickResponse(responseText: string): [string, string] {
  try {
    const parsed = JSON.parse(responseText);
    return [parsed.literal ?? '', parsed.context ?? ''];
  } catch {
    const [firstLine, ...rest] = responseText.split('\n');
    return [firstLine ?? '', rest.join('\n').trim()];
  }
}
