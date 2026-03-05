// app.js — ニュースダッシュボード フロントエンドロジック
// =============================================

const API_BASE = window.location.origin;
const COOLDOWN_MS = 10000; // 更新ボタンのクールダウン（10秒）

// 状態管理
const state = {
    articles: [],
    currentFilter: 'all',      // all | rss | api
    currentCategory: 'all',
    config: null,
    isLoading: false,
    lastRefresh: 0,
};

// ========== DOM要素 ==========
const elements = {
    newsGrid: document.getElementById('news-grid'),
    loadingIndicator: document.getElementById('loading-indicator'),
    emptyState: document.getElementById('empty-state'),
    refreshBtn: document.getElementById('refresh-btn'),
    cacheIndicator: document.getElementById('cache-indicator'),
    cacheTimer: document.getElementById('cache-timer'),
    categoryFilter: document.getElementById('category-filter'),
    twitterTabs: document.getElementById('twitter-tabs'),
    twitterContainer: document.getElementById('twitter-embed-container'),
    // モーダル
    readerModal: document.getElementById('reader-modal'),
    modalClose: document.getElementById('modal-close'),
    modalTitle: document.getElementById('modal-title'),
    modalSource: document.getElementById('modal-source'),
    modalDate: document.getElementById('modal-date'),
    modalCategory: document.getElementById('modal-category'),
    modalImage: document.getElementById('modal-image'),
    modalSummary: document.getElementById('modal-summary'),
    modalLink: document.getElementById('modal-link'),
};

// ========== 初期化 ==========
document.addEventListener('DOMContentLoaded', async () => {
    await loadConfig();
    await fetchNews();
    setupEventListeners();
    setupTwitterEmbeds();
});

// ========== 設定読み込み ==========
async function loadConfig() {
    try {
        const res = await fetch(`${API_BASE}/api/config`);
        state.config = await res.json();
        renderCategoryChips();
        renderTwitterTabs();
    } catch (err) {
        console.error('設定読み込みエラー:', err);
    }
}

// ========== ニュース取得 ==========
async function fetchNews(forceRefresh = false) {
    if (state.isLoading) return;

    state.isLoading = true;
    showLoading(true);
    elements.refreshBtn.classList.add('loading');
    elements.refreshBtn.disabled = true;

    try {
        const params = new URLSearchParams();
        if (forceRefresh) params.append('force_refresh', 'true');

        const res = await fetch(`${API_BASE}/api/news?${params}`);
        const data = await res.json();

        state.articles = data.articles || [];
        state.lastRefresh = Date.now();

        // キャッシュ情報の表示
        updateCacheIndicator(data.cached, data.cache_remaining);

        // フィルタリングして表示
        renderArticles();

    } catch (err) {
        console.error('ニュース取得エラー:', err);
        elements.newsGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <p style="color: var(--accent-rose);">ニュースの取得に失敗しました。バックエンドが起動しているか確認してください。</p>
            </div>
        `;
    } finally {
        state.isLoading = false;
        showLoading(false);
        elements.refreshBtn.classList.remove('loading');

        // クールダウン
        setTimeout(() => {
            elements.refreshBtn.disabled = false;
        }, COOLDOWN_MS);
    }
}

// ========== 記事カードの描画 ==========
function renderArticles() {
    const filtered = getFilteredArticles();

    if (filtered.length === 0) {
        elements.newsGrid.innerHTML = '';
        elements.emptyState.classList.remove('hidden');
        return;
    }

    elements.emptyState.classList.add('hidden');

    elements.newsGrid.innerHTML = filtered.map((article, index) => {
        const dateStr = formatDate(article.date);
        const hasThumbnail = article.thumbnail && article.thumbnail.length > 10;

        return `
        <article class="news-card" data-index="${index}" style="animation-delay: ${index * 0.04}s" onclick="openReader(${index})">
            ${hasThumbnail
                ? `<div class="card-thumbnail-wrapper">
                       <img class="card-thumbnail" src="${escapeHtml(article.thumbnail)}" alt="" loading="lazy" onerror="this.parentElement.outerHTML='<div class=\\'card-no-thumbnail\\'></div>'" />
                   </div>`
                : '<div class="card-no-thumbnail"></div>'
            }
            <div class="card-body">
                <div class="card-meta">
                    <span class="card-source">${escapeHtml(article.source)}</span>
                    <span class="card-date">${dateStr}</span>
                    <span class="card-type-badge ${article.type}">${article.type === 'rss' ? 'RSS' : 'API'}</span>
                </div>
                <h3 class="card-title">${escapeHtml(article.title)}</h3>
                <p class="card-summary">${escapeHtml(article.summary)}</p>
            </div>
        </article>
        `;
    }).join('');
}

// ========== フィルタリング ==========
function getFilteredArticles() {
    let articles = state.articles;

    // ソースフィルタ
    if (state.currentFilter !== 'all') {
        articles = articles.filter(a => a.type === state.currentFilter);
    }

    // カテゴリフィルタ
    if (state.currentCategory !== 'all') {
        articles = articles.filter(a => a.category === state.currentCategory);
    }

    return articles;
}

// ========== カテゴリチップの描画 ==========
function renderCategoryChips() {
    if (!state.config) return;

    const chips = ['all', ...state.config.categories].map(cat => {
        const label = cat === 'all' ? '全カテゴリ' : getCategoryLabel(cat);
        return `<button class="chip ${cat === state.currentCategory ? 'active' : ''}" data-category="${cat}">${label}</button>`;
    }).join('');

    elements.categoryFilter.innerHTML = chips;

    // チップクリックイベント
    elements.categoryFilter.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
            state.currentCategory = chip.dataset.category;
            elements.categoryFilter.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            renderArticles();
        });
    });
}

// ========== カテゴリラベル変換 ==========
function getCategoryLabel(cat) {
    const labels = {
        general: '一般',
        world: '世界',
        nation: '国内',
        business: 'ビジネス',
        technology: 'テクノロジー',
        entertainment: 'エンタメ',
        sports: 'スポーツ',
        science: '科学',
        health: '健康',
    };
    return labels[cat] || cat;
}

// ========== X(Twitter) タイムライン ==========
function renderTwitterTabs() {
    if (!state.config || !state.config.twitter_accounts) return;

    elements.twitterTabs.innerHTML = state.config.twitter_accounts.map((acc, i) => {
        return `<button class="twitter-tab ${i === 0 ? 'active' : ''}" data-handle="${acc.handle}" data-index="${i}">@${acc.handle}</button>`;
    }).join('');

    // タブ切替イベント
    elements.twitterTabs.querySelectorAll('.twitter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            elements.twitterTabs.querySelectorAll('.twitter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            loadTwitterTimeline(tab.dataset.handle);
        });
    });
}

function setupTwitterEmbeds() {
    if (!state.config || !state.config.twitter_accounts || state.config.twitter_accounts.length === 0) return;

    // 最初のアカウントのタイムラインを読み込み
    loadTwitterTimeline(state.config.twitter_accounts[0].handle);
}

function loadTwitterTimeline(handle) {
    elements.twitterContainer.innerHTML = `
        <div class="twitter-timeline-wrapper">
            <a class="twitter-timeline" 
               href="https://twitter.com/${handle}"
               data-theme="dark"
               data-chrome="noheader nofooter noborders transparent"
               data-height="600"
               data-width="100%">
                @${handle} のツイート
            </a>
        </div>
    `;

    // Xウィジェットスクリプトを読み込み
    if (window.twttr && window.twttr.widgets) {
        window.twttr.widgets.load(elements.twitterContainer);
    } else {
        const script = document.createElement('script');
        script.src = 'https://platform.twitter.com/widgets.js';
        script.async = true;
        script.charset = 'utf-8';
        script.onload = () => {
            if (window.twttr && window.twttr.widgets) {
                window.twttr.widgets.load(elements.twitterContainer);
            }
        };
        // ウィジェット読み込み失敗時のフォールバック
        script.onerror = () => {
            elements.twitterContainer.innerHTML = `
                <div class="twitter-timeline-wrapper" style="padding: 24px; text-align: center;">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" style="color: var(--text-muted); margin-bottom: 12px;">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                    <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 8px;">Xタイムラインの読み込みに失敗しました</p>
                    <p style="color: var(--text-muted); font-size: 0.72rem;">ブラウザのセキュリティ設定により表示されない場合があります</p>
                    <a href="https://twitter.com/${handle}" target="_blank" rel="noopener noreferrer" 
                       style="display: inline-block; margin-top: 12px; padding: 8px 16px; background: rgba(99,102,241,0.2); color: var(--accent-indigo-light); border-radius: 8px; text-decoration: none; font-size: 0.8rem;">
                        Xで@${handle}を開く ↗
                    </a>
                </div>
            `;
        };
        document.head.appendChild(script);
    }
}

// ========== リーダーモーダル ==========
function openReader(filteredIndex) {
    const filtered = getFilteredArticles();
    const article = filtered[filteredIndex];
    if (!article) return;

    elements.modalTitle.textContent = article.title;
    elements.modalSource.textContent = article.source;
    elements.modalDate.textContent = formatDate(article.date);
    elements.modalCategory.textContent = getCategoryLabel(article.category);

    if (article.thumbnail && article.thumbnail.length > 10) {
        elements.modalImage.src = article.thumbnail;
        elements.modalImage.classList.remove('hidden');
        elements.modalImage.onerror = () => elements.modalImage.classList.add('hidden');
    } else {
        elements.modalImage.classList.add('hidden');
    }

    elements.modalSummary.textContent = article.summary || '概要はありません。';
    elements.modalLink.href = article.url;

    elements.readerModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeReader() {
    elements.readerModal.classList.add('hidden');
    document.body.style.overflow = '';
}

// ========== イベントリスナー ==========
function setupEventListeners() {
    // フィルタータブ
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            state.currentFilter = tab.dataset.filter;
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // カテゴリフィルター表示切替
            if (state.currentFilter === 'api') {
                elements.categoryFilter.classList.remove('hidden');
            } else {
                elements.categoryFilter.classList.add('hidden');
                state.currentCategory = 'all';
            }

            renderArticles();
        });
    });

    // 更新ボタン
    elements.refreshBtn.addEventListener('click', () => {
        fetchNews(true);
    });

    // モーダル閉じる
    elements.modalClose.addEventListener('click', closeReader);
    elements.readerModal.addEventListener('click', (e) => {
        if (e.target === elements.readerModal) closeReader();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeReader();
    });
}

// ========== キャッシュインジケーター ==========
function updateCacheIndicator(isCached, remaining) {
    if (isCached && remaining > 0) {
        elements.cacheIndicator.classList.remove('hidden');
        elements.cacheTimer.textContent = remaining;

        // カウントダウン
        const interval = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                elements.cacheIndicator.classList.add('hidden');
                clearInterval(interval);
            } else {
                elements.cacheTimer.textContent = remaining;
            }
        }, 1000);
    } else {
        elements.cacheIndicator.classList.add('hidden');
    }
}

// ========== ユーティリティ ==========
function showLoading(show) {
    if (show) {
        elements.loadingIndicator.classList.remove('hidden');
        elements.newsGrid.classList.add('hidden');
        elements.emptyState.classList.add('hidden');
    } else {
        elements.loadingIndicator.classList.add('hidden');
        elements.newsGrid.classList.remove('hidden');
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffMin = Math.floor(diffMs / 60000);
        const diffHr = Math.floor(diffMs / 3600000);
        const diffDay = Math.floor(diffMs / 86400000);

        if (diffMin < 1) return 'たった今';
        if (diffMin < 60) return `${diffMin}分前`;
        if (diffHr < 24) return `${diffHr}時間前`;
        if (diffDay < 7) return `${diffDay}日前`;

        return date.toLocaleDateString('ja-JP', {
            month: 'short',
            day: 'numeric',
        });
    } catch {
        return dateStr;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// グローバル関数として公開（onclickから呼ばれるため）
window.openReader = openReader;
