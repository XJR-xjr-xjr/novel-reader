from fastapi import APIRouter, Query, HTTPException
from models.schemas import Chapter
from crawlers.manager import crawler_manager

router = APIRouter()


@router.get("/chapters", response_model=list[Chapter])
async def get_chapters(url: str = Query(..., description="小说页面 URL")):
    chapters = await crawler_manager.get_chapters(url)
    if not chapters:
        raise HTTPException(status_code=404, detail="获取目录失败，URL 无效或站点不可用")
    return chapters