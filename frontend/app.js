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
    translations: {},          // 翻訳キャッシュ { index: { title, summary } }
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
    categoryFilter: document.getElementById('category-filter'),
    // モーダル
    readerModal: document.getElementById('reader-modal'),
    modalClose: document.getElementById('modal-close'),
    translateBtn: document.getElementById('translate-btn'),
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
});

// ========== 設定読み込み ==========
async function loadConfig() {
    try {
        const res = await fetch(`${API_BASE}/api/config`);
        state.config = await res.json();
        renderCategoryChips();
        renderCategoryChips();
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



async function handleTranslation() {
    const modalIndex = elements.readerModal.dataset.currentIndex;
    const article = getFilteredArticles()[modalIndex];
    if (!article) return;

    // すでに翻訳済みなら元に戻す（トグル）
    if (article.isTranslated) {
        elements.modalTitle.textContent = article.originalTitle || article.title;
        elements.modalSummary.textContent = article.originalSummary || article.summary;
        article.isTranslated = false;
        elements.translateBtn.querySelector('span').textContent = '翻訳（JP）';
        return;
    }

    // キャッシュをチェック
    const cacheKey = article.url;
    if (state.translations[cacheKey]) {
        applyTranslation(article, state.translations[cacheKey]);
        return;
    }

    // 翻訳API呼び出し
    elements.translateBtn.classList.add('loading');
    elements.translateBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/api/translate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: article.title,
                summary: article.summary
            })
        });

        const translatedData = await response.json();

        // キャッシュに保存
        state.translations[cacheKey] = translatedData;

        applyTranslation(article, translatedData);

    } catch (err) {
        console.error('翻訳エラー:', err);
        alert('翻訳に失敗しました。時間をおいて再度お試しください。');
    } finally {
        elements.translateBtn.classList.remove('loading');
        elements.translateBtn.disabled = false;
    }
}

function applyTranslation(article, data) {
    // オリジナルの内容を保存
    if (!article.originalTitle) article.originalTitle = article.title;
    if (!article.originalSummary) article.originalSummary = article.summary;

    elements.modalTitle.textContent = data.title;
    elements.modalSummary.textContent = data.summary;
    article.isTranslated = true;
    elements.translateBtn.querySelector('span').textContent = '原文を表示';
}

// ========== リーダーモーダル ==========
function openReader(filteredIndex) {
    const filtered = getFilteredArticles();
    const article = filtered[filteredIndex];
    if (!article) return;

    // 現在のインデックスを保持
    elements.readerModal.dataset.currentIndex = filteredIndex;

    elements.modalTitle.textContent = article.isTranslated ? article.originalTitle : article.title;
    elements.modalSource.textContent = article.source;
    elements.modalDate.textContent = formatDate(article.date);
    elements.modalCategory.textContent = getCategoryLabel(article.category);

    // 翻訳状態をリセット（表示上のみ）
    article.isTranslated = false;
    elements.translateBtn.querySelector('span').textContent = '翻訳（JP）';

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

    // 翻訳ボタン
    elements.translateBtn.addEventListener('click', handleTranslation);

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
