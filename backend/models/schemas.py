from pydantic import BaseModel
from typing import Optional


class SourceInfo(BaseModel):
    site_name: str
    site_url: str
    status: str


class SearchResult(BaseModel):
    title: str
    author: str
    description: str = ""
    sources: list[SourceInfo]


class Chapter(BaseModel):
    index: int
    title: str
    url: str


class ChapterContent(BaseModel):
    title: str
    content: str