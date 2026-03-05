# sanitizer.py — コンテンツサニタイズ処理
import re
from bs4 import BeautifulSoup
from datetime import datetime


def strip_html(html_text: str) -> str:
    """HTMLタグを除去し、プレーンテキストを返す"""
    if not html_text:
        return ""
    soup = BeautifulSoup(html_text, "html.parser")
    # スクリプトとスタイルタグを完全除去
    for tag in soup(["script", "style", "iframe", "noscript"]):
        tag.decompose()
    text = soup.get_text(separator=" ", strip=True)
    # 余分な空白を正規化
    text = re.sub(r"\s+", " ", text).strip()
    return text


def extract_thumbnail(entry: dict) -> str:
    """
    RSSエントリからサムネイル画像URLを抽出する。
    様々なRSSフォーマットに対応。
    """
    # media:thumbnail
    if "media_thumbnail" in entry and entry["media_thumbnail"]:
        return entry["media_thumbnail"][0].get("url", "")

    # media:content
    if "media_content" in entry and entry["media_content"]:
        for media in entry["media_content"]:
            if media.get("medium") == "image" or "image" in media.get("type", ""):
                return media.get("url", "")

    # enclosure
    if "links" in entry:
        for link in entry["links"]:
            if link.get("type", "").startswith("image"):
                return link.get("href", "")

    # HTMLコンテンツ内の最初の画像
    content = entry.get("content", [{}])
    if content and isinstance(content, list):
        html = content[0].get("value", "")
    else:
        html = entry.get("summary", "")

    if html:
        soup = BeautifulSoup(html, "html.parser")
        img = soup.find("img")
        if img and img.get("src"):
            src = img["src"]
            # データURIやトラッキングピクセルを除外
            if not src.startswith("data:") and len(src) > 20:
                return src

    return ""


def remove_tracking_params(url: str) -> str:
    """URLからトラッキングパラメータを除去する"""
    if not url:
        return url
    # よくあるトラッキングパラメータ
    tracking_params = [
        "utm_source", "utm_medium", "utm_campaign", "utm_term",
        "utm_content", "ref", "source", "fbclid", "gclid",
    ]
    try:
        from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
        parsed = urlparse(url)
        params = parse_qs(parsed.query)
        cleaned = {k: v for k, v in params.items() if k.lower() not in tracking_params}
        cleaned_query = urlencode(cleaned, doseq=True)
        return urlunparse(parsed._replace(query=cleaned_query))
    except Exception:
        return url


def sanitize_article(raw: dict) -> dict:
    """
    記事データを統一フォーマットにサニタイズする。
    出力形式:
    {
        "title": str,
        "source": str,
        "date": str (ISO 8601),
        "thumbnail": str,
        "summary": str,
        "url": str,
        "type": str ("rss" or "api"),
        "category": str
    }
    """
    return {
        "title": strip_html(raw.get("title", "タイトルなし")),
        "source": raw.get("source", "不明"),
        "date": raw.get("date", datetime.now().isoformat()),
        "thumbnail": raw.get("thumbnail", ""),
        "summary": strip_html(raw.get("summary", "")),
        "url": remove_tracking_params(raw.get("url", "")),
        "type": raw.get("type", "rss"),
        "category": raw.get("category", "general"),
    }
