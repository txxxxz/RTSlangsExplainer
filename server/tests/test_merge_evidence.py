from app.schemas.explain import SourceReference
from app.services.merge import merge_sources, rank_sources


def make_source(title: str, credibility: str = 'medium', url: str | None = None) -> SourceReference:
    return SourceReference(
        title=title,
        url=url or f'https://example.com/{title}',
        credibility=credibility,
        excerpt='sample'
    )


def test_merge_sources_deduplicates_by_url():
    first = make_source('Urban')
    duplicate = make_source('Urban', url=first.url)
    second = make_source('Wiki', credibility='high')

    merged = merge_sources([first], [duplicate, second])

    assert len(merged) == 2
    assert merged[0].title == 'Urban'
    assert merged[1].title == 'Wiki'


def test_rank_sources_prioritises_credibility():
    sources = [
        make_source('Low', credibility='low'),
        make_source('High', credibility='high'),
        make_source('Medium', credibility='medium')
    ]

    ranked = rank_sources(sources)
    assert [source.title for source in ranked] == ['High', 'Medium', 'Low']
