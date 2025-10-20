export type SupportedLanguageOption = {
  value: string;
  label: string;
};

export const LANGUAGE_OPTIONS: SupportedLanguageOption[] = [
  { value: 'en', label: 'English' },
  { value: 'zh-cn', label: 'Chinese (Simplified)' },
  { value: 'zh-tw', label: 'Chinese (Traditional)' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ru', label: 'Russian' }
];

const LANGUAGE_ALIASES: Record<string, string> = {
  en: 'en',
  'en-us': 'en',
  'en-gb': 'en',
  'en-uk': 'en',
  'en-au': 'en',
  'en-ca': 'en',
  'en_in': 'en',
  'en_us': 'en',

  'zh': 'zh-cn',
  'zh-cn': 'zh-cn',
  'zh-hans': 'zh-cn',
  'zh_cn': 'zh-cn',
  'zh_sg': 'zh-cn',

  'zh-tw': 'zh-tw',
  'zh-hant': 'zh-tw',
  'zh-hk': 'zh-tw',
  'zh_tw': 'zh-tw',
  'zh_hk': 'zh-tw',

  ja: 'ja',
  'ja-jp': 'ja',
  jp: 'ja',
  'jp-jp': 'ja',
  'ja_jp': 'ja',

  ko: 'ko',
  'ko-kr': 'ko',
  'ko_kr': 'ko',

  es: 'es',
  'es-es': 'es',
  'es-la': 'es',
  'es_419': 'es',

  fr: 'fr',
  'fr-fr': 'fr',
  'fr_ca': 'fr',

  de: 'de',
  'de-de': 'de',

  pt: 'pt',
  'pt-pt': 'pt',
  'pt-br': 'pt',
  'pt_br': 'pt',

  ru: 'ru',
  'ru-ru': 'ru'
};

export const SUPPORTED_LANGUAGE_CODES = new Set(LANGUAGE_OPTIONS.map((option) => option.value));

export function normalizeLanguageCode(input?: string | null): string | null {
  if (!input) return null;
  const normalized = input.trim().toLowerCase().replace(/_/g, '-');
  if (!normalized) return null;
  const alias = LANGUAGE_ALIASES[normalized];
  if (alias) return alias;
  if (SUPPORTED_LANGUAGE_CODES.has(normalized)) {
    return normalized;
  }
  const prefix = normalized.split('-', 1)[0];
  if (prefix && LANGUAGE_ALIASES[prefix]) {
    return LANGUAGE_ALIASES[prefix];
  }
  return null;
}
