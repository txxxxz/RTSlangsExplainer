from __future__ import annotations

from typing import List

import httpx

from ..schemas.explain import SourceReference

URBAN_URL = 'https://api.urbandictionary.com/v0/define'
WIKI_URL = 'https://en.wikipedia.org/api/rest_v1/page/summary/'


async def fetch_urban_dictionary(query: str) -> List[SourceReference]:
    async with httpx.AsyncClient(timeout=5.0) as client:
        response = await client.get(URBAN_URL, params={'term': query})
        response.raise_for_status()
        data = response.json()
        entries = data.get('list', [])
        sources: List[SourceReference] = []
        for entry in entries[:2]:
            sources.append(
                SourceReference(
                    title=f"Urban Dictionary: {entry.get('word')}",
                    url=entry.get('permalink', ''),
                    credibility='medium',
                    excerpt=entry.get('definition', '')
                )
            )
        return sources


async def fetch_wikipedia_summary(query: str) -> List[SourceReference]:
    safe_query = query.replace(' ', '_')
    async with httpx.AsyncClient(timeout=5.0) as client:
        response = await client.get(f'{WIKI_URL}{safe_query}')
        if response.status_code != 200:
            return []
        data = response.json()
        return [
            SourceReference(
                title=data.get('title', query),
                url=data.get('content_urls', {}).get('desktop', {}).get('page', ''),
                credibility='high',
                excerpt=data.get('extract', '')
            )
        ]
