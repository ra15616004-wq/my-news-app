# main.py — FastAPI サーバー
from __future__ import annotations

import time
import logging
from pathlib import Path

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from config import CACHE_TTL, GNEWS_CATEGORIES, RSS_FEEDS, TWITTER_ACCOUNTS
from rss_fetcher import fetch_rss_feeds
from news_api import fetch_news_api, fetch_all_categories
from translator import translate_article
from pydantic import BaseModel

# ロギング設定
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# FastAPIアプリケーション
app = FastAPI(
    title="パーソナルニュースダッシュボード",
    description="広告なし自分専用ニュースアグリゲーター",
    version="1.0.0",
)

# リクエストモデル
class TranslationRequest(BaseModel):
    title: str
    summary: str

# CORS設定（ローカル開発用）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === インメモリキャッシュ ===
_cache: dict = {
    "data": None,
    "timestamp": 0,
}


def get_cached_news() -> dict | None:
    """キャッシュが有効ならデータを返す、無効ならNone"""
    if _cache["data"] and (time.time() - _cache["timestamp"] < CACHE_TTL):
        logger.info("キャッシュヒット")
        return _cache["data"]
    return None


def set_cache(data: dict):
    """キャッシュを更新する"""
    _cache["data"] = data
    _cache["timestamp"] = time.time()


def clear_cache():
    """キャッシュをクリアする"""
    _cache["data"] = None
    _cache["timestamp"] = 0


# === APIエンドポイント ===

@app.get("/api/news")
async def get_news(
    source: str = Query(None, description="フィルタ: rss, api, all"),
    category: str = Query(None, description="カテゴリフィルタ"),
    force_refresh: bool = Query(False, description="キャッシュを無視して強制更新"),
):
    """
    ニュース記事を取得するメインエンドポイント。
    source: "rss" | "api" | None(すべて)
    category: GNewsカテゴリまたはRSSカテゴリ
    force_refresh: True ならキャッシュを無視
    """
    # キャッシュチェック（force_refreshでない場合）
    if not force_refresh:
        cached = get_cached_news()
        if cached:
            articles = cached["articles"]
            # フィルタリングのみ適用
            filtered = _filter_articles(articles, source, category)
            return {
                "articles": filtered,
                "total": len(filtered),
                "cached": True,
                "cache_remaining": int(CACHE_TTL - (time.time() - _cache["timestamp"])),
            }

    # 新規取得
    logger.info("ニュース記事を新規取得中...")
    all_articles = []

    try:
        # RSSフィード取得
        rss_articles = fetch_rss_feeds()
        all_articles.extend(rss_articles)
    except Exception as e:
        logger.error(f"RSS取得エラー: {e}")

    try:
        # ニュースAPI取得
        api_articles = fetch_all_categories(GNEWS_CATEGORIES)
        all_articles.extend(api_articles)
    except Exception as e:
        logger.error(f"ニュースAPI取得エラー: {e}")

    # --- 重複削除ロジックを強化 ---
    unique_articles = []
    seen_urls = set()
    seen_titles = set()
    for article in all_articles:
        url = article.get("url")
        title = article.get("title", "").strip()
        
        # URLも完全一致タイトルも見たことがない場合のみ追加
        if url not in seen_urls and title not in seen_titles:
            unique_articles.append(article)
            seen_urls.add(url)
            seen_titles.add(title)
            
    all_articles = unique_articles

    # 日付順でソート（新しい順）
    all_articles.sort(key=lambda x: x.get("date", ""), reverse=True)

    # キャッシュに保存
    set_cache({"articles": all_articles})

    # フィルタリング
    filtered = _filter_articles(all_articles, source, category)

    return {
        "articles": filtered,
        "total": len(filtered),
        "cached": False,
        "cache_remaining": CACHE_TTL,
    }


@app.post("/api/translate")
async def translate_news_content(request: TranslationRequest):
    """
    記事のタイトルとサマリーを日本語に翻訳する。
    """
    logger.info(f"翻訳リクエスト受信: {request.title[:30]}...")
    try:
        translated = translate_article(request.title, request.summary)
        return translated
    except Exception as e:
        logger.error(f"翻訳リミットまたはエラー: {e}")
        return {"title": request.title, "summary": request.summary, "error": str(e)}


@app.get("/api/config")
async def get_config():
    """フロントエンドに設定情報を提供する"""
    return {
        "categories": GNEWS_CATEGORIES,
        "rss_feeds": [{"name": f["name"], "category": f["category"]} for f in RSS_FEEDS],
        "twitter_accounts": TWITTER_ACCOUNTS,
        "cache_ttl": CACHE_TTL,
    }


def _filter_articles(articles: list[dict], source: str = None, category: str = None) -> list[dict]:
    """記事をフィルタリングする"""
    result = articles

    if source and source != "all":
        result = [a for a in result if a.get("type") == source]

    if category and category != "all":
        result = [a for a in result if a.get("category") == category]

    return result


# === フロントエンド静的ファイル配信 ===
frontend_dir = Path(__file__).parent.parent / "frontend"


@app.get("/")
async def serve_index():
    """メインページを返す"""
    return FileResponse(frontend_dir / "index.html")


# 静的ファイル（CSS, JS）
if frontend_dir.exists():
    app.mount("/static", StaticFiles(directory=str(frontend_dir)), name="static")
