from __future__ import annotations

from time import time
from typing import Dict

from pydantic import BaseModel, Field


class ModelQualityPreset(BaseModel):
    temperature: float | None = Field(default=None)
    topP: float | None = Field(default=None)
    maxTokens: int | None = Field(default=None)
    formality: str | None = Field(default=None)
    literalness: float | None = Field(default=None)
    glossaryEnabled: bool | None = Field(default=None)


class SettingsPayload(BaseModel):
    defaultModelId: str | None = Field(default=None)
    presets: Dict[str, ModelQualityPreset] = Field(default_factory=dict)
    syncMode: str = Field(default='local')
    updatedAt: int = Field(default_factory=lambda: int(time() * 1000))


class SettingsUpdatePayload(BaseModel):
    defaultModelId: str | None = Field(default=None)
    presets: Dict[str, ModelQualityPreset] | None = Field(default=None)
    syncMode: str | None = Field(default=None)

    def apply(self, existing: SettingsPayload) -> SettingsPayload:
        presets = existing.presets
        if self.presets is not None:
            presets = self.presets
        return SettingsPayload(
            defaultModelId=self.defaultModelId if self.defaultModelId is not None else existing.defaultModelId,
            presets=presets,
            syncMode=self.syncMode or existing.syncMode,
            updatedAt=int(time() * 1000),
        )
