from fastapi import APIRouter, Query
from models.schemas import SearchResult
from crawlers.manager import crawler_manager

router = APIRouter()


@router.get("/search", response_model=list[SearchResult])
async def search_novels(q: str = Query(..., description="搜索关键词")):
    results = await crawler_manager.search_all(q)
    return results