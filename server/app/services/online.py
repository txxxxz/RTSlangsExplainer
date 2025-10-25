from __future__ import annotations

import re
from typing import List

import httpx

from ..schemas.explain import SourceReference

URBAN_URL = 'https://api.urbandictionary.com/v0/define'
WIKI_URL = 'https://en.wikipedia.org/api/rest_v1/page/summary/'


def extract_keywords(text: str) -> List[str]:
    """Extract potential slang keywords from a sentence."""
    # Remove common stop words and punctuation
    text = text.lower().strip()
    # Remove punctuation except hyphens
    text = re.sub(r'[^\w\s\-]', '', text)
    
    # Common stop words to filter out
    stop_words = {
        'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
        'could', 'may', 'might', 'must', 'can', 'of', 'at', 'by', 'for', 'with',
        'about', 'against', 'between', 'into', 'through', 'during', 'before',
        'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out',
        'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once',
        'here', 'there', 'when', 'where', 'why', 'how', 'all', 'both', 'each',
        'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
        'only', 'own', 'same', 'so', 'than', 'too', 'very', 'you', 'your',
        'yours', 'he', 'him', 'his', 'she', 'her', 'hers', 'it', 'its', 'we',
        'us', 'our', 'ours', 'they', 'them', 'their', 'theirs', 'what', 'which',
        'who', 'whom', 'this', 'that', 'these', 'those', 'i', 'me', 'my', 'mine',
        'am', 'know', 'kind', 'stuff', 'thing', 'things', 'like', 'just', 'really'
    }
    
    words = text.split()
    keywords = [w for w in words if w and w not in stop_words and len(w) > 2]
    
    # Also try bigrams for phrases like "blow off", "hang out"
    bigrams = []
    for i in range(len(words) - 1):
        if words[i] not in stop_words or words[i+1] not in stop_words:
            bigrams.append(f"{words[i]} {words[i+1]}")
    
    return keywords + bigrams


async def fetch_urban_dictionary(query: str) -> List[SourceReference]:
    print(f'[LinguaLens] 正在查询 Urban Dictionary: {query}')
    async with httpx.AsyncClient(timeout=5.0) as client:
        # Try full query first
        response = await client.get(URBAN_URL, params={'term': query})
        response.raise_for_status()
        data = response.json()
        entries = data.get('list', [])
        print(f'[LinguaLens] Urban Dictionary 完整查询返回 {len(entries)} 个条目')
        
        # If no results, try extracting keywords
        if not entries:
            keywords = extract_keywords(query)
            print(f'[LinguaLens] 提取的关键词: {keywords[:3]}')
            for keyword in keywords[:3]:  # Try up to 3 keywords
                response = await client.get(URBAN_URL, params={'term': keyword})
                response.raise_for_status()
                data = response.json()
                entries = data.get('list', [])
                if entries:
                    print(f'[LinguaLens] 关键词 "{keyword}" 查询返回 {len(entries)} 个条目')
                    break
        
        sources: List[SourceReference] = []
        # Sort entries by thumbs_up to get better quality definitions first
        sorted_entries = sorted(
            entries[:10],  # Check top 10 entries
            key=lambda e: e.get('thumbs_up', 0),
            reverse=True
        )
        
        for entry in sorted_entries:
            # Clean up the definition text
            definition = entry.get('definition', '').replace('[', '').replace(']', '').strip()
            
            # Skip definitions that are too short (likely jokes like "Me", "you", etc.)
            if len(definition) < 20:
                print(f'[LinguaLens] 跳过过短的定义: "{definition}"')
                continue
            
            # Skip definitions that are just single words
            if len(definition.split()) < 3:
                print(f'[LinguaLens] 跳过单词定义: "{definition}"')
                continue
            
            if len(definition) > 200:
                definition = definition[:197] + '...'
            
            sources.append(
                SourceReference(
                    title=f"Urban Dictionary: {entry.get('word')}",
                    url=entry.get('permalink', ''),
                    credibility='medium',
                    excerpt=definition
                )
            )
            
            # Stop after finding 2 good sources
            if len(sources) >= 2:
                break
        
        print(f'[LinguaLens] Urban Dictionary 返回 {len(sources)} 个有效来源')
        return sources


async def fetch_wikipedia_summary(query: str) -> List[SourceReference]:
    print(f'[LinguaLens] 正在查询 Wikipedia: {query}')
    
    # Try full query first
    queries_to_try = [query]
    
    # If query is a sentence, also try keywords
    if ' ' in query and len(query.split()) > 3:
        keywords = extract_keywords(query)
        queries_to_try.extend(keywords[:2])
    
    async with httpx.AsyncClient(timeout=5.0) as client:
        for q in queries_to_try:
            safe_query = q.replace(' ', '_')
            response = await client.get(f'{WIKI_URL}{safe_query}')
            if response.status_code == 200:
                data = response.json()
                print(f'[LinguaLens] Wikipedia 查询 "{q}" 成功')
                return [
                    SourceReference(
                        title=data.get('title', q),
                        url=data.get('content_urls', {}).get('desktop', {}).get('page', ''),
                        credibility='high',
                        excerpt=data.get('extract', '')[:200] + ('...' if len(data.get('extract', '')) > 200 else '')
                    )
                ]
        
        print(f'[LinguaLens] Wikipedia 所有查询均无结果')
        return []
