from __future__ import annotations

import logging
import re
from time import time
from typing import Any

import httpx

from ..core.config import get_settings
from ..schemas.explain import (
    DeepExplainResponse,
    ExplainRequest,
    LanguagePair,
    SourceReference,
    QuickExplainResponse
)
from ..schemas.model import ModelConfig
from ..services.models import ModelStore

logger = logging.getLogger(__name__)

DEFAULT_PROFILE_PREFERENCE = 'Explain concepts with relatable, everyday examples.'

LANGUAGE_ALIASES: dict[str, str] = {
    'en': 'en',
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

    'ja': 'ja',
    'ja-jp': 'ja',
    'ja_jp': 'ja',
    'jp': 'ja',
    'jp-jp': 'ja',

    'ko': 'ko',
    'ko-kr': 'ko',
    'ko_kr': 'ko',

    'es': 'es',
    'es-es': 'es',
    'es-la': 'es',
    'es_419': 'es',

    'fr': 'fr',
    'fr-fr': 'fr',
    'fr_ca': 'fr',

    'de': 'de',
    'de-de': 'de',

    'pt': 'pt',
    'pt-pt': 'pt',
    'pt-br': 'pt',
    'pt_br': 'pt',

    'ru': 'ru',
    'ru-ru': 'ru'
}

SUPPORTED_LANGUAGE_CODES = {
    'en',
    'zh-cn',
    'zh-tw',
    'ja',
    'ko',
    'es',
    'fr',
    'de',
    'pt',
    'ru'
}


def _normalize_language_code(code: str | None) -> str | None:
    if not code:
        return None
    normalized = code.strip().lower().replace('_', '-')
    if not normalized:
        return None
    alias = LANGUAGE_ALIASES.get(normalized)
    if alias:
        return alias
    if normalized in SUPPORTED_LANGUAGE_CODES:
        return normalized
    prefix = normalized.split('-', 1)[0]
    if prefix and LANGUAGE_ALIASES.get(prefix):
        return LANGUAGE_ALIASES[prefix]
    return normalized


def _effective_primary_language(request: ExplainRequest) -> str:
    profile_language = None
    if request.profile and getattr(request.profile, 'primaryLanguage', None):
        profile_language = _normalize_language_code(request.profile.primaryLanguage)
    request_language = _normalize_language_code(request.languages.primary) or request.languages.primary
    return profile_language or request_language or 'en'


def _quick_text_format() -> dict[str, Any]:
    return {
        'format': {
            'type': 'json_schema',
            'name': 'json_schema',
            'strict': True,
            'schema': {
                'type': 'object',
                'properties': {
                    'literal': {'type': 'string'},
                    'context': {'type': 'string'}
                },
                'required': ['literal', 'context'],
                'additionalProperties': False
            }
        }
    }


def _deep_text_format() -> dict[str, Any]:
    return {
        'format': {
            'type': 'json_schema',
            'name': 'deep_explain_schema',
            'strict': True,
            'schema': {
                'type': 'object',
                'additionalProperties': False,
                'required': ['lang', 'background', 'crossCulture', 'confidence', 'reasoningNotes'],
                'properties': {
                    'lang': {
                        'type': 'string',
                        'pattern': '^[a-z]{2}(?:-[A-Z]{2})?$'
                    },
                    'background': {
                        'type': 'object',
                        'additionalProperties': False,
                        'required': ['summary', 'detail', 'highlights'],
                        'properties': {
                            'summary': {'type': 'string'},
                            'detail': {'type': ['string', 'null']},
                            'highlights': {
                                'type': 'array',
                                'items': {'type': 'string'},
                                'minItems': 0,
                                'maxItems': 4
                            }
                        }
                    },
                    'crossCulture': {
                        'type': 'array',
                        'items': {
                            'type': 'object',
                            'additionalProperties': False,
                            'required': [
                                'profileId',
                                'profileName',
                                'headline',
                                'analogy',
                                'context',
                                'notes',
                                'confidence'
                            ],
                            'properties': {
                                'profileId': {'type': 'string'},
                                'profileName': {'type': 'string'},
                                'headline': {'type': ['string', 'null']},
                                'analogy': {'type': 'string'},
                                'context': {'type': ['string', 'null']},
                                'notes': {'type': ['string', 'null']},
                                'confidence': {'type': 'string', 'enum': ['high', 'medium', 'low']}
                            }
                        }
                    },
                    'confidence': {
                        'type': 'object',
                        'additionalProperties': False,
                        'required': ['level', 'notes'],
                        'properties': {
                            'level': {'type': 'string', 'enum': ['high', 'medium', 'low']},
                            'notes': {'type': ['string', 'null']}
                        }
                    },
                    'reasoningNotes': {'type': ['string', 'null']}
                }
            }
        }
    }


class OpenAIClient:
    def __init__(self, base_url: str, api_key: str, model_config: ModelConfig | None = None):
        normalized_base = base_url.rstrip('/') if base_url and base_url.endswith('/') else base_url
        if not normalized_base:
            normalized_base = 'https://api.openai.com/v1'
        self._client = httpx.AsyncClient(base_url=normalized_base, timeout=15.0)
        self._api_key = api_key
        self._model_config = model_config
        self._base_url = normalized_base

    @classmethod
    async def create(
        cls,
        api_key: str | None = None,
        base_url: str | None = None
    ) -> 'OpenAIClient':
        settings = get_settings()
        store = await ModelStore.create()
        default_model = await store.get_default()

        key = (api_key or '').strip()
        base = (base_url or '').strip()

        if default_model:
            if not key and default_model.apiKey:
                key = default_model.apiKey.strip()
            if not base and default_model.baseUrl:
                base = default_model.baseUrl.strip()

        if not key:
            key = (settings.openai_api_key or '').strip()
        if not base:
            base = settings.openai_base_url.strip() if settings.openai_base_url else ''
        if not key:
            raise RuntimeError('OpenAI API key is not configured on the server.')

        return cls(base, key, model_config=default_model)

    def _resolve_generation_params(
        self,
        fallback_model: str,
        fallback_temperature: float,
        fallback_max_tokens: int
    ) -> tuple[str, float, int, float | None]:
        config = self._model_config
        if not config:
            return fallback_model, fallback_temperature, fallback_max_tokens, None
        model_name = config.model or fallback_model
        temperature = (
            fallback_temperature
            if config.temperature is None
            else config.temperature
        )
        max_tokens = (
            fallback_max_tokens
            if (config.maxTokens is None or config.maxTokens <= 0)
            else config.maxTokens
        )
        top_p = config.topP
        return model_name, temperature, max_tokens, top_p

    async def quick_explain(self, request: ExplainRequest) -> QuickExplainResponse:
        settings = get_settings()
        primary_language = _effective_primary_language(request)
        model_name, temperature, max_tokens, top_p = self._resolve_generation_params(
            settings.openai_model_quick,
            0.3,
            512,
        )
        payload = {
            'model': model_name,
            'input': self._build_prompt(request),
            'temperature': temperature,
            'max_output_tokens': max_tokens,
            'text': _quick_text_format()
        }
        if top_p is not None:
            payload['top_p'] = top_p
        print('[LinguaLens][Server] 准备请求快速解释', {
            '请求编号': request.requestId,
            '模型': payload['model'],
            '提示词前120字符': payload['input'][:120],
            '最大输出token': payload['max_output_tokens'],
            '温度': payload['temperature'],
            'Top P': payload.get('top_p')
        })
        response = await self._client.post(
            '/responses',
            headers={'Authorization': f'Bearer {self._api_key}'},
            json=payload
        )
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text
            logger.warning('Quick explain request failed: %s', detail)
            print('[LinguaLens][Server] 快速解释请求失败', {
                '状态码': exc.response.status_code,
                '响应内容': detail
            })
            raise RuntimeError(
                f"OpenAI quick explain failed ({exc.response.status_code}): {detail}"
            ) from exc
        data = response.json()
        print('[LinguaLens][Server] 快速解释原始响应', {
            '请求编号': request.requestId,
            '响应预览': str(data)[:200]
        })
        text = parse_output_text(data)
        literal, context = split_quick_output(text)
        ttl_ms = get_settings().quick_cache_ttl * 1000
        now_ms = int(time() * 1000)
        return QuickExplainResponse(
            requestId=request.requestId,
            literal=literal,
            context=context,
            languages=LanguagePair(primary=primary_language, secondary=None),
            detectedAt=now_ms,
            expiresAt=now_ms + ttl_ms
        )

    async def deep_explain(
        self,
        request: ExplainRequest,
        knowledge_base: str,
        sources: list[SourceReference]
    ) -> DeepExplainResponse:
        settings = get_settings()
        model_name, temperature, max_tokens, top_p = self._resolve_generation_params(
            settings.openai_model_deep,
            0.4,
            720,
        )
        payload = {
            'model': model_name,
            'input': self._build_deep_prompt(request, knowledge_base, sources),
            'temperature': temperature,
            'max_output_tokens': max_tokens,
            'text': _deep_text_format()
        }
        if top_p is not None:
            payload['top_p'] = top_p
        print('[LinguaLens][Server] 准备请求深度解释', {
            '请求编号': request.requestId,
            '模型': payload['model'],
            '提示词前120字符': payload['input'][:120],
            '最大输出token': payload['max_output_tokens'],
            '温度': payload['temperature'],
            'Top P': payload.get('top_p'),
            '知识库预览': knowledge_base[:120]
        })
        response = await self._client.post(
            '/responses',
            headers={'Authorization': f'Bearer {self._api_key}'},
            json=payload
        )
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text
            logger.warning('Deep explain request failed: %s', detail)
            print('[LinguaLens][Server] 深度解释请求失败', {
                '状态码': exc.response.status_code,
                '响应内容': detail
            })
            raise RuntimeError(
                f"OpenAI deep explain failed ({exc.response.status_code}): {detail}"
            ) from exc
        raw_json = response.json()
        print('[LinguaLens][Server] 深度解释原始响应', {
            '请求编号': request.requestId,
            '响应预览': str(raw_json)[:200]
        })
        text = parse_output_text(raw_json)
        result = parse_deep_response(text)
        lang_tag_raw = result.get('lang')
        lang_tag = _normalize_language_code(lang_tag_raw) or ((lang_tag_raw or '').strip().lower() or None)
        primary_language = _effective_primary_language(request)
        primary_code = _normalize_language_code(primary_language) or primary_language.strip().lower()
        if lang_tag and primary_code and lang_tag != primary_code:
            logger.warning(
                'Deep explain language mismatch: expected %s, got %s for request %s',
                primary_code,
                lang_tag,
                request.requestId
            )
            raise RuntimeError(
                f"Deep explain output language mismatch: expected '{primary_code}' but model returned '{lang_tag}'."
            )
        return DeepExplainResponse(
            requestId=request.requestId,
            background=result['background'],
            crossCulture=result['crossCulture'],
            sources=sources,
            confidence=result['confidence'],
            reasoningNotes=result.get('reasoningNotes'),
            profileId=request.profileId,
            generatedAt=int(time() * 1000),
            language=result.get('lang')
        )

    async def close(self) -> None:
        await self._client.aclose()

    def _build_prompt(self, request: ExplainRequest) -> str:
        primary_language = _effective_primary_language(request)
        profile_lines: list[str] = []
        if request.profile:
            demographics = request.profile.demographics
            profile_lines = [
                f"User profile: {request.profile.name} (id: {request.profile.id})",
                f"Profile locale: {demographics.region}",
                f"Cultural focus: {', '.join(request.profile.cultures) or 'none'}",
                f"Demographics: age_range={demographics.ageRange}, region={demographics.region}, occupation={demographics.occupation}, gender={demographics.gender or 'unspecified'}",
                f"Tone preference: {request.profile.tone}",
                f"Personal preference: {request.profile.personalPreference or DEFAULT_PROFILE_PREFERENCE}",
                f"Learning goals: {request.profile.goals or 'none specified'}",
                f"Description: {request.profile.description}",
                f"Adjust literal/context to resonate with {request.profile.name} while staying accurate and concise.",
                f"Use examples tied to {', '.join(request.profile.cultures) or 'their cultural background'} and relatable situations in {demographics.region}.",
                f"Keep explanations aligned with the desired tone ({request.profile.tone}) and highlight implications relevant to {request.profile.goals or 'their learning goals'}."
            ]
        lines = [
            'You are LinguaLens Quick Explain.',
            f"Primary language: {primary_language}",
            f"All output MUST be written in {primary_language}. This is the ONLY output language.",
            "IGNORE any language hints from profiles, subtitles, knowledge base entries, or examples; they do NOT override the required output language.",
            f"IMPORTANT: The literal field must be written entirely in {primary_language}; only quote other languages when repeating the original subtitle.",
            f"IMPORTANT: The context field must be written entirely in {primary_language}. If you reference other languages, keep them in parentheses while the explanation remains in {primary_language}.",
            "Before returning, re-read literal and context. If any portion is not natural in the primary language, translate or rewrite it until it is.",
            f"If you cannot express an idea in {primary_language}, write the equivalent of 'translation unavailable' in {primary_language} instead of switching languages.",
            f"Subtitle: {request.subtitleText}",
            f"Context: {request.surrounding or 'n/a'}",
            'Return JSON with literal and context fields.',
            f"literal: provide a natural translation into {primary_language}.",
            f"context: explain intent or tone in {primary_language}, concise and friendly, tailored to the profile's background and goals.",
            *profile_lines,
            (
                'When cultural nuance or slang appears, compare it to a concept familiar to the profile.'
                if request.profile
                else 'When cultural nuance or slang appears, compare it to a widely understood concept.'
            )
        ]
        return '\n'.join(line for line in lines if line)

    def _build_deep_prompt(
        self,
        request: ExplainRequest,
        knowledge_base: str,
        sources: list[SourceReference]
    ) -> str:
        primary_language = _effective_primary_language(request)
        sources_text = '\n'.join(
            [f"- {source.title}: {source.excerpt} (credibility: {source.credibility})" for source in sources]
        )
        variant_profiles: list = []
        if request.profile:
            variant_profiles.append(request.profile)
        if request.profiles:
            for profile in request.profiles:
                if not any(existing.id == profile.id for existing in variant_profiles):
                    variant_profiles.append(profile)
        profile_sections: list[str] = []
        for profile in variant_profiles:
            demographics = profile.demographics
            profile_sections.append(
                f"- {profile.id}: {profile.name}; demographics(age_range={demographics.ageRange}, region={demographics.region}, occupation={demographics.occupation}, gender={demographics.gender or 'unspecified'}); tone={profile.tone}; persona={profile.personalPreference or DEFAULT_PROFILE_PREFERENCE}; goals={profile.goals or 'none'}; cultures={', '.join(profile.cultures) or 'none'}; description={profile.description}"
            )
        schema_instructions = [
            'Return JSON with the following schema (no markdown fences, no prose outside the JSON object):',
            '{',
            '  "lang": string language tag for the whole output (use the primary language code, e.g., "ja"),',
            '  "background": {',
            '    "summary": string (use the primary language),',
            '    "detail": string (optional, primary language),',
            '    "highlights": string[] (2-4 concise bullet insights in the primary language)',
            '  },',
            '  "crossCulture": [',
            '    {',
            '      "profileId": string,',
            '      "profileName": string,',
            '      "headline": string (short cultural hook, primary language or original quoted),',
            '      "analogy": string (core explanation tailored to that culture, in the primary language),',
            '      "context": string (optional cultural nuance, primary language),',
            '      "notes": string (optional learning tip, primary language),',
            '      "confidence": "high" | "medium" | "low"',
            '    }',
            '  ],',
            '  "confidence": { "level": "high" | "medium" | "low", "notes": string (optional, primary language) },',
            '  "reasoningNotes": string (optional, primary language)',
            '}',
            'Set "lang" to the primary language code (for example "ja" for Japanese).'
        ]

        schema_instructions.extend(
            [
                'Guidance for personalization:',
                '- Anchor the background summary to the primary profile’s perspective, highlighting why the slang matters to them.',
                '- For each crossCulture entry, weave in the listed profile’s tone, cultural references, and personal goals so the analogy feels bespoke.',
                '- When offering notes, include practical tips or comparisons tied to each profile’s region or daily experiences.',
            ]
        )

        personalization_guidelines: list[str] = [
            'Personalization directives:',
            '1. Keep the narrative clear and supportive, mirroring the requested tone.',
            '2. If cultural nuance is ambiguous, clarify it with comparisons familiar to the listed profiles.',
        ]
        if request.profile:
            demographics = request.profile.demographics
            personalization_guidelines.append(
                f"3. Emphasize takeaways that help {request.profile.name} ({demographics.region}) understand emotional subtext or etiquette around the slang."
            )
        if len(variant_profiles) > 1:
            personalization_guidelines.append(
                "4. Make crossCulture entries distinct—avoid repeating examples between profiles; address each persona’s unique background."
            )

        language_instructions = [
            f"All narrative, summaries, and explanations MUST be written in {primary_language}.",
            f"IMPORTANT: Every string in the JSON output MUST be exclusively in {primary_language}.",
            "Do NOT copy knowledge base text verbatim if it is not in the primary language—paraphrase and translate it into the primary language.",
            "IGNORE any language mentioned in profiles or sources; they do NOT change the output language.",
            "Do NOT write full sentences in other languages. At most include a single quoted term in parentheses.",
        ]
        language_instructions.extend([
            "Before returning the JSON, re-read every field (background, crossCulture, confidence, reasoningNotes). If any sentence is not natural in the primary language, translate or rewrite it until it is.",
            "If a concept cannot be described in the primary language, replace the value with the primary-language equivalent of 'translation unavailable' instead of using another language."
        ])

        lines = [
            'You are LinguaLens Deep Explain.',
            f"Primary language: {primary_language}",
            *[item for item in language_instructions if item],
            f"Subtitle: {request.subtitleText}",
            f"Context: {request.surrounding or 'n/a'}",
            'Profiles to address (return crossCulture entries for each profileId in the list):',
            *profile_sections,
            'Knowledge base snippets:',
            knowledge_base,
            'Translate and paraphrase any knowledge base or source content into the primary language. Do NOT include long verbatim quotes in other languages.',
            'Sources:',
            sources_text,
            *personalization_guidelines,
            *schema_instructions
        ]
        return '\n'.join(lines)


def parse_output_text(payload: Any) -> str:
    if not isinstance(payload, dict):
        return payload if isinstance(payload, str) else ''

    json_value = payload.get('output_json') or payload.get('json')
    json_text = _stringify_json(json_value)
    if json_text:
        return json_text

    output = payload.get('output_text')
    if isinstance(output, list):
        return '\n'.join(_stringify_part(part) for part in output if part)
    if isinstance(output, str):
        return output

    rich_output = payload.get('output')
    if isinstance(rich_output, list):
        for item in rich_output:
            if not isinstance(item, dict):
                continue
            content = item.get('content')
            extracted = _extract_from_content(content)
            if extracted:
                return extracted

    content = payload.get('content')
    extracted = _extract_from_content(content)
    if extracted:
        return extracted

    choices = payload.get('choices')
    if isinstance(choices, list):
        for choice in choices:
            if not isinstance(choice, dict):
                continue
            message = choice.get('message')
            message_content = None
            if isinstance(message, dict):
                message_content = message.get('content')
            extracted = _extract_from_content(message_content)
            if extracted:
                return extracted
            text = choice.get('text')
            if isinstance(text, str) and text:
                return text

    return ''


def _extract_from_content(content: Any) -> str | None:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        for piece in content:
            extracted = _extract_from_piece(piece)
            if extracted:
                return extracted
        return None
    if isinstance(content, dict):
        return _extract_from_piece(content)
    return None


def _extract_from_piece(piece: Any) -> str | None:
    if not isinstance(piece, dict):
        return None
    piece_type = piece.get('type')

    if piece_type in {'output_json', 'json'}:
        json_payload = piece.get('output_json') or piece.get('json') or piece.get('data')
        json_text = _stringify_json(json_payload)
        if json_text:
            return json_text

    if piece_type == 'output_text':
        text = piece.get('text')
        text_value = _normalize_text_value(text)
        if text_value:
            return text_value

    text_value = _normalize_text_value(piece.get('text'))
    if text_value:
        return text_value

    if 'content' in piece:
        return _extract_from_content(piece.get('content'))

    json_payload = piece.get('output_json') or piece.get('json')
    json_text = _stringify_json(json_payload)
    if json_text:
        return json_text

    return None


def _normalize_text_value(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        pieces: list[str] = []
        for part in value:
            if part is None:
                continue
            if isinstance(part, str):
                pieces.append(part)
                continue
            normalized = _normalize_text_value(part)
            if normalized:
                pieces.append(normalized)
                continue
            json_text = _stringify_json(part)
            if json_text:
                pieces.append(json_text)
        joined = '\n'.join(piece for piece in pieces if piece).strip()
        return joined or None
    if isinstance(value, dict):
        candidates = [
            value.get('text'),
            value.get('value'),
            value.get('content'),
            value.get('data')
        ]
        for candidate in candidates:
            if candidate is None or candidate is value:
                continue
            normalized = _normalize_text_value(candidate)
            if normalized:
                return normalized
        text_value = value.get('value')
        if isinstance(text_value, str):
            return text_value
    return None


def _stringify_json(value: Any) -> str | None:
    if isinstance(value, (dict, list)):
        import json

        try:
            return json.dumps(value)
        except TypeError:
            return None
    return None


def _stringify_part(part: Any) -> str:
    if isinstance(part, str):
        return part
    normalized = _normalize_text_value(part)
    if normalized:
        return normalized
    json_text = _stringify_json(part)
    return json_text or ''


def split_quick_output(text: str) -> tuple[str, str]:
    try:
        import json

        value = json.loads(text)
        return value.get('literal', ''), value.get('context', '')
    except Exception:
        lines = text.split('\n')
        return lines[0] if lines else '', '\n'.join(lines[1:]).strip()


def parse_deep_response(text: str) -> dict[str, Any]:
    try:
        import json

        payload = _prepare_json_payload(text)
        data = json.loads(payload)
        background = _format_background(data.get('background'))
        cross_entries = []
        for entry in _iterate_cross_culture(data.get('crossCulture')):
            formatted = _format_cross_culture_entry(entry)
            if formatted:
                cross_entries.append(formatted)
        lang_tag = _string_or_none(data.get('lang') or data.get('language'))
        confidence_level = _normalize_confidence(data.get('confidence'))
        confidence_meta = {
            'level': confidence_level,
            'notes': _string_or_none(data.get('confidenceNotes') or data.get('confidenceNote'))
        }
        reasoning = _string_or_none(data.get('reasoningNotes') or data.get('reasoning'))
        return {
            'lang': lang_tag,
            'background': background,
            'crossCulture': cross_entries,
            'confidence': confidence_meta,
            'reasoningNotes': reasoning
        }
    except Exception:
        return {
            'lang': None,
            'background': _format_background(text),
            'crossCulture': [],
            'confidence': {'level': 'medium', 'notes': None},
            'reasoningNotes': None
        }


def _split_sentences(value: str) -> list[str]:
    return [s.strip() for s in re.split(r'(?<=[.!?])\s+', value) if s.strip()]


def _string_or_none(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        cleaned = value.strip()
    else:
        cleaned = str(value).strip()
    return cleaned or None


def _normalize_confidence(value: Any) -> str:
    if isinstance(value, dict):
        return _normalize_confidence(value.get('level'))
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {'high', 'medium', 'low'}:
            return lowered
    return 'medium'


def _normalize_highlights(value: Any, fallback_detail: str | None) -> list[str]:
    highlights: list[str] = []
    if isinstance(value, list):
        highlights = [str(item).strip() for item in value if str(item).strip()]
    elif isinstance(value, str):
        highlights = [segment.strip() for segment in re.split(r'[\n;•\u2022]+', value) if segment.strip()]
    if not highlights and fallback_detail:
        highlights = _split_sentences(fallback_detail)
    return highlights[:4]


def _format_background(raw: Any) -> dict[str, Any]:
    parsed = _maybe_parse_json(raw)
    if parsed is not None and parsed is not raw:
        return _format_background(parsed)
    if isinstance(raw, dict):
        summary = _string_or_none(
            raw.get('summary')
            or raw.get('headline')
            or raw.get('mainIdea')
            or raw.get('overview')
        )
        detail = _string_or_none(raw.get('detail') or raw.get('context') or raw.get('elaboration'))
        highlights = _normalize_highlights(
            raw.get('highlights')
            or raw.get('keyTakeaways')
            or raw.get('bulletPoints'),
            detail
        )
    else:
        text = _string_or_none(raw) or ''
        if not text:
            return {'summary': '', 'detail': None, 'highlights': []}
        sentences = _split_sentences(text)
        summary = sentences[0] if sentences else text
        remaining = sentences[1:]
        detail = ' '.join(remaining).strip() or None
        highlights = remaining or []

    if not summary and detail:
        first_sentence = _split_sentences(detail)
        summary = first_sentence[0] if first_sentence else ''

    return {
        'summary': summary or '',
        'detail': detail,
        'highlights': highlights[:4]
    }


def _format_cross_culture_entry(entry: Any) -> dict[str, Any] | None:
    parsed = _maybe_parse_json(entry)
    if parsed is not None and parsed is not entry:
        entry = parsed
    if not isinstance(entry, dict):
        return None
    profile_id = str(
        entry.get('profileId')
        or entry.get('id')
        or entry.get('profile')
        or entry.get('profileName')
        or 'profile'
    )
    profile_name = _string_or_none(entry.get('profileName') or entry.get('profile')) or profile_id
    analogy = _string_or_none(
        entry.get('analogy')
        or entry.get('explanation')
        or entry.get('translation')
        or entry.get('description')
    ) or ''
    headline = _string_or_none(entry.get('headline') or entry.get('title') or entry.get('summary'))
    if not headline and analogy:
        sentences = _split_sentences(analogy)
        headline = sentences[0] if sentences else analogy
    context = _string_or_none(entry.get('context') or entry.get('nuance'))
    notes = _string_or_none(
        entry.get('notes')
        or entry.get('optionalNotes')
        or entry.get('learningTip')
        or entry.get('nextSteps')
    )
    confidence = _normalize_confidence(entry.get('confidence'))
    return {
        'profileId': profile_id,
        'profileName': profile_name,
        'analogy': analogy,
        'confidence': confidence,
        'notes': notes,
        'headline': headline,
        'context': context
    }


def _iterate_cross_culture(raw: Any) -> list[Any]:
    parsed = _maybe_parse_json(raw)
    if parsed is not None:
        raw = parsed
    if isinstance(raw, list):
        return raw
    if raw is None:
        return []
    return [raw]


def _maybe_parse_json(raw: Any) -> Any:
    if isinstance(raw, str):
        candidate = raw.strip()
        if candidate.startswith('{') or candidate.startswith('['):
            try:
                import json

                return json.loads(candidate)
            except Exception:
                return raw
    return raw


def _prepare_json_payload(raw: Any) -> str:
    if isinstance(raw, (dict, list)):
        import json

        return json.dumps(raw)
    if not isinstance(raw, str):
        return str(raw)

    candidate = raw.strip()
    if not candidate:
        return candidate

    fenced = _extract_code_fence(candidate)
    if fenced:
        candidate = fenced

    if candidate and candidate[0] not in {'{', '['}:
        start = candidate.find('{')
        end = candidate.rfind('}')
        if start != -1 and end != -1 and end > start:
            candidate = candidate[start:end + 1].strip()

    if candidate.startswith('{'):
        end = candidate.rfind('}')
        if end != -1:
            candidate = candidate[:end + 1]
    elif candidate.startswith('['):
        end = candidate.rfind(']')
        if end != -1:
            candidate = candidate[:end + 1]

    return candidate


def _extract_code_fence(text: str) -> str | None:
    fence_match = re.search(r'```(?:json)?\s*(.*?)\s*```', text, re.IGNORECASE | re.DOTALL)
    if fence_match:
        return fence_match.group(1).strip()
    return None
