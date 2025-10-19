from __future__ import annotations

from uuid import uuid4
from time import time

from pydantic import BaseModel, Field


class HistoryEntry(BaseModel):
    id: str
    query: str
    resultSummary: str | None = Field(default=None)
    profileId: str | None = Field(default=None)
    profileName: str | None = Field(default=None)
    deepResponse: dict | None = Field(default=None)
    createdAt: int


class HistoryCollection(BaseModel):
    items: list[HistoryEntry]


class HistoryCreatePayload(BaseModel):
    id: str | None = Field(default=None)
    query: str
    resultSummary: str | None = Field(default=None)
    profileId: str | None = Field(default=None)
    profileName: str | None = Field(default=None)
    deepResponse: dict | None = Field(default=None)
    createdAt: int | None = Field(default=None)

    def to_entry(self) -> HistoryEntry:
        return HistoryEntry(
            id=self.id or uuid4().hex,
            query=self.query,
            resultSummary=self.resultSummary,
            profileId=self.profileId,
            profileName=self.profileName,
            deepResponse=self.deepResponse,
            createdAt=self.createdAt or int(time() * 1000),
        )
