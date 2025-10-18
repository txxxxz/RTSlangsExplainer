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
    SourceReference,
    QuickExplainResponse
)

logger = logging.getLogger(__name__)


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
                'required': ['background', 'crossCulture', 'confidence', 'reasoningNotes'],
                'properties': {
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
    def __init__(self, base_url: str, api_key: str):
        normalized_base = base_url.rstrip('/') if base_url.endswith('/') else base_url
        self._client = httpx.AsyncClient(base_url=normalized_base, timeout=15.0)
        self._api_key = api_key

    @classmethod
    async def create(
        cls,
        api_key: str | None = None,
        base_url: str | None = None
    ) -> 'OpenAIClient':
        settings = get_settings()
        key = (api_key or settings.openai_api_key or '').strip()
        if not key:
            raise RuntimeError('OpenAI API key is not configured on the server.')
        base = (base_url or settings.openai_base_url).strip() or settings.openai_base_url
        return cls(base, key)

    async def quick_explain(self, request: ExplainRequest) -> QuickExplainResponse:
        settings = get_settings()
        payload = {
            'model': settings.openai_model_quick,
            'input': self._build_prompt(request),
            'temperature': 0.3,
            'max_output_tokens': 512,
            'text': _quick_text_format()
        }
        print('[LinguaLens][Server] 准备请求快速解释', {
            '请求编号': request.requestId,
            '模型': payload['model'],
            '提示词前120字符': payload['input'][:120],
            '最大输出token': payload['max_output_tokens']
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
            languages=request.languages,
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
        payload = {
            'model': settings.openai_model_deep,
            'input': self._build_deep_prompt(request, knowledge_base, sources),
            'temperature': 0.4,
            'max_output_tokens': 720,
            'text': _deep_text_format()
        }
        print('[LinguaLens][Server] 准备请求深度解释', {
            '请求编号': request.requestId,
            '模型': payload['model'],
            '提示词前120字符': payload['input'][:120],
            '最大输出token': payload['max_output_tokens'],
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
        return DeepExplainResponse(
            requestId=request.requestId,
            background=result['background'],
            crossCulture=result['crossCulture'],
            sources=sources,
            confidence=result['confidence'],
            reasoningNotes=result.get('reasoningNotes'),
            profileId=request.profileId,
            generatedAt=int(time() * 1000)
        )

    async def close(self) -> None:
        await self._client.aclose()

    def _build_prompt(self, request: ExplainRequest) -> str:
        secondary = (
            f"Secondary language: {request.languages.secondary}"
            if request.languages.secondary
            else "Secondary language: none"
        )
        profile_lines: list[str] = []
        if request.profile:
            demographics = request.profile.demographics
            profile_lines = [
                f"User profile: {request.profile.name} (id: {request.profile.id})",
                f"Primary language preference: {request.profile.primaryLanguage}",
                f"Cultural focus: {', '.join(request.profile.cultures) or 'none'}",
                f"Demographics: age_range={demographics.ageRange}, region={demographics.region}, occupation={demographics.occupation}, gender={demographics.gender or 'unspecified'}",
                f"Tone preference: {request.profile.tone}",
                f"Learning goals: {request.profile.goals or 'none specified'}",
                f"Description: {request.profile.description}",
                'Adjust literal/context to resonate with the profile while staying accurate and concise.'
            ]
        return '\n'.join(
            [
                'You are LinguaLens Quick Explain.',
                f"Primary language: {request.languages.primary}",
                secondary,
                f"Subtitle: {request.subtitleText}",
                f"Context: {request.surrounding or 'n/a'}",
                'Return JSON with literal and context fields.',
                *profile_lines
            ]
        )

    def _build_deep_prompt(
        self,
        request: ExplainRequest,
        knowledge_base: str,
        sources: list[SourceReference]
    ) -> str:
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
                f"- {profile.id}: {profile.name}; demographics(age_range={demographics.ageRange}, region={demographics.region}, occupation={demographics.occupation}, gender={demographics.gender or 'unspecified'}); tone={profile.tone}; goals={profile.goals or 'none'}; cultures={', '.join(profile.cultures) or 'none'}; description={profile.description}"
            )
        schema_instructions = [
            'Return JSON with the following schema (no markdown fences, no prose outside the JSON object):',
            '{',
            '  "background": {',
            '    "summary": string,',
            '    "detail": string (optional),',
            '    "highlights": string[] (2-4 concise bullet insights)',
            '  },',
            '  "crossCulture": [',
            '    {',
            '      "profileId": string,',
            '      "profileName": string,',
            '      "headline": string (short cultural hook),',
            '      "analogy": string (core explanation tailored to that culture),',
            '      "context": string (optional cultural nuance),',
            '      "notes": string (optional learning tip),',
            '      "confidence": "high" | "medium" | "low"',
            '    }',
            '  ],',
            '  "confidence": { "level": "high" | "medium" | "low", "notes": string (optional) },',
            '  "reasoningNotes": string (optional)',
            '}'
        ]

        return '\n'.join(
            [
                'You are LinguaLens Deep Explain.',
                f"Primary language: {request.languages.primary}",
                f"Secondary language: {request.languages.secondary or 'none'}",
                f"Subtitle: {request.subtitleText}",
                f"Context: {request.surrounding or 'n/a'}",
                'Profiles to address (return crossCulture entries for each profileId in the list):',
                *profile_sections,
                'Knowledge base snippets:',
                knowledge_base,
                'Sources:',
                sources_text,
                *schema_instructions
            ]
        )


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
        confidence_level = _normalize_confidence(data.get('confidence'))
        confidence_meta = {
            'level': confidence_level,
            'notes': _string_or_none(data.get('confidenceNotes') or data.get('confidenceNote'))
        }
        reasoning = _string_or_none(data.get('reasoningNotes') or data.get('reasoning'))
        return {
            'background': background,
            'crossCulture': cross_entries,
            'confidence': confidence_meta,
            'reasoningNotes': reasoning
        }
    except Exception:
        return {
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
