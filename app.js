/**
 * 政府採購法 AI 法律智慧檢索系統 - 前端核心邏輯
 * 
 * 採用分塊非同步背景載入 (Chunk Lazy Loading) 技術與 RAG AI 律師諮詢引擎
 */

// === 全域狀態管理 ===
let allData = [];            // 目前搜尋作用中的原始資料
let allRulingsData = [];     // 背景載入的所有函釋資料
let allErrorsData = [];      // 背景載入的所有錯誤態樣資料
let allJudgmentsData = [];   // 背景載入的所有裁判書資料
let filteredData = [];       // 符合目前篩選條件的資料
let currentPage = 1;         // 目前分頁頁碼 (1-based)
let itemsPerPage = 20;       // 每頁顯示筆數
let currentDatabase = 'rulings'; // 當前資料庫：'rulings'、'errors' 或 'judgments'
let currentTab = 'pcc';      // 當前頁籤：'pcc'、'judgments' 或 'ai-lawyer'

let totalChunks = 0;         // 函釋資料區塊總數
let loadedChunks = 0;        // 已載入函釋區塊數
let manifest = null;         // 存放 manifest 資訊

let errorTotalChunks = 0;    // 錯誤態樣區塊總數
let errorLoadedChunks = 0;   // 已載入錯誤態樣區塊數
let errorManifest = null;    // 存放錯誤態樣 manifest 資訊

let judgmentTotalChunks = 0; // 裁判書區塊總數
let judgmentLoadedChunks = 0;// 已載入裁判書區塊數
let judgmentManifest = null; // 存放裁判書 manifest 資訊

let geminiApiKey = localStorage.getItem('gemini_api_key') || '';

// AI 互動對答區全域狀態
let aiChatHistory = [];       // 儲存對話歷程 (符合 Gemini API contents 規範)
let lastRetrievedDocs = null;  // 快取前次檢索結果
let lastAiPromptText = '';    // 快取前次產生的 RAG prompt 文字

// 搜尋條件快取
const searchCriteria = {
    docNum: '',
    article: '',
    date: '',
    title: '',
    content: '',
    // 裁判書獨有欄位
    caseNum: '',
    court: ''
};

// === DOM 元素選取 ===
const resultsContainer = document.getElementById('results-container');
const resultsCount = document.getElementById('results-count');
const filterStatus = document.getElementById('filter-status');
const perPageSelect = document.getElementById('per-page-select');
const paginationContainer = document.getElementById('pagination-container');
const themeToggleBtn = document.getElementById('theme-toggle');
const loadingWidget = document.getElementById('loading-widget');
const loadingStatusText = document.getElementById('loading-status-text');
const progressBar = document.getElementById('progress-bar');

// Tabs DOM 元素
const tabPcc = document.getElementById('tab-pcc');
const tabJudgments = document.getElementById('tab-judgments');
const tabAiLawyer = document.getElementById('tab-ai-lawyer');

// Search Containers
const pccSearchContainer = document.getElementById('pcc-search-container');
const judgmentsSearchContainer = document.getElementById('judgments-search-container');
const aiLawyerSearchContainer = document.getElementById('ai-lawyer-search-container');

// Forms & Reset Buttons
const pccSearchForm = document.getElementById('pcc-search-form');
const judgmentsSearchForm = document.getElementById('judgments-search-form');
const btnPccReset = document.getElementById('btn-pcc-reset');
const btnJudgmentsReset = document.getElementById('btn-judgments-reset');

// AI 大律師 DOM 元素
const aiQuestionInput = document.getElementById('ai-question');
const btnAiSubmit = document.getElementById('btn-ai-submit');
const aiGuideContainer = document.getElementById('ai-guide-container');

// API Modal Elements
const apiKeyConfigBtn = document.getElementById('api-key-config');
const apiModal = document.getElementById('api-modal');
const modalClose = document.getElementById('modal-close');
const apiKeyInput = document.getElementById('api-key-input');
const btnSaveKey = document.getElementById('btn-save-key');

// Database Toggle Buttons inside Tab 1
const dbBtnRulings = document.getElementById('db-btn-rulings');
const dbBtnErrors = document.getElementById('db-btn-errors');

// === 初始化設定 ===
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadManifest();
    loadErrorManifest();
    loadJudgmentManifest();
    setupEventListeners();
});

// === 主題切換 (Dark/Light Theme) ===
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
        document.documentElement.setAttribute('data-theme', systemPrefersDark ? 'dark' : 'light');
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}

// === 事件監聽器設定 ===
function setupEventListeners() {
    // 主題切換
    themeToggleBtn.addEventListener('click', toggleTheme);

    // 搜尋表單提交
    pccSearchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        performSearch();
    });

    judgmentsSearchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        performSearch();
    });

    // 表單重設
    btnPccReset.addEventListener('click', () => {
        pccSearchForm.reset();
        aiGuideContainer.innerHTML = ''; // 清除 AI 意見書
        performSearch(); 
    });

    btnJudgmentsReset.addEventListener('click', () => {
        judgmentsSearchForm.reset();
        aiGuideContainer.innerHTML = '';
        performSearch();
    });

    // 每頁筆數變更
    perPageSelect.addEventListener('change', (e) => {
        itemsPerPage = parseInt(e.target.value, 10);
        currentPage = 1;
        renderResults();
    });

    // Tab 切換
    tabPcc.addEventListener('click', () => switchTab('pcc'));
    tabJudgments.addEventListener('click', () => switchTab('judgments'));
    tabAiLawyer.addEventListener('click', () => switchTab('ai-lawyer'));

    // API Modal 開關與儲存
    apiKeyConfigBtn.addEventListener('click', openApiModal);
    modalClose.addEventListener('click', closeApiModal);
    btnSaveKey.addEventListener('click', saveApiKey);
    
    // 點擊 Modal 外部也可關閉
    apiModal.addEventListener('click', (e) => {
        if (e.target === apiModal) closeApiModal();
    });

    // AI 大律師諮詢提交
    btnAiSubmit.addEventListener('click', handleAiLawyerConsult);

    // 資料庫切換鈕監聽
    if (dbBtnRulings && dbBtnErrors) {
        dbBtnRulings.addEventListener('click', () => switchDatabase('rulings'));
        dbBtnErrors.addEventListener('click', () => switchDatabase('errors'));
    }
}

// === 資料載入機制 ===
async function loadManifest() {
    try {
        const response = await fetch('data/manifest.json');
        if (!response.ok) throw new Error('無法載入 manifest.json');
        
        manifest = await response.json();
        totalChunks = manifest.total_chunks;
        
        loadChunksSequentially(manifest.chunks);
    } catch (err) {
        console.error('載入函釋索引失敗：', err);
        loadingStatusText.textContent = '資料載入錯誤';
        loadingWidget.classList.add('error');
    }
}

async function loadChunksSequentially(chunks) {
    for (const chunk of chunks) {
        try {
            const response = await fetch(chunk.filename);
            if (!response.ok) throw new Error(`無法載入區塊: ${chunk.filename}`);
            
            const chunkData = await response.json();
            allRulingsData = allRulingsData.concat(chunkData);
            loadedChunks++;
            
            if (currentDatabase === 'rulings') {
                allData = allRulingsData;
                refreshSearchResultsSilently();
            }
            
            updateLoadingProgress();
            await new Promise(resolve => setTimeout(resolve, 30));
        } catch (err) {
            console.error(`載入區塊 ${chunk.id} 失敗:`, err);
            totalChunks--;
            updateLoadingProgress();
        }
    }
}

async function loadErrorManifest() {
    try {
        const response = await fetch('data/error_manifest.json');
        if (!response.ok) throw new Error('無法載入 error_manifest.json');
        
        errorManifest = await response.json();
        errorTotalChunks = errorManifest.total_chunks;
        
        loadErrorChunksSequentially(errorManifest.chunks);
    } catch (err) {
        console.error('載入錯誤態樣索引失敗：', err);
    }
}

async function loadErrorChunksSequentially(chunks) {
    for (const chunk of chunks) {
        try {
            const response = await fetch(chunk.filename);
            if (!response.ok) throw new Error(`無法載入錯誤區塊: ${chunk.filename}`);
            
            const chunkData = await response.json();
            allErrorsData = allErrorsData.concat(chunkData);
            errorLoadedChunks++;
            
            if (currentDatabase === 'errors') {
                allData = allErrorsData;
                refreshSearchResultsSilently();
            }
            
            updateLoadingProgress();
            await new Promise(resolve => setTimeout(resolve, 30));
        } catch (err) {
            console.error(`載入錯誤區塊 ${chunk.id} 失敗:`, err);
            errorTotalChunks--;
            updateLoadingProgress();
        }
    }
}

// 載入裁判書索引與分塊
async function loadJudgmentManifest() {
    try {
        const response = await fetch('data/judgment_manifest.json');
        if (!response.ok) throw new Error('無法載入 judgment_manifest.json');
        
        judgmentManifest = await response.json();
        judgmentTotalChunks = judgmentManifest.total_chunks;
        
        loadJudgmentChunksSequentially(judgmentManifest.chunks);
    } catch (err) {
        console.error('載入裁判書索引失敗：', err);
    }
}

async function loadJudgmentChunksSequentially(chunks) {
    for (const chunk of chunks) {
        try {
            const response = await fetch(chunk.filename);
            if (!response.ok) throw new Error(`無法載入裁判書區塊: ${chunk.filename}`);
            
            const chunkData = await response.json();
            allJudgmentsData = allJudgmentsData.concat(chunkData);
            judgmentLoadedChunks++;
            
            if (currentDatabase === 'judgments') {
                allData = allJudgmentsData;
                refreshSearchResultsSilently();
            }
            
            updateLoadingProgress();
            await new Promise(resolve => setTimeout(resolve, 30));
        } catch (err) {
            console.error(`載入裁判書區塊 ${chunk.id} 失敗:`, err);
            judgmentTotalChunks--;
            updateLoadingProgress();
        }
    }
}

// 切換作用中的資料庫
function switchDatabase(dbType) {
    if (currentDatabase === dbType) return;
    
    currentDatabase = dbType;
    if (dbType === 'rulings') {
        dbBtnRulings.classList.add('active');
        dbBtnErrors.classList.remove('active');
        allData = allRulingsData;
    } else if (dbType === 'errors') {
        dbBtnRulings.classList.remove('active');
        dbBtnErrors.classList.add('active');
        allData = allErrorsData;
    } else if (dbType === 'judgments') {
        allData = allJudgmentsData;
    }
    
    updateLoadingProgress();
    performSearch();
}

function updateLoadingProgress() {
    const total = totalChunks + errorTotalChunks + judgmentTotalChunks;
    const loaded = loadedChunks + errorLoadedChunks + judgmentLoadedChunks;
    
    const percentage = total > 0 ? Math.round((loaded / total) * 100) : 0;
    progressBar.style.width = `${percentage}%`;
    
    if (loaded === total && total > 0) {
        loadingWidget.classList.remove('loading');
        loadingWidget.classList.add('complete');
        loadingStatusText.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px; vertical-align: middle;"><polyline points="20 6 9 17 4 12"/></svg>
            資料庫全部就緒
        `;
    } else {
        loadingStatusText.textContent = `背景加載中 (${loaded}/${total})`;
    }
}

// === 頁籤切換邏輯 ===
function switchTab(tabType) {
    currentTab = tabType;
    
    tabPcc.classList.remove('active');
    tabJudgments.classList.remove('active');
    tabAiLawyer.classList.remove('active');
    
    pccSearchContainer.classList.add('d-none');
    judgmentsSearchContainer.classList.add('d-none');
    aiLawyerSearchContainer.classList.add('d-none');
    
    if (tabType === 'pcc') {
        tabPcc.classList.add('active');
        pccSearchContainer.classList.remove('d-none');
        const activeBtn = dbBtnRulings.classList.contains('active') ? 'rulings' : 'errors';
        switchDatabase(activeBtn);
    } else if (tabType === 'judgments') {
        tabJudgments.classList.add('active');
        judgmentsSearchContainer.classList.remove('d-none');
        switchDatabase('judgments');
    } else {
        tabAiLawyer.classList.add('active');
        aiLawyerSearchContainer.classList.remove('d-none');
        // AI 律師諮詢模式下，點擊切換不執行一般列表搜尋渲染
    }
}

// === 搜尋篩選演算法 ===
function performSearch() {
    if (currentTab === 'pcc') {
        searchCriteria.docNum = document.getElementById('search-doc-num').value.trim();
        searchCriteria.article = document.getElementById('search-article').value.trim();
        searchCriteria.date = document.getElementById('search-date').value.trim();
        searchCriteria.title = document.getElementById('search-title').value.trim();
        searchCriteria.content = document.getElementById('search-content').value.trim();
    } else if (currentTab === 'judgments') {
        searchCriteria.caseNum = document.getElementById('search-case-num').value.trim();
        searchCriteria.court = document.getElementById('search-court').value.trim();
        searchCriteria.article = document.getElementById('search-judgment-article').value.trim();
        searchCriteria.title = document.getElementById('search-judgment-title').value.trim();
        searchCriteria.content = document.getElementById('search-judgment-content').value.trim();
    }

    const activeFilters = [];
    if (currentTab === 'pcc') {
        if (searchCriteria.docNum) activeFilters.push(`發文字號: "${searchCriteria.docNum}"`);
        if (searchCriteria.article) activeFilters.push(`條文: "${searchCriteria.article}"`);
        if (searchCriteria.date) activeFilters.push(`日期: "${searchCriteria.date}"`);
        if (searchCriteria.title) activeFilters.push(`主題: "${searchCriteria.title}"`);
        if (searchCriteria.content) activeFilters.push(`內文: "${searchCriteria.content}"`);
    } else if (currentTab === 'judgments') {
        if (searchCriteria.caseNum) activeFilters.push(`案號: "${searchCriteria.caseNum}"`);
        if (searchCriteria.court) activeFilters.push(`法院: "${searchCriteria.court}"`);
        if (searchCriteria.article) activeFilters.push(`條文: "${searchCriteria.article}"`);
        if (searchCriteria.title) activeFilters.push(`主文: "${searchCriteria.title}"`);
        if (searchCriteria.content) activeFilters.push(`理由: "${searchCriteria.content}"`);
    }

    if (activeFilters.length > 0) {
        filterStatus.textContent = `篩選條件: ${activeFilters.join(' & ')}`;
    } else {
        filterStatus.textContent = '顯示全部';
    }

    executeFilter();
    currentPage = 1;
    renderResults();
}

function refreshSearchResultsSilently() {
    executeFilter();
    renderResults(true);
}

function executeFilter() {
    if (currentDatabase === 'judgments') {
        const { caseNum, court, article, title, content } = searchCriteria;
        filteredData = allJudgmentsData.filter(item => {
            if (caseNum && (!item.案號 || !item.案號.toLowerCase().includes(caseNum.toLowerCase()))) return false;
            if (court && (!item.裁判法院 || !item.裁判法院.toLowerCase().includes(court.toLowerCase()))) return false;
            if (article) {
                if (!item.依據採購法條文) return false;
                const cleanArticle = article.replace(/\s+/g, '').toLowerCase();
                const cleanItemArticle = item.依據採購法條文.replace(/\s+/g, '').toLowerCase();
                if (!cleanItemArticle.includes(cleanArticle)) return false;
            }
            if (title && (!item.裁判主文 || !item.裁判主文.toLowerCase().includes(title.toLowerCase()))) return false;
            if (content && (!item.內容 || !item.內容.toLowerCase().includes(content.toLowerCase()))) return false;
            return true;
        });
    } else {
        const { docNum, article, date, title, content } = searchCriteria;
        filteredData = allData.filter(item => {
            if (docNum && (!item.發文字號 || !item.發文字號.toLowerCase().includes(docNum.toLowerCase()))) return false;
            if (article) {
                if (!item.依據採購法條文) return false;
                const cleanArticle = article.replace(/\s+/g, '').toLowerCase();
                const cleanItemArticle = item.依據採購法條文.replace(/\s+/g, '').toLowerCase();
                if (!cleanItemArticle.includes(cleanArticle)) return false;
            }
            if (date && (!item.發文日期 || !item.發文日期.startsWith(date))) return false;
            if (title) {
                if (!item.主題) return false;
                const keywords = title.toLowerCase().split(/\s+/).filter(Boolean);
                const matches = keywords.every(kw => item.主題.toLowerCase().includes(kw));
                if (!matches) return false;
            }
            if (content) {
                if (!item.內容) return false;
                const keywords = content.toLowerCase().split(/\s+/).filter(Boolean);
                const matches = keywords.every(kw => item.內容.toLowerCase().includes(kw));
                if (!matches) return false;
            }
            return true;
        });
    }
}

// === 渲染搜尋結果 ===
function renderResults(keepPage = false) {
    if (!keepPage) {
        resultsContainer.scrollTop = 0;
    }

    const totalCount = filteredData.length;
    resultsCount.textContent = `共 ${totalCount} 筆資料`;

    if (allData.length === 0) {
        resultsContainer.innerHTML = `
            <div class="skeleton-loader">
                <div class="skeleton-card"></div>
                <div class="skeleton-card"></div>
                <div class="skeleton-card"></div>
            </div>
        `;
        paginationContainer.innerHTML = '';
        return;
    }

    if (totalCount === 0) {
        resultsContainer.innerHTML = `
            <div class="empty-state">
                <svg class="empty-state-icon" xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/></svg>
                <h3>查無符合條件的項目</h3>
                <p>請嘗試放寬或修改您的檢索關鍵字，或確認背景資料是否已下載完畢。</p>
            </div>
        `;
        paginationContainer.innerHTML = '';
        return;
    }

    const totalPages = Math.ceil(totalCount / itemsPerPage);
    if (currentPage > totalPages) currentPage = totalPages || 1;
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalCount);
    
    const pageData = filteredData.slice(startIndex, endIndex);

    resultsContainer.innerHTML = '';
    
    pageData.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.id = item.項次;

        const isAbolished = item.廢止或補充之備註 && item.廢止或補充之備註.trim().length > 0;
        const statusBadge = isAbolished 
            ? `<span class="meta-item meta-status-abolished">有變更/廢止說明</span>`
            : (currentDatabase === 'judgments' ? '' : `<span class="meta-item meta-status-active">有效</span>`);

        let sourceBadge = '';
        if (item.資料來源) {
            const isError = item.資料來源.includes('錯誤');
            const isJudgment = item.資料來源.includes('裁判');
            const badgeClass = isJudgment ? 'meta-source-judgment' : (isError ? 'meta-source-error' : 'meta-source');
            sourceBadge = `<span class="meta-item ${badgeClass}">${escapeHtml(item.資料來源)}</span>`;
        }

        let displayTitle = escapeHtml(item.主題 || '');
        const activeTitleKw = currentDatabase === 'judgments' ? searchCriteria.title : searchCriteria.title;
        if (activeTitleKw) {
            displayTitle = highlightKeyword(displayTitle, activeTitleKw);
        }

        const rawDate = item.發文日期 || '';
        let displayDate = rawDate;
        if (rawDate.length === 7) {
            displayDate = `民國 ${rawDate.slice(0, 3)}/${rawDate.slice(3, 5)}/${rawDate.slice(5, 7)}`;
        } else if (rawDate.length === 6) {
            displayDate = `民國 ${rawDate.slice(0, 2)}/${rawDate.slice(2, 4)}/${rawDate.slice(4, 6)}`;
        }

        let bodyHtml = '';
        if (currentDatabase === 'judgments') {
            bodyHtml = `
                <div class="card-body-content">
                    <div class="content-block">
                        <div class="content-block-title">裁判主文</div>
                        <div class="content-text" style="font-weight: 500; color: var(--text-primary);">${escapeHtml(item.裁判主文 || '無主文記錄')}</div>
                    </div>
                    <div class="content-block">
                        <div class="content-block-title">判決理由精簡</div>
                        <div class="content-text">${formatAndHighlightContent(item.內容, searchCriteria.content)}</div>
                    </div>
                    <div class="source-link-container">
                        <a href="${item.連結網址}" target="_blank" rel="noopener noreferrer" class="link-btn">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                            前往司法院法學資料檢索系統
                        </a>
                    </div>
                </div>
            `;
        } else {
            bodyHtml = `
                <div class="card-body-content">
                    <div class="content-block">
                        <div class="content-block-title">函釋主旨與說明</div>
                        <div class="content-text">${formatAndHighlightContent(item.內容, searchCriteria.content)}</div>
                    </div>
                    ${isAbolished ? `
                    <div class="content-block">
                        <div class="content-block-title" style="border-left-color: var(--accent-danger);">廢止或補充之備註</div>
                        <div class="content-text" style="color: var(--accent-warning);">${escapeHtml(item.廢止或補充之備註)}</div>
                    </div>
                    ` : ''}
                    <div class="source-link-container">
                        <a href="${item.連結網址}" target="_blank" rel="noopener noreferrer" class="link-btn">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                            前往工程會原始連結
                        </a>
                    </div>
                </div>
            `;
        }

        const docNumLabel = currentDatabase === 'judgments' ? (item.案號 || '無案號') : (item.發文字號 || '無發文字號');

        card.innerHTML = `
            <div class="card-header">
                <div class="card-summary-left">
                    <div class="card-meta-row">
                        ${sourceBadge}
                        <span class="meta-item meta-doc-num">${escapeHtml(docNumLabel)}</span>
                        <span class="meta-item meta-article">${escapeHtml(item.依據採購法條文 || '政府採購法綜合')}</span>
                        <span class="meta-item meta-date">${displayDate}</span>
                        ${statusBadge}
                    </div>
                    <div class="card-title">${displayTitle}</div>
                </div>
                <div class="card-chevron">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </div>
            </div>
            <div class="card-body">
                ${bodyHtml}
            </div>
        `;

        card.querySelector('.card-header').addEventListener('click', () => {
            const isExpanded = card.classList.contains('expanded');
            document.querySelectorAll('.card.expanded').forEach(c => {
                if (c !== card) {
                    c.classList.remove('expanded');
                    c.querySelector('.card-body').style.maxHeight = null;
                }
            });
            
            if (isExpanded) {
                card.classList.remove('expanded');
                card.querySelector('.card-body').style.maxHeight = null;
            } else {
                card.classList.add('expanded');
                const body = card.querySelector('.card-body');
                body.style.maxHeight = body.scrollHeight + 'px';
            }
        });

        resultsContainer.appendChild(card);
    });

    renderPagination(totalPages);
}

// === 分頁按鈕渲染器 ===
function renderPagination(totalPages) {
    paginationContainer.innerHTML = '';
    if (totalPages <= 1) return;

    const prevBtn = document.createElement('button');
    prevBtn.className = `pagination-btn ${currentPage === 1 ? 'disabled' : ''}`;
    prevBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
    if (currentPage > 1) {
        prevBtn.addEventListener('click', () => {
            currentPage--;
            renderResults();
        });
    }
    paginationContainer.appendChild(prevBtn);

    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    if (startPage > 1) {
        addPageBtn(1);
        if (startPage > 2) {
            const ellipsis = document.createElement('span');
            ellipsis.className = 'pagination-ellipsis';
            ellipsis.textContent = '...';
            paginationContainer.appendChild(ellipsis);
        }
    }

    for (let p = startPage; p <= endPage; p++) {
        addPageBtn(p);
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            const ellipsis = document.createElement('span');
            ellipsis.className = 'pagination-ellipsis';
            ellipsis.textContent = '...';
            paginationContainer.appendChild(ellipsis);
        }
        addPageBtn(totalPages);
    }

    const nextBtn = document.createElement('button');
    nextBtn.className = `pagination-btn ${currentPage === totalPages ? 'disabled' : ''}`;
    nextBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
    if (currentPage < totalPages) {
        nextBtn.addEventListener('click', () => {
            currentPage++;
            renderResults();
        });
    }
    paginationContainer.appendChild(nextBtn);
}

function addPageBtn(pageNumber) {
    const btn = document.createElement('button');
    btn.className = `pagination-btn ${currentPage === pageNumber ? 'active' : ''}`;
    btn.textContent = pageNumber;
    btn.addEventListener('click', () => {
        currentPage = pageNumber;
        renderResults();
    });
    paginationContainer.appendChild(btn);
}

// === 工具與輔助函式 ===
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function highlightKeyword(text, keyword) {
    if (!keyword) return text;
    let highlightedText = text;
    const keywords = keyword.split(/\s+/).filter(Boolean).sort((a, b) => b.length - a.length);
    
    keywords.forEach(kw => {
        if (kw.length === 0) return;
        const escapedKeyword = kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`(${escapedKeyword})(?![^<>]*>)`, 'gi');
        highlightedText = highlightedText.replace(regex, '<span class="search-highlight">$1</span>');
    });
    return highlightedText;
}

function formatAndHighlightContent(rawContent, keyword) {
    if (!rawContent) return '無內容';
    let formatted = escapeHtml(rawContent);
    formatted = formatted
        .replace(/(說明：)/g, '\n$1')
        .replace(/(一、|二、|三、|四、|五、|六、|七、|八、|九、|十、)/g, '\n$1');
        
    if (keyword) {
        formatted = highlightKeyword(formatted, keyword);
    }
    return formatted.trim();
}

// === AI 解答與設定 Modal ===
function openApiModal() {
    apiKeyInput.value = geminiApiKey;
    apiModal.classList.add('open');
}

function closeApiModal() {
    apiModal.classList.remove('open');
}

// 儲存 API 金鑰
function saveApiKey() {
    const key = apiKeyInput.value.trim();
    geminiApiKey = key;
    localStorage.setItem('gemini_api_key', key);
    closeApiModal();
    alert('Gemini API 金鑰已儲存！');
}

// === 採購法中文數字與法規格式標準化 ===
function normalizeProcurementArticles(text) {
    if (!text) return '';
    const numMap = {
        '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
        '壹': 1, '貳': 2, '參': 3, '肆': 4, '伍': 5, '陸': 6, '柒': 7, '捌': 8, '玖': 9, '拾': 10,
        '廿': 20, '卅': 30
    };
    
    function parseChineseNum(chs) {
        if (!chs) return 0;
        if (/^\d+$/.test(chs)) return parseInt(chs, 10);
        let total = 0;
        let temp = 0;
        for (let i = 0; i < chs.length; i++) {
            const char = chs[i];
            if (numMap[char] !== undefined) {
                const val = numMap[char];
                if (char === '十' || char === '拾') {
                    if (temp === 0) temp = 1;
                    total += temp * 10;
                    temp = 0;
                } else if (char === '廿') {
                    total += 20;
                    temp = 0;
                } else if (char === '卅') {
                    total += 30;
                    temp = 0;
                } else {
                    temp = val;
                }
            }
        }
        total += temp;
        return total;
    }
    
    return text.replace(/(第)?\s*([零一二三四五六七八九十廿卅\d]+)\s*([條項款])/g, (match, prefix, numStr, unit) => {
        const arabic = parseChineseNum(numStr);
        return `第${arabic}${unit}`;
    });
}

// === RAG 檢索邏輯 ===
function localRAGRetrieve(question) {
    const normalizedQuestion = normalizeProcurementArticles(question).toLowerCase();
    const stopWords = ['請問', '如何', '什麼', '規定', '需要', '怎麼', '適用', '情形', '問題', '法規', '是否'];
    const keywords = normalizedQuestion.split(/[\s，。？、！\?]+/).filter(w => w.length >= 2 && !stopWords.includes(w));
    
    const scoreItem = (item, kws) => {
        let score = 0;
        const text = ((item.主題 || '') + ' ' + (item.內容 || '') + ' ' + (item.依據採購法條文 || '') + ' ' + (item.裁判主文 || '')).toLowerCase();
        kws.forEach(kw => {
            if (text.includes(kw)) {
                score += kw.length;
            }
        });
        return score;
    };

    const rulingsScores = allRulingsData.concat(allErrorsData).map(item => ({
        item,
        score: scoreItem(item, keywords)
    })).filter(x => x.score > 0).sort((a, b) => b.score - a.score);

    const judgmentsScores = allJudgmentsData.map(item => ({
        item,
        score: scoreItem(item, keywords)
    })).filter(x => x.score > 0).sort((a, b) => b.score - a.score);

    return {
        rulings: rulingsScores.slice(0, 3).map(x => x.item),
        judgments: judgmentsScores.slice(0, 3).map(x => x.item)
    };
}

// === 本地智慧分析引擎 ===
function localSemanticParse(question) {
    const result = {
        core_analysis: '',
        pcc_views: '',
        court_ruling_views: '',
        professional_advice: '',
        legal_judgment: '',
        dos: [],
        donts: [],
        isLocal: true
    };

    const normalizedQuestion = normalizeProcurementArticles(question);
    const articleRegex = /(第\d+條(?:第\d+項)?(?:第\d+款)?|第\d+條第\d+款)/g;
    const matchedArticles = normalizedQuestion.match(articleRegex);
    const detectedArticle = matchedArticles && matchedArticles.length > 0 ? matchedArticles[0] : '';

    let coreText = '本案涉及政府採購法規適用與合約履行義務爭議。';
    let pccText = '根據工程會相關令釋，機關辦理個案採購應依合約公平合理條款履行，凡涉處分應依法定程序辦理並陳述意見。';
    let courtText = '行政法院與民事法院實務審理指出，採購爭議應區分招標決標（行政處分）與履約驗收（私法契約）階段，並適用對應法律時效。';
    let adviceText = '建議您儘速盤點招標文件或公文往來，釐清責任歸屬與爭端要點，於法定救濟期限（15天或20天內）提出書面主張，避免權益受損。';
    let judgmentText = '【AI 判定：依個案事證與時效評估勝訴機會】\n本案涉及採購法法規爭議。首要關鍵在於確認機關處分送達日，並於法定救濟期間（如 101 條停權通知之 20 日內、追繳押標金通知之 15 日內）依法提出書面異議，以確保後續行政或民事救濟勝算。';
    
    const dos = [
        '詳實核對原招標公告與契約範本之條款約定。',
        '妥善保存與機關往來之所有正式書面公文、會議紀錄與電子憑據。',
        '注意異議（15日內）及申訴（15日內）之救濟法定不變期間。'
    ];
    
    const donts = [
        '避免超過法定救濟時效，否則將喪失實體審查機會。',
        '避免在未釐清契約責任前，草率簽署減價收受或拋棄權利之協定。',
        '不要沿用舊版電子領標憑據投標，避免被判定為不合格標。'
    ];

    if (detectedArticle) {
        coreText = `本案核心法律爭點與政府採購法「${detectedArticle}」密切相關。`;
        const artNum = detectedArticle.match(/\d+/);
        if (artNum) {
            const num = parseInt(artNum[0], 10);
            if (num === 22) {
                pccText = '工程會指出，採購法第 22 條第 1 項各款為限制性招標之法定適用事由，機關應從嚴審查其規格或獨家供應之必要性，不得任意變更招標方式。';
                courtText = '司法裁判指出，若機關違反採購法第 22 條規定進行限制性招標，可能構成程序瑕疵而影響決標契約之效力，未得標廠商得依法提出救濟。';
                adviceText = '如您是利害關係廠商，建議儘速對機關之限制性招標公告提出書面異議。如屬後續擴充案件，請確認招標文件是否預先載明擴充上限。';
                judgmentText = '【AI 判定：視招標規格而定，機關有裁量權，但須嚴格審查】\n本案限制性招標是否合法，關鍵在於符合採購法第 22 條第 1 項各款要件。若無「獨家製造」、「無其他替代方案」之客觀事由，機關逕行限制性招標恐屬程序違法，其他廠商得依法異議，且法院實務傾向嚴格核實審查。';
                dos.push('確認招標公告是否敘明後續擴充之期間、金額或數量。');
                donts.push('避免在無防禦性之限制性招標決標後才提出爭議，應在招標等標期內提出異議。');
            } else if (num === 101) {
                pccText = '工程會規定，機關依第 101 條通知將廠商刊登拒絕往來政府公報前，應給予廠商書面陳述意見之機會，且須符合比例原則。';
                courtText = '最高行政法院見解強調，101 條刊登公報屬公法處分，需嚴格審查廠商是否符合可歸責之惡意要件（非可歸責或輕微違約不得停權）。';
                adviceText = '收到 101 條通知函時，必須在「20 日內」提出書面異議。若機關維持原決定，應在「15 日內」向申訴會提出申訴，並聲請假處分暫緩刊登。';
                judgmentText = '【AI 判定：極可能不合理，勝訴率高】\n若廠商僅屬投標文件填寫錯誤或單純漏蓋章等輕微疏漏，並無重大違約或惡意圍標、故意虛偽不實之意圖，機關擬依採購法第 101 條刊登公報停權處分，顯然違反行政法比例原則。最高行政法院實務對停權處分之「可歸責性」採嚴格審查，建議儘速於 20 日內提出書面異議。';
                dos.push('收到通知函後，務必於 20 天之不變期間內提出書面異議。');
                dos.push('向行政法院聲請停止執行（假處分），避免在判決確定前被先行刊登公報停權。');
                donts.push('切勿忽視機關的 101 條通知公文，逾期未提出異議將導致直接刊登公報停權 1 至 3 年。');
            } else if (num === 31) {
                pccText = '工程會 108 年修法後，關於第 31 條第 2 項追繳押標金之處分，應從寬審查廠商是否有串通投標或影響採購公正之惡意意圖。';
                courtText = '最高行政法院判決見解：追繳押標金屬於公法處分，時效適用行政程序法第 131 條之 5 年公法請求權時效，逾期機關不得追繳。';
                adviceText = '請核對機關通知追繳押標金之日期，是否已超過行為發生日起算之 5 年時效。若有程序爭議，應於 15 日內提出異議申訴救濟。';
                judgmentText = '【AI 判定：單純文件疏失追繳不合理，借牌圍標則屬合理】\n機關追繳押標金需以廠商有採購法第 31 條第 2 項之惡意串通、偽造變造文件或影響公正投標等行為為限。若僅屬單純文件填錯或漏誤，追繳不合法。此外，需確認是否已逾 5 年之公法時效，逾期追繳亦屬違法。';
                dos.push('確認機關追繳時，是否已超過行為發生日起算之 5 年公法時效。');
                donts.push('避免任意配合其他廠商借牌投標，這將構成採購法 31 條沒收押標金並伴隨刑事責任。');
            } else if (num === 63) {
                pccText = '工程會依第 63 條訂定各式採購契約範本，機關辦理採購應以採用範本為原則，不可任意加重廠商之不合理責任。';
                courtText = '民事法院審理採購契約爭議時，常參酌工程會契約範本之物價指數調整、違約金比例等，作為衡量契約公平合理與情事變更之判斷標準。';
                adviceText = '建議詳細檢視當個案合約是否有違背工程會範本之顯失公平條款，並依法主張合約合理變更或扣減違約金。';
                judgmentText = '【AI 判定：逾期違約金過高可請求酌減，合約失衡可爭取調整】\n本案涉及履約階段契約條款適用。依民法第 252 條及法院裁判見解，若契約違約金比例過高，或因非可歸責於廠商之原因導致延誤，廠商可於調解或民事訴訟中要求酌減違約金，亦可參考工程會契約範本主張權益。';
                dos.push('參酌工程會工程契約範本第5條之三層級物價指數調整機制申請調整。');
                donts.push('避免任意拋棄依物價指數調整契約金額之請求權利。');
            }
        }
    } else {
        if (question.includes('押標金') || question.includes('保證金')) {
            coreText = '本案核心涉及押標金沒收或追繳之爭議（採購法第 31 條）。';
            pccText = '工程會指出，押標金為擔保投標公正性，若廠商無影響公正之不法行為（如單純文件漏蓋章等），不得隨意沒收。';
            courtText = '行政法院實務見解認為，廠商雖有不合格標情形，但若非涉借牌或圍標，機關追繳押標金常因缺乏可歸責性被法院撤銷。';
            judgmentText = '【AI 判定：無惡意意圖之追繳沒收不合理】\n廠商若無圍標借牌或虛偽不實之惡意，僅因文件填錯等不合格標事由，機關追繳或沒收押標金均不合理。建議配合相關裁判實務，於 15 日內提出異議。';
            dos.push('釐清是否屬於借牌投標、圍標或提供偽造文件等涉嫌違反採購法第 31 條之情形。');
            donts.push('避免在未收到正式書面處分書前，盲目自行扣繳押標金。');
        } else if (question.includes('驗收') || question.includes('契約變更') || question.includes('違約金')) {
            coreText = '本案涉及合約履約階段之驗收、減價收受或逾期違約金爭議。';
            pccText = '工程會範本規定，驗收結果與規定不符者，若不影響使用安全，機關得經核准後辦理減價收受，且違約金應符合比例原則.、'; // Wait, let's use the exact text
            pccText = '工程會範本規定，驗收結果與規定不符者，若不影響使用安全，機關得經核准後辦理減價收受，且違約金應符合比例原則。';
            courtText = '民事法院在審理逾期違約金時，若認定機關定額違約金過高，得依民法第 252 條規定酌減違約金。';
            judgmentText = '【AI 判定：非可歸責延誤應予扣除，違約金過高應酌減】\n驗收瑕疵若非重大，應主張依採購法第 72 條辦理減價收受；若有逾期違約金爭議，凡非可歸責廠商之工期（天災、機關遲延）皆應扣除，過高之違約金得聲請減免或酌減。';
            dos.push('若屬可減價收受之瑕疵，請機關依採購法第 72 條第 2 項辦理減價收受，避免整案不合格。');
            dos.push('聲請將非可歸責於廠商之工期延誤天數（如天災、機關延遲交付工地）予以扣除。');
            donts.push('不要隨便簽署無條件拋棄逾期天數爭議之驗收記錄結算書。');
        } else if (question.includes('填錯') || question.includes('漏蓋章') || question.includes('合理嗎') || question.includes('合理')) {
            coreText = '本案核心涉及機關對廠商投標文件瑕疵所為處分之合理性爭議。';
            pccText = '工程會實務見解指出，投標文件若僅屬投標單填寫錯誤、印章漏蓋等程式或文字瑕疵，在不影響採購公平公正之情況下，機關直接予以停權或追繳押標金等嚴厲處分，不符行政程序法之比例原則。';
            courtText = '行政法院裁判指出，投標文件填錯或漏蓋章屬不合格標事由，但非屬採購法第101條第1項或第31條第2項之惡意違背法規情事。機關若逕予停權處分，常因不具備「可歸責之惡意」而被法院撤銷。';
            judgmentText = '【AI 判定：極可能不合理，勝訴率高】\n若機關因為您投標文件填寫錯誤（或漏蓋章）就判定您違反採購法第101條並予以停權，這在法律上是高度不合理的！最高行政法院指出，單純的文書疏漏不具備「可歸責之惡意」，機關逕行刊登公報停權處分違反比例原則。建議您於收到通知20日內務必提出書面異議。';
            dos.push('收到機關通知之20日內提出書面異議，並於機關駁回後15日內向採購申訴審議委員會提出申訴。');
            dos.push('向行政法院聲請停止執行，避免停權處分在訴訟確定前先行執行。');
            donts.push('切勿放任救濟期限過期。逾期未提異議將導致直接刊登公報停權。');
        }
    }

    result.core_analysis = coreText;
    result.pcc_views = pccText;
    result.court_ruling_views = courtText;
    result.professional_advice = adviceText;
    result.legal_judgment = judgmentText;
    result.dos = dos.slice(0, 4);
    result.donts = donts.slice(0, 4);

    return result;
}

// === 呼叫 Google Gemini API 進行 RAG 語意分析 ===
async function callGeminiAPI(question, retrievedRulings, retrievedJudgments) {
    const models = ['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];

    // 限制只取前 2 筆最相關資料，且內容截斷至 600 字，避免觸發免費版 40,000 TPM (每分鐘Token) 的上限限制
    const rulingsCtx = retrievedRulings.slice(0, 2).map((r, i) => 
        `【工程會函釋 ${i+1}】\n發文字號：${r.發文字號 || '無'}\n主題：${r.主題}\n內容：${(r.內容 || '').slice(0, 600)}...\n連結：${r.連結網址}`
    ).join('\n\n');

    const judgmentsCtx = retrievedJudgments.slice(0, 2).map((j, i) => 
        `【法院判決 ${i+1}】\n案號：${j.案號 || '無'}\n法院：${j.裁判法院}\n主文：${j.裁判主文}\n內容：${(j.內容 || '').slice(0, 600)}...\n連結：${j.連結網址}`
    ).join('\n\n');

    const prompt = `你是一位精通中華民國政府採購法的資深大律師。請針對使用者提出的口語問題，結合系統檢索到的工程會實務函釋及法院判決案例，提供一份專業的法律諮詢意見書。
    
以下為系統檢索出的相關參考資料：
---
【工程會相關函釋】
${rulingsCtx || '未檢索到直接相關函釋。'}

【法院相關裁判案例】
${judgmentsCtx || '未檢索到直接相關判決。'}
---

請依據上述資料及中華民國政府採購法，客觀且專業地分析使用者問題，並嚴格以下列的 JSON 格式回傳（不要包含任何 Markdown 格式框或 \`\`\`json 標記，僅回傳純 JSON 內容）：
{
  "legal_judgment": "針對使用者的採購糾紛或法規爭議，給予一個明確且直指核心的 AI 法律判定結論，包含合理性判定與勝率評估（約 100-150 字，例如：『【AI 判定：極可能不合理，勝訴率高】本案機關以廠商投標文件單純填寫錯誤為由擬刊登採購法第101條停權，因廠商並非故意虛偽不實，且無重大可歸責事由，本件停權處分顯然違反比例原則，若提出行政救濟勝訴率極高。建議儘速依程序異議申訴。』）",
  "core_analysis": "核心法律問題分析與適用法條（約 150 字，明確提及涉及的採購法條文）",
  "pcc_views": "工程會實務函釋之見解摘要（約 150 字，說明主管機關的態度）",
  "court_ruling_views": "司法法院判決案例之見解與訴訟勝敗關鍵分析（約 150 字）",
  "professional_advice": "給使用者的具體行動建議與解決途徑（約 200 字，說明如何向機關主張或進行後續救濟）",
  "dos": [
    "應採取的行動或應注意事項 1",
    "應採取的行動或應注意事項 2",
    "應採取的行動或應注意事項 3"
  ],
  "donts": [
    "應避免的事項或法律紅線 1",
    "應避免的事項或法律紅線 2",
    "應避免的事項或法律紅線 3"
  ]
}

使用者口語問題：「${question}」
JSON 輸出：`;

    lastAiPromptText = prompt; // 快取 Prompt 文字供後續對話使用

    const requestBody = {
        contents: [
            {
                parts: [
                    {
                        text: prompt
                    }
                ]
            }
        ],
        generationConfig: {
            responseMimeType: "application/json"
        }
    };

    let lastError = null;

    // 依序嘗試呼叫不同模型（實現與工程督導系統相同的降級容錯機制）
    for (const modelName of models) {
        try {
            console.log(`[Gemini API] 正在嘗試呼叫模型: ${modelName}...`);
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`;
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                const msg = errData.error?.message || `HTTP 錯誤 ${response.status}`;
                throw new Error(`${modelName} 失敗: ${msg}`);
            }

            const resData = await response.json();
            const resultText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!resultText) {
                throw new Error(`${modelName} 失敗: AI 未回傳有效內容`);
            }

            const parsed = JSON.parse(resultText.trim());
            parsed.isLocal = false;
            console.log(`[Gemini API] 模型 ${modelName} 呼叫成功！`);
            return parsed;

        } catch (err) {
            console.warn(`[Gemini API] 模型 ${modelName} 異常，準備嘗試備用模型。原因:`, err.message);
            lastError = err;
        }
    }

    // 所有模型都失敗時，拋出最後一個錯誤
    throw lastError || new Error('所有備用 Gemini 模型皆呼叫失敗');
}

// === 呼叫 Google Gemini API 進行多輪對答 (Chat) ===
async function callGeminiChatAPI(history) {
    const models = ['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];
    
    if (!geminiApiKey) {
        throw new Error('未設定 Gemini API 金鑰，請先在設定中配置。');
    }

    const requestBody = {
        contents: history
    };

    let lastError = null;

    for (const modelName of models) {
        try {
            console.log(`[Gemini Chat API] 正在嘗試呼叫模型: ${modelName}...`);
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`;
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                const msg = errData.error?.message || `HTTP 錯誤 ${response.status}`;
                throw new Error(`${modelName} 失敗: ${msg}`);
            }

            const resData = await response.json();
            const resultText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!resultText) {
                throw new Error(`${modelName} 失敗: AI 未回傳有效內容`);
            }

            console.log(`[Gemini Chat API] 模型 ${modelName} 呼叫成功！`);
            return resultText;

        } catch (err) {
            console.warn(`[Gemini Chat API] 模型 ${modelName} 異常，準備嘗試備用模型。原因:`, err.message);
            lastError = err;
        }
    }

    throw lastError || new Error('所有備用 Gemini 模型皆呼叫失敗');
}

// === 處理 AI 大律師諮詢提交 ===
async function handleAiLawyerConsult() {
    const question = aiQuestionInput.value.trim();
    if (!question) {
        alert('請先輸入您的採購問題！');
        aiQuestionInput.focus();
        return;
    }

    // 1. 本地 RAG 檢檢索相關資料
    const retrieved = localRAGRetrieve(question);

    // 2. 判斷是否有 API 金鑰，若無則走本地智慧引擎
    if (!geminiApiKey) {
        try {
            const result = localSemanticParse(question);
            lastRetrievedDocs = retrieved;
            aiChatHistory = []; // 本地模式清空對話歷史，不支援互動
            renderAiLawyerReport(question, result, retrieved);
        } catch (err) {
            console.error('本地分析失敗：', err);
            alert(`本地分析失敗：${err.message}`);
        }
        return;
    }

    // 3. 有金鑰，進入載入中狀態並呼叫 Gemini RAG
    btnAiSubmit.disabled = true;
    const originalText = btnAiSubmit.innerHTML;
    btnAiSubmit.innerHTML = `
        <span class="pulse-indicator" style="background-color: #ffffff; box-shadow: 0 0 0 0 rgba(255,255,255,0.7); animation: pulse-white 1s infinite; margin-right: 0.5rem; vertical-align: middle;"></span>
        AI 大律師法律研判中...
    `;

    // 動態載入白色 pulse 的 style
    if (!document.getElementById('pulse-white-style')) {
        const style = document.createElement('style');
        style.id = 'pulse-white-style';
        style.innerHTML = `
            @keyframes pulse-white {
                0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.7); }
                70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(255, 255, 255, 0); }
                100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
            }
        `;
        document.head.appendChild(style);
    }

    try {
        const result = await callGeminiAPI(question, retrieved.rulings, retrieved.judgments);
        
        // 成功取得後，更新快取並初始化對話歷史
        lastRetrievedDocs = retrieved;
        aiChatHistory = [];
        // 將初始 RAG 提示詞做為第一輪 User 輸入
        aiChatHistory.push({
            role: 'user',
            parts: [{ text: lastAiPromptText }]
        });
        // 將初始產出的 JSON 做為第一輪 Model 回答
        aiChatHistory.push({
            role: 'model',
            parts: [{ text: JSON.stringify(result) }]
        });

        renderAiLawyerReport(question, result, retrieved);
    } catch (err) {
        console.error('AI 智慧分析失敗：', err);
        const errorMsg = err.message || '';
        
        // 彈出詳細診斷訊息，方便使用者排除問題
        alert(`AI 大律師法律研判失敗！\n\n【詳細錯誤原因】\n${errorMsg}\n\n【故障排除建議】\n1. 若訊息顯示 "API key not valid..."：代表您的 API 金鑰輸入有誤或複製不完整。\n2. 若訊息顯示 "billing or location limits..." 或 "Quota exceeded..."：這代表該 Google 帳號的專案受限（例如：使用公司/學校的 Google Workspace 帳號被系統停用、或專案未啟用 Generative Language API）。\n3. 若訊息顯示 "User location is not supported..."：代表您目前的網路 IP 地區（例如使用了特定 VPN）不支援 Gemini 服務。\n\n💡 溫馨提示：您可以點擊右上角「齒輪 ⚙️」將金鑰清空並儲存，即可直接體驗強大且無限制的「本地專家規則解析意見書」！`);
    } finally {
        btnAiSubmit.disabled = false;
        btnAiSubmit.innerHTML = originalText;
    }
}

// === 渲染意見書 ===
function renderAiLawyerReport(question, result, retrieved) {
    const modeBadge = result.isLocal 
        ? `<span class="ai-mode-badge" style="font-size: 0.75rem; background-color: var(--border-color); color: var(--text-secondary); padding: 0.15rem 0.5rem; border-radius: 4px; font-weight: 500; border: 1px solid var(--border-color);">本地專家規則解析</span>`
        : `<span class="ai-mode-badge" style="font-size: 0.75rem; background-color: rgba(99, 102, 241, 0.15); color: #818cf8; padding: 0.15rem 0.5rem; border-radius: 4px; font-weight: 500; border: 1px solid rgba(99, 102, 241, 0.3);">Gemini 大律師 AI 研判</span>`;

    const dosHtml = result.dos.map(item => `<li class="list-item">${escapeHtml(item)}</li>`).join('');
    const dontsHtml = result.donts.map(item => `<li class="list-item">${escapeHtml(item)}</li>`).join('');

    let refHtml = '';
    const allRefs = retrieved.rulings.concat(retrieved.judgments);
    if (allRefs.length > 0) {
        const badges = allRefs.map(ref => {
            const isJudg = ref.資料來源.includes('裁判');
            const label = isJudg ? (ref.案號 || '判決') : (ref.發文字號 || '函釋');
            const titleText = ref.主題 || ref.裁判主文 || '';
            return `<a href="${ref.連結網址}" target="_blank" rel="noopener noreferrer" class="reference-badge" title="${escapeHtml(titleText)}">${escapeHtml(label)}</a>`;
        }).join('');
        
        refHtml = `
            <div class="reference-section-title">相關法律實務參考連結（意見書參考依據）：</div>
            <div class="reference-list">${badges}</div>
        `;
    }

    // 建立 AI 律師互動對答的初始語意氣泡
    const initialAiMessage = `您好！我是您的 AI 採購法律助手。針對您提出的問題，我已檢索相關函釋與裁判案例，並完成了深度研判分析，您可於下方查閱完整詳細意見書。

【核心判定與勝率評估】
${result.legal_judgment || '本案法律判定載入中...'}

【專業行動對策建議】
${result.professional_advice || '本案建議載入中...'}

如果您對目前的答覆有任何疑問，或需要針對案情細節（例如工程延遲的原因、文件瑕疵詳情）進行補充，可以在下方輸入框直接「繼續追問」，我將依據先前對話與案例庫背景繼續為您深度分析！`;

    aiGuideContainer.innerHTML = `
        <div class="ai-lawyer-report">
            <div class="report-header">
                <div class="report-title-area">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    <div>
                        <div class="report-title">AI 大律師採購爭議研判意見書</div>
                        <div class="report-subtitle">針對問題：「${escapeHtml(question.slice(0, 35))}${question.length > 35 ? '...' : ''}」的法律意見書</div>
                    </div>
                </div>
                ${modeBadge}
            </div>

            <!-- AI 互動對答區 (AI Chat) -->
            <div class="ai-chat-section">
                <div class="ai-chat-title">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; color: var(--primary-hover);"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    <span>⚖️ AI 律師互動對答區</span>
                </div>
                <div class="chat-history" id="chat-history-container">
                    <div class="chat-bubble ai">${escapeHtml(initialAiMessage).replace(/\n/g, '<br>')}</div>
                </div>
                
                ${geminiApiKey && !result.isLocal ? `
                <div class="chat-input-area">
                    <textarea class="chat-input" id="chat-followup-input" placeholder="對回答不滿意？請輸入您的案情細節或問題繼續追問大律師... (例如：可是我們是因為天災延遲，機關仍算在我們頭上...)"></textarea>
                    <button type="button" class="btn btn-primary btn-chat-send" id="btn-chat-send">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                        發送追問
                    </button>
                </div>
                ` : `
                <div style="font-size: 0.85rem; color: var(--text-secondary); text-align: center; padding: 0.5rem; background: rgba(255,255,255,0.02); border-radius: 6px; border: 1px dashed var(--border-color);">
                    💡 溫馨提示：設定 Gemini API 金鑰且啟用 API 查詢時，即可在此直接「繼續追問」大律師！目前正使用本地專家規則解析。
                </div>
                `}
            </div>
            
            <div class="verdict-banner" style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(168, 85, 247, 0.12)); border: 1.5px solid rgba(139, 92, 246, 0.4); border-radius: 12px; padding: 1.25rem 1.5rem; margin-bottom: 1.5rem; box-shadow: 0 4px 20px -2px rgba(139, 92, 246, 0.2); display: flex; gap: 1rem; align-items: flex-start;">
                <div style="background: linear-gradient(135deg, #8b5cf6, #ec4899); color: white; border-radius: 50%; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 4px 10px rgba(139, 92, 246, 0.3);">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><circle cx="12" cy="11" r="3"/><path d="M12 14c-1.5 0-3-.5-3-1.5V11h6v1.5c0 1-1.5 1.5-3 1.5z"/></svg>
                </div>
                <div style="flex: 1;">
                    <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.35rem; display: flex; align-items: center; gap: 0.5rem;">
                        AI 王牌大律師合理性判定與勝率評估
                        <span class="pulse-indicator" style="background-color: var(--accent-success, #10b981); width: 8px; height: 8px; border-radius: 50%; animation: pulse 1.6s infinite;"></span>
                    </div>
                    <div style="font-size: 0.95rem; line-height: 1.6; color: var(--text-primary); font-weight: 500; white-space: pre-line;">
                        ${escapeHtml(result.legal_judgment || '本案法律判定載入中...')}
                    </div>
                </div>
            </div>
            
            <div class="report-grid">
                <div class="report-card">
                    <div class="report-card-title">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                        1. 核心法律與條文分析
                    </div>
                    <div class="report-card-content">${escapeHtml(result.core_analysis)}</div>
                </div>
                
                <div class="report-card">
                    <div class="report-card-title">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                        2. 工程會主管機關實務見解
                    </div>
                    <div class="report-card-content">${escapeHtml(result.pcc_views)}</div>
                </div>
                
                <div class="report-card">
                    <div class="report-card-title">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        3. 司法判決案例見解與勝敗關鍵
                    </div>
                    <div class="report-card-content">${escapeHtml(result.court_ruling_views)}</div>
                </div>
                
                <div class="report-card">
                    <div class="report-card-title">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                        4. AI 大律師專業對策建議
                    </div>
                    <div class="report-card-content" style="color: var(--primary-hover); font-weight: 500;">${escapeHtml(result.professional_advice)}</div>
                </div>
            </div>
            
            <div class="dos-donts-container">
                <div class="dos-panel">
                    <div class="panel-title">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        應注意事項 / 應採取的行動 (Dos)
                    </div>
                    <ul class="list-container">
                        ${dosHtml || '<li class="list-item">無特別注意事項</li>'}
                    </ul>
                </div>
                
                <div class="donts-panel">
                    <div class="panel-title">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        應避免事項 / 違法紅線 (Don'ts)
                    </div>
                    <ul class="list-container">
                        ${dontsHtml || '<li class="list-item">無特別避免事項</li>'}
                    </ul>
                </div>
            </div>
            
            ${refHtml}
        </div>
    `;

    // 綁定發送追問按鈕與 Enter 鍵事件
    if (geminiApiKey && !result.isLocal) {
        const sendBtn = document.getElementById('btn-chat-send');
        const chatInput = document.getElementById('chat-followup-input');
        if (sendBtn && chatInput) {
            sendBtn.addEventListener('click', handleAiChatFollowUp);
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAiChatFollowUp();
                }
            });
        }
    }
    
    aiGuideContainer.scrollIntoView({ behavior: 'smooth' });
}

// === 處理使用者追問互動邏輯 ===
async function handleAiChatFollowUp() {
    const chatInput = document.getElementById('chat-followup-input');
    const sendBtn = document.getElementById('btn-chat-send');
    const historyContainer = document.getElementById('chat-history-container');
    
    if (!chatInput || !sendBtn || !historyContainer) return;
    
    const followUpText = chatInput.value.trim();
    if (!followUpText) return;
    
    // 1. 禁用輸入與按鈕防止重複送出
    chatInput.disabled = true;
    sendBtn.disabled = true;
    
    // 2. 在對話歷史中插入使用者的泡泡
    const userBubble = document.createElement('div');
    userBubble.className = 'chat-bubble user';
    userBubble.textContent = followUpText;
    historyContainer.appendChild(userBubble);
    
    // 滾動到底部
    historyContainer.scrollTop = historyContainer.scrollHeight;
    
    // 3. 插入 AI 的讀取中泡泡
    const loadingBubble = document.createElement('div');
    loadingBubble.className = 'chat-bubble ai loading-bubble';
    loadingBubble.innerHTML = `
        <span class="loading-dot"></span>
        <span class="loading-dot"></span>
        <span class="loading-dot"></span>
    `;
    historyContainer.appendChild(loadingBubble);
    historyContainer.scrollTop = historyContainer.scrollHeight;
    
    // 4. 將使用者訊息加入全域歷史紀錄
    aiChatHistory.push({
        role: 'user',
        parts: [{ text: followUpText }]
    });
    
    // 清空輸入框
    chatInput.value = '';
    
    try {
        // 5. 呼叫 Gemini Chat API
        const reply = await callGeminiChatAPI(aiChatHistory);
        
        // 移除讀取中泡泡
        if (historyContainer.contains(loadingBubble)) {
            historyContainer.removeChild(loadingBubble);
        }
        
        // 6. 插入 AI 的回覆泡泡
        const aiBubble = document.createElement('div');
        aiBubble.className = 'chat-bubble ai';
        aiBubble.innerHTML = formatChatReply(reply);
        historyContainer.appendChild(aiBubble);
        
        // 將 AI 回覆加入全域歷史紀錄
        aiChatHistory.push({
            role: 'model',
            parts: [{ text: reply }]
        });
        
    } catch (err) {
        console.error('追問失敗：', err);
        if (historyContainer.contains(loadingBubble)) {
            historyContainer.removeChild(loadingBubble);
        }
        
        const errorBubble = document.createElement('div');
        errorBubble.className = 'chat-bubble ai';
        errorBubble.style.borderColor = 'var(--accent-danger)';
        errorBubble.innerHTML = `<span style="color: var(--accent-danger); font-weight: bold;">⚠️ 追問研判失敗：</span>${escapeHtml(err.message)}`;
        historyContainer.appendChild(errorBubble);
        
        // 恢復輸入框原先的值
        chatInput.value = followUpText;
    } finally {
        chatInput.disabled = false;
        sendBtn.disabled = false;
        chatInput.focus();
        historyContainer.scrollTop = historyContainer.scrollHeight;
    }
}

// === 格式化 AI 聊天回覆 (簡單 Markdown/HTML 轉換) ===
function formatChatReply(text) {
    if (!text) return '';
    let html = escapeHtml(text);
    
    // 粗體轉換: **文字** -> <strong>文字</strong>
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // 列表與段落轉換
    html = html.split('\n').map(line => {
        line = line.trim();
        if (line.startsWith('* ') || line.startsWith('- ')) {
            return `<li>${line.slice(2)}</li>`;
        }
        if (line.match(/^\d+\.\s/)) {
            return `<li>${line.replace(/^\d+\.\s/, '')}</li>`;
        }
        if (line === '') return '';
        return `<p>${line}</p>`;
    }).join('\n');
    
    // 合併鄰近的 <li>
    html = html.replace(/(<li>.*?<\/li>\n?)+/g, match => `<ul>${match}</ul>`);
    
    return html;
}
