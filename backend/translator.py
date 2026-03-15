# translator.py — 翻訳処理
from __future__ import annotations
from deep_translator import GoogleTranslator
import logging

logger = logging.getLogger(__name__)

def translate_text(text: str, target_lang: str = "ja") -> str:
    """
    テキストを翻訳する。
    
    Args:
        text: 翻訳対象のテキスト
        target_lang: ターゲット言語 (デフォルト: 日本語)
        
    Returns:
        翻訳後のテキスト。失敗した場合は元のテキストを返す。
    """
    if not text or not text.strip():
        return text
        
    try:
        # 1回のリクエスト制限を考慮して最大2000文字程度に制限
        truncated_text = text[:2000]
        translated = GoogleTranslator(source='auto', target=target_lang).translate(truncated_text)
        return translated
    except Exception as e:
        logger.error(f"翻訳エラー: {e}")
        return text

def translate_article(title: str, summary: str, target_lang: str = "ja") -> dict[str, str]:
    """
    記事のタイトルとサマリーを一括で翻訳する。
    """
    translated_title = translate_text(title, target_lang)
    translated_summary = translate_text(summary, target_lang)
    
    return {
        "title": translated_title,
        "summary": translated_summary
    }
