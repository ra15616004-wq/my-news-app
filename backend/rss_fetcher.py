# rss_fetcher.py — RSSフィード取得・パース
from __future__ import annotations
import feedparser
from datetime import datetime
from time import mktime
import logging

from config import RSS_FEEDS
from sanitizer import sanitize_article, extract_thumbnail, strip_html

logger = logging.getLogger(__name__)


def parse_date(entry: dict) -> str:
    """RSSエントリから日付をISO 8601形式で取得する"""
    try:
        if "published_parsed" in entry and entry["published_parsed"]:
            return datetime.fromtimestamp(mktime(entry["published_parsed"])).isoformat()
        if "updated_parsed" in entry and entry["updated_parsed"]:
            return datetime.fromtimestamp(mktime(entry["updated_parsed"])).isoformat()
    except Exception:
        pass
    return datetime.now().isoformat()


def fetch_rss_feeds() -> list[dict]:
    """
    設定済みの全RSSフィードを取得し、サニタイズされた記事リストを返す。
    各フィードでエラーが起きても他のフィードの取得は継続する。
    """
    articles = []

    for feed_config in RSS_FEEDS:
        try:
            logger.info(f"RSSフィード取得中: {feed_config['name']} ({feed_config['url']})")
            feed = feedparser.parse(feed_config["url"])

            if feed.bozo and not feed.entries:
                logger.warning(
                    f"RSSパースエラー: {feed_config['name']} - {feed.bozo_exception}"
                )
                continue

            for entry in feed.entries[:10]:  # 各フィードから最大10件
                raw_article = {
                    "title": entry.get("title", ""),
                    "source": feed_config["name"],
                    "date": parse_date(entry),
                    "thumbnail": extract_thumbnail(entry),
                    "summary": strip_html(
                        entry.get("summary", entry.get("description", ""))
                    ),
                    "url": entry.get("link", ""),
                    "type": "rss",
                    "category": feed_config.get("category", "general"),
                }
                articles.append(sanitize_article(raw_article))

        except Exception as e:
            logger.error(f"RSSフィード取得失敗: {feed_config['name']} - {e}")
            continue

    logger.info(f"RSS記事取得完了: {len(articles)}件")
    return articles
