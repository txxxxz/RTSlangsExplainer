from __future__ import annotations

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


class OpenAIClient:
    def __init__(self, base_url: str, api_key: str):
        self._client = httpx.AsyncClient(base_url=base_url, timeout=15.0)
        self._api_key = api_key

    @classmethod
    async def create(cls) -> 'OpenAIClient':
        settings = get_settings()
        if not settings.openai_api_key:
            raise RuntimeError('OpenAI API key is not configured on the server.')
        return cls(settings.openai_base_url, settings.openai_api_key)

    async def quick_explain(self, request: ExplainRequest) -> QuickExplainResponse:
        settings = get_settings()
        payload = {
            'model': settings.openai_model_quick,
            'input': self._build_prompt(request),
            'temperature': 0.3,
            'max_output_tokens': 360
        }
        response = await self._client.post(
            '/responses',
            headers={'Authorization': f'Bearer {self._api_key}'},
            json=payload
        )
        response.raise_for_status()
        data = response.json()
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
            'max_output_tokens': 720
        }
        response = await self._client.post(
            '/responses',
            headers={'Authorization': f'Bearer {self._api_key}'},
            json=payload
        )
        response.raise_for_status()
        text = parse_output_text(response.json())
        result = parse_deep_response(text)
        return DeepExplainResponse(
            requestId=request.requestId,
            background=result['background'],
            crossCulture=result['crossCulture'],
            sources=sources,
            confidence=result['confidence'],
            confidenceNotes=result.get('confidenceNotes'),
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
                (
                    "Return JSON with fields background, crossCulture (list of objects with profileId,"
                    " profileName, analogy, confidence, optional notes), confidence (overall),"
                    " confidenceNotes (optional), reasoningNotes (optional)."
                )
            ]
        )


def parse_output_text(payload: Any) -> str:
    output = payload.get('output_text')
    if isinstance(output, list):
        return '\n'.join(output)
    if isinstance(output, str):
        return output
    return ''


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

        data = json.loads(text)
        cross_entries = []
        for entry in data.get('crossCulture', []) or []:
            if not isinstance(entry, dict):
                continue
            profile_id = str(
                entry.get('profileId')
                or entry.get('id')
                or entry.get('profile')
                or entry.get('profileName')
                or 'profile'
            )
            cross_entries.append(
                {
                    'profileId': profile_id,
                    'profileName': entry.get('profileName') or entry.get('profile') or profile_id,
                    'analogy': entry.get('analogy') or entry.get('explanation') or '',
                    'confidence': entry.get('confidence', 'medium'),
                    'notes': entry.get('notes') or entry.get('nextSteps')
                }
            )
        return {
            'background': data.get('background', ''),
            'crossCulture': cross_entries,
            'confidence': data.get('confidence', 'medium'),
            'confidenceNotes': data.get('confidenceNotes'),
            'reasoningNotes': data.get('reasoningNotes', '')
        }
    except Exception:
        return {
            'background': text,
            'crossCulture': [],
            'confidence': 'medium',
            'confidenceNotes': None,
            'reasoningNotes': ''
        }
