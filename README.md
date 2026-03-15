# News Hub — パーソナルニュースダッシュボード

自分専用の広告なしニュース。RSS・API情報を統合＆自動翻訳。Renderで世界中から確認可能。

## セットアップ

### 1. 仮想環境の有効化

```bash
cd backend
source venv/bin/activate
```

### 2. GNews APIキーの設定（オプション）

https://gnews.io で無料アカウントを作成し、`backend/.env` にキーを設定：

```
GNEWS_API_KEY=your_api_key_here
```

※ 未設定でもRSSフィードとデモデータで動作します。

### 3. 起動

```bash
cd backend
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

ブラウザで http://localhost:8001 を開く。

## 技術スタック

- **バックエンド**: Python / FastAPI
- **フロントエンド**: HTML / CSS / Vanilla JS
- **データソース**: RSS (feedparser) + GNews API + X埋め込み
