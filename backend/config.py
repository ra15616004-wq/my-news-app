# config.py — 設定管理
import os
from dotenv import load_dotenv

# .envファイルから環境変数を読み込み
load_dotenv()

# GNews APIキー
GNEWS_API_KEY = os.getenv("GNEWS_API_KEY", "")
GNEWS_BASE_URL = "https://gnews.io/api/v4"

# キャッシュTTL（秒）
CACHE_TTL = 300  # 5分

# GNewsカテゴリ一覧
GNEWS_CATEGORIES = [
    "general",
    "world",
    "nation",
    "business",
    "technology",
    "entertainment",
    "sports",
    "science",
    "health",
]

# デフォルトRSSフィード
RSS_FEEDS = [
    {
        "name": "TechCrunch",
        "url": "https://techcrunch.com/feed/",
        "category": "technology",
    },
    {
        "name": "The Verge",
        "url": "https://www.theverge.com/rss/index.xml",
        "category": "technology",
    },
    {
        "name": "Hacker News (Best)",
        "url": "https://hnrss.org/best",
        "category": "technology",
    },
    {
        "name": "NHK ニュース",
        "url": "https://www3.nhk.or.jp/rss/news/cat0.xml",
        "category": "general",
    },
    {
        "name": "はてなブックマーク (テクノロジー)",
        "url": "https://b.hatena.ne.jp/hotentry/it.rss",
        "category": "technology",
    },
]

# X(Twitter) 埋め込みアカウント
TWITTER_ACCOUNTS = [
    {"handle": "naboron", "label": "テック系ニュース"},
    {"handle": "googlejapan", "label": "Google Japan"},
]
