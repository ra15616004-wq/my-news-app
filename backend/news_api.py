# news_api.py — GNews API連携
from __future__ import annotations
import requests
import logging

from config import GNEWS_API_KEY, GNEWS_BASE_URL, GNEWS_CATEGORIES
from sanitizer import sanitize_article

logger = logging.getLogger(__name__)


def fetch_news_api(category: str = "general", lang: str = "ja", country: str = "jp", max_results: int = 10) -> list[dict]:
    """
    GNews APIからカテゴリ別ニュースを取得する。
    
    Args:
        category: ニュースカテゴリ（general, technology, business等）
        lang: 言語コード（デフォルト: ja）
        max_results: 取得件数（最大10件/リクエスト）
    
    Returns:
        サニタイズされた記事リスト
    """
    if not GNEWS_API_KEY:
        logger.warning("GNEWS_API_KEYが設定されていません。")
        return []

    if category not in GNEWS_CATEGORIES:
        category = "general"

    try:
        url = f"{GNEWS_BASE_URL}/top-headlines"
        params = {
            "category": category,
            "lang": lang,
            "country": country,
            "max": min(max_results, 10),
            "apikey": GNEWS_API_KEY,
        }

        logger.info(f"GNews API呼び出し: カテゴリ={category}, 言語={lang}")
        response = requests.get(url, params=params, timeout=15)
        response.raise_for_status()

        data = response.json()
        articles = []

        for article in data.get("articles", []):
            raw = {
                "title": article.get("title", ""),
                "source": article.get("source", {}).get("name", "不明"),
                "date": article.get("publishedAt", ""),
                "thumbnail": article.get("image", ""),
                "summary": article.get("description", ""),
                "url": article.get("url", ""),
                "type": "api",
                "category": category,
            }
            articles.append(sanitize_article(raw))

        logger.info(f"GNews API記事取得完了: {len(articles)}件 (カテゴリ: {category})")
        return articles

    except requests.exceptions.Timeout:
        logger.error(f"GNews APIタイムアウト: カテゴリ={category}")
        return []
    except requests.exceptions.HTTPError as e:
        logger.error(f"GNews APIエラー: {e.response.status_code} - {e}")
        return []
    except Exception as e:
        logger.error(f"GNews API予期せぬエラー: {e}")
        return []


    if categories is None:
        categories = GNEWS_CATEGORIES

    all_articles = []
    # カテゴリを全部取得（厳選済みなのでそのまま使う）
    for cat in categories:
        articles = fetch_news_api(category=cat, lang=lang)
        all_articles.extend(articles)

    return all_articles



