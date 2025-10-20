from __future__ import annotations

from time import time
from typing import Literal

from pydantic import BaseModel, Field

ModelProvider = Literal[
    'openai',
    'azure-openai',
    'anthropic',
    'google-gemini',
    'deepseek',
    'self-hosted',
]


class ModelQualitySettings(BaseModel):
    temperature: float | None = Field(default=None)
    topP: float | None = Field(default=None)
    maxTokens: int | None = Field(default=None)
    formality: Literal['formal', 'informal'] | None = Field(default=None)
    literalness: float | None = Field(default=None)
    glossaryEnabled: bool | None = Field(default=None)


class ModelConfig(ModelQualitySettings):
    id: str
    provider: ModelProvider
    model: str
    baseUrl: str | None = Field(default=None)
    apiKey: str | None = Field(default=None)
    isDefault: bool = Field(default=False)
    createdAt: int = Field(default_factory=lambda: int(time() * 1000))
    updatedAt: int = Field(default_factory=lambda: int(time() * 1000))


class ModelCollection(BaseModel):
    models: list[ModelConfig]


class SetDefaultModelPayload(BaseModel):
    modelId: str | None = Field(default=None)
