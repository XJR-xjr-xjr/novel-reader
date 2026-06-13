from fastapi import APIRouter, Query, HTTPException
from models.schemas import ChapterContent
from crawlers.manager import crawler_manager

router = APIRouter()


@router.get("/chapter/content", response_model=ChapterContent)
async def get_chapter_content(url: str = Query(..., description="章节页面 URL")):
    content = await crawler_manager.get_content(url)
    if not content.content:
        raise HTTPException(status_code=404, detail="获取章节内容失败")
    return content