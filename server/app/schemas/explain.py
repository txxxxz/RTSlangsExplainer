from __future__ import annotations

from typing import Literal, Sequence

from pydantic import BaseModel, Field

from .profile import ProfileTemplate


class LanguagePair(BaseModel):
    primary: str = Field(..., description="User's primary language code.")
    secondary: str | None = Field(None, description="Optional fallback language code.")


class ExplainRequest(BaseModel):
    requestId: str
    mode: Literal['quick', 'deep']
    subtitleText: str
    surrounding: str | None = None
    timestamp: int
    profileId: str | None = None
    profile: ProfileTemplate | None = None
    profiles: Sequence[ProfileTemplate] | None = None
    languages: LanguagePair


class SourceReference(BaseModel):
    title: str
    url: str
    credibility: Literal['high', 'medium', 'low']
    excerpt: str | None = None


class QuickExplainResponse(BaseModel):
    requestId: str
    literal: str
    context: str
    languages: LanguagePair
    detectedAt: int
    expiresAt: int


class DeepExplainResponse(BaseModel):
    requestId: str
    background: str
    crossCulture: Sequence['CrossCultureInsight']
    sources: Sequence[SourceReference]
    confidence: Literal['high', 'medium', 'low']
    confidenceNotes: str | None = None
    reasoningNotes: str | None = None
    profileId: str | None = None
    generatedAt: int


class CrossCultureInsight(BaseModel):
    profileId: str
    profileName: str
    analogy: str
    confidence: Literal['high', 'medium', 'low']
    notes: str | None = None


class ExplainJobStatus(BaseModel):
    requestId: str
    status: Literal['queued', 'processing', 'completed', 'failed']
    result: DeepExplainResponse | QuickExplainResponse | None = None
    error: str | None = None


DeepExplainResponse.model_rebuild()
