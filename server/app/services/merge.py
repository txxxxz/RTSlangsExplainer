from __future__ import annotations

from typing import Iterable, Sequence

from ..schemas.explain import SourceReference


def merge_sources(*source_groups: Iterable[SourceReference]) -> list[SourceReference]:
    seen = set()
    merged: list[SourceReference] = []
    for group in source_groups:
        for source in group:
            key = (source.url, source.title)
            if key in seen:
                continue
            seen.add(key)
            merged.append(source)
    return merged


def rank_sources(sources: Sequence[SourceReference]) -> list[SourceReference]:
    weight = {'high': 3, 'medium': 2, 'low': 1}
    return sorted(sources, key=lambda src: (-weight.get(src.credibility, 0), src.title))
