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

    // AI 大律師工作區初始化
    initAiWorkspace();

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

// === 全域對話 Session 記憶與狀態變數 ===
let aiSessions = JSON.parse(localStorage.getItem('mol_procure_sessions')) || [];
let activeSessionId = null;
let accumulatedReferences = [];

// === 本地專家語意解析規則引擎 === 
function localSemanticParse(question) {
    const result = {
        conversational_answer: '',
        reasonability: '行為判定：依個案事證與時效評估勝訴機會',
        win_rate: '50%',
        verdict_reason: '本案涉及一般採購法規爭議，首要關鍵在於確認機關處分送達日，並於法定期間內提出救濟。',
        law_analysis: '本案涉及政府採購法規適用與合約履行義務爭議。司法裁判指出，採購爭議應區分招標決標（行政處分）與履約驗收（私法契約）階段，並適用對應法律時效。',
        action_suggestions: '建議您儘速盤點招標文件或公文往來，釐清責任歸屬與爭端要點，於法定救濟期限（15天或20天內）提出書面主張，避免權益受損。',
        dos: [
            '詳實核對原招標公告與契約範本之條款約定。',
            '妥善保存與機關往來之所有正式書面公文、會議紀錄與電子憑據。',
            '注意異議（15日內）及申訴（15日內）之救濟法定不變期間。'
        ],
        donts: [
            '避免超過法定救濟時效，否則將喪失實體審查機會。',
            '避免在未釐清契約責任前，草率簽署減價收受或拋棄權利之協定。',
            '不要沿用舊版電子領標憑據投標，避免被判定為不合格標。'
        ],
        isLocal: true
    };

    const normalizedQuestion = normalizeProcurementArticles(question);
    const articleRegex = /(第\d+條(?:第\d+項)?(?:第\d+款)?|第\d+條第\d+款)/g;
    const matchedArticles = normalizedQuestion.match(articleRegex);
    const detectedArticle = matchedArticles && matchedArticles.length > 0 ? matchedArticles[0] : '';

    let lawAnalysisText = '本案涉及政府採購法規適用與合約履行義務爭議。';
    let actionSuggestionsText = '建議您儘速盤點招標文件或公文往來，釐清責任歸屬與爭端要點，於法定救濟期限（15天或20天內）提出書面主張，避免權益受損。';
    let reasonabilityText = '行為判定：依個案事證與時效評估勝訴機會';
    let winRateText = '50%';
    let verdictReasonText = '本案涉及一般採購法規爭議，首要關鍵在於確認機關處分送達日，並於法定期間內提出救濟。';
    
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
        lawAnalysisText = `本案核心法律爭點與政府採購法「${detectedArticle}」密切相關。`;
        const artNum = detectedArticle.match(/\d+/);
        if (artNum) {
            const num = parseInt(artNum[0], 10);
            if (num === 22) {
                lawAnalysisText += `

工程會指出，採購法第 22 條第 1 項各款為限制性招標之法定適用事由，機關應從嚴審查其規格或獨家供應之必要性，不得任意變更招標方式。

司法裁判指出，若機關違反採購法第 22 條規定進行限制性招標，可能構成程序瑕疵而影響決標契約之效力，未得標廠商得依法提出救濟。`;
                actionSuggestionsText = '如您是利害關係廠商，建議儘速對機關之限制性招標公告提出書面異議。如屬後續擴充案件，請確認招標文件是否預先載明擴充上限。';
                reasonabilityText = '行為判定：限制性招標需有法定事由，否則即屬違法（政府採購法第22條）';
                winRateText = '60%';
                verdictReasonText = '限制性招標合法與否取決於是否符合第22條第1項各款要件。若無獨家供應或緊急情況等事實，機關違法裁量高，廠商申訴勝算大。';
                dos.push('確認招標公告是否敘明後續擴充之期間、金額或數量。');
                donts.push('避免在無防禦性之限制性招標決標後才提出爭議，應在招標等標期內提出異議。');
            } else if (num === 101) {
                lawAnalysisText += `

工程會規定，機關依第 101 條通知將廠商刊登拒絕往來政府公報前，應給予廠商書面陳述意見之機會，且須符合比例原則。

最高行政法院見解強調，101 條刊登公報屬公法處分，需嚴格審查廠商是否符合可歸責之惡意要件（非可歸責或輕微違約不得停權）。`;
                actionSuggestionsText = '收到 101 條通知函時，必須在「20 日內」提出書面異議。若機關維持原決定，應在「15 日內」向申訴會提出申訴，並聲請假處分暫緩刊登。';
                reasonabilityText = '行為判定：擬刊登公報停權處分可能違反比例原則（政府採購法第101條）';
                winRateText = '85%';
                verdictReasonText = '單純文書漏誤或無可歸責之惡意違約不符停權要件，機關若強行停權顯屬違法，且時效易逾越，救濟成功機率極高。';
                dos.push('收到通知函後，務必於 20 天之不變期間內提出書面異議。');
                dos.push('向行政法院聲請停止執行（假處分），避免在判決確定前被先行刊登公報停權。');
                donts.push('切勿忽視機關的 101 條通知公文，逾期未提出異議將導致直接刊登公報停權 1 至 3 年。');
            } else if (num === 31) {
                lawAnalysisText += `

工程會 108 年修法後，關於第 31 條第 2 項追繳押標金之處分，應從寬審查廠商是否有串通投標或影響採購公正之惡意意圖。

最高行政法院判決見解：追繳押標金屬於公法處分，時效適用行政程序法第 131 條之 5 年公法請求權時效，逾期機關不得追繳。`;
                actionSuggestionsText = '請核對機關通知追繳押標金之日期，是否已超過行為發生日起算之 5 年時效。若有程序爭議，應於 15 日內提出異議申訴救濟。';
                reasonabilityText = '行為判定：沒收或追繳押標金需視是否有惡意不法意圖（政府採購法第31條）';
                winRateText = '75%';
                verdictReasonText = '若僅為投標單寫錯等文件疏失，機關追繳屬於違法處分。此外須確認追繳是否已逾越 5 年公法時效。';
                dos.push('確認機關追繳時，是否已超過行為發生日起算之 5 年公法時效。');
                donts.push('避免任意配合其他廠商借牌投標，這將構成採購法 31 條沒收押標金並伴隨刑事責任。');
            } else if (num === 63) {
                lawAnalysisText += `

工程會依第 63 條訂定各式採購契約範本，機關辦理採購應以採用範本為原則，不可任意加重廠商之不合理責任。

民事法院審理採購契約爭議時，常參酌工程會契約範本之物價指數調整、違約金比例等，作為衡量契約公平合理與情事變更之判斷標準。`;
                actionSuggestionsText = '建議詳細檢視當個案合約是否有違背工程會範本之顯失公平條款，並依法主張合約合理變更或酌減違約金。';
                reasonabilityText = '行為判定：契約條款涉顯失公平或違約金過高（政府採購法第63條）';
                winRateText = '70%';
                verdictReasonText = '法院與調解實務多傾向參照工程會契約範本，如違約金過高可請求酌減，合約失衡得依法請求調整。';
                dos.push('參酌工程會工程契約範本第5條之三層級物價指數調整機制申請調整。');
                donts.push('避免任意拋棄依物價指數調整契約金額之請求權利。');
            }
        }
    } else {
        if (question.includes('押標金') || question.includes('保證金')) {
            lawAnalysisText = '本案涉及押標金沒收或追繳之爭議（採購法第 31 條）。工程會指出，押標金為擔保投標公正性，若廠商無影響公正之不法行為（如單純文件漏蓋章等），不得隨意沒收。行政法院實務見解認為，廠商雖有不合格標情形，但若非涉借牌或圍標，機關追繳押標金常因缺乏可歸責性被法院撤銷。';
            actionSuggestionsText = '釐清是否屬於借牌投標、圍標或提供偽造文件等涉嫌違反採購法第 31 條之情形。若有程序爭議，應於 15 日內提出異議。';
            reasonabilityText = '行為判定：無惡意意圖之追繳沒收押標金不合理（政府採購法第31條）';
            winRateText = '80%';
            verdictReasonText = '廠商無圍標借牌或虛偽不實之惡意，僅因文件填錯等不合格標事由，機關追繳或沒收押標金均不合理，救濟成算高。';
            dos.push('釐清是否屬於借牌投標、圍標或提供偽造文件等涉嫌違反採購法第 31 條之情形。');
            donts.push('避免在未收到正式書面處分書前，盲目自行扣繳押標金。');
        } else if (question.includes('驗收') || question.includes('契約變更') || question.includes('違約金')) {
            lawAnalysisText = '本案涉及合約履約階段之驗收、減價收受或逾期違約金爭議。工程會範本規定，驗收結果與規定不符者，若不影響使用安全，機關得經核准後辦理減價收受，且違約金應符合比例原則。民事法院在審理逾期違約金時，若認定機關定額違約金過高，得依民法第 252 條規定酌減違約金。';
            actionSuggestionsText = '若屬可減價收受之瑕疵，請機關依採購法第 72 條第 2 項辦理減價收受，避免整案不合格。並聲請扣除天災等不可歸責工期。';
            reasonabilityText = '行為判定：非可歸責延誤應予扣除，逾期違約金過高應酌減（政府採購法第72條、第63條）';
            winRateText = '75%';
            verdictReasonText = '瑕疵非重大者可主張減價收受，不可歸責廠商之工期（天災、機關遲延）皆應扣除，過高之違約金得於調解或起訴中聲請裁酌酌減。';
            dos.push('若屬可減價收受之瑕疵，請機關依採購法第 72 條第 2 項辦理減價收受，避免整案不合格。');
            dos.push('聲請將非可歸責於廠商之工期延誤天數（如天災、機關延遲交付工地）予以扣除。');
            donts.push('不要隨便簽署無條件拋棄逾期天數爭議之驗收記錄結算書。');
        } else if (question.includes('填錯') || question.includes('漏蓋章') || question.includes('合理嗎') || question.includes('合理')) {
            lawAnalysisText = '本案核心涉及機關對廠商投標文件瑕疵所為處分之合理性爭議。工程會實務見解指出，投標文件若僅屬投標單填寫錯誤、印章漏蓋等程式或文字瑕疵，在不影響採購公平公正之情況下，機關直接予以停權或追繳押標金等嚴厲處分，不符行政程序法之比例原則。行政法院裁判指出，投標文件填錯或漏蓋章屬不合格標事由，但非屬採購法第101條第1項或第31條第2項之惡意違背法規情事。機關若逕予停權處分，常因不具備「可歸責之惡意」而被法院撤銷。';
            actionSuggestionsText = '收到機關通知之20日內提出書面異議，並於機關駁回後15日內向採購申訴審議委員會提出申訴。同時向行政法院聲請停止執行。';
            reasonabilityText = '行為判定：文書筆誤或漏蓋章逕予停權追繳顯屬不合理（政府採購法第101條、第31條）';
            winRateText = '90%';
            verdictReasonText = '單純投標文件筆誤不具備違法惡意與可歸責性，停權或追繳處分顯然違背行政法比例原則，異議申訴勝算極高。';
            dos.push('收到機關通知之20日內提出書面異議，並於機關駁回後15日內向採購申訴審議委員會提出申訴。');
            dos.push('向行政法院聲請停止執行，避免停權處分在訴訟確定前先行執行。');
            donts.push('切勿放任救濟期限過期。逾期未提異議將導致直接刊登公報停權。');
        }
    }

    // 依據問題動態產生非制式的 conversational_answer
    let conversationalAnswerText = '針對您的採購法規問題，這在實務上通常需要先釐清機關處分的合理性以及合約的具體約定。建議您核對與機關的公文往來，並注意 15 天 or 20 天的法定救濟不變期間，避免權益受損。';
    const cleanQ = question.toLowerCase();
    if (cleanQ.includes('22條') || cleanQ.includes('限制性')) {
        conversationalAnswerText = '關於您提到的限制性招標（第 22 條）爭議，主要問題在於確認機關是否具備法定適用事由（如專利、獨家或緊急事故）。若無合理依據即限制其他廠商參標，可能涉嫌限制競爭。建議您立即在招標公告等標期內提出書面異議。';
    } else if (cleanQ.includes('101') || cleanQ.includes('停權') || cleanQ.includes('刊登公報')) {
        conversationalAnswerText = '關於刊登拒絕往來公報停權（第 101 條）的處分，實務要求必須有重大的「可歸責性」與惡意。如果僅是文件漏蓋章或文字填寫疏失等輕微違失，機關逕行停權已違反行政法的比例原則。建議收到通知的 20 日內，務必依法提出書面異議，並準備向申訴會申訴。';
    } else if (cleanQ.includes('31') || cleanQ.includes('追繳') || cleanQ.includes('沒收')) {
        conversationalAnswerText = '關於沒收或追繳押標金（第 31 條）的疑義，實務上要求必須有影響公正投標之惡意串通或偽造文件等違法事實，若僅是純文書疏失，追繳屬於違法。此外，機關必須在行為發生起 5 年內行使權利，否則即因時效消滅不得追繳。建議您確認通知時效並於 15 日內提出異議。';
    } else if (cleanQ.includes('63') || cleanQ.includes('合約') || cleanQ.includes('契約')) {
        conversationalAnswerText = '本案屬於契約條款（第 63 條）與履約責任爭議。若合約有失衡或顯失公平條款，在法律上可依情事變更或民法裁量主張合約變更。如果機關扣罰的逾期違約金過高，您可以在調解或訴訟程序中，主張依法酌減違約金金額。';
    } else if (cleanQ.includes('押標金') || cleanQ.includes('保證金')) {
        conversationalAnswerText = '沒收或追繳押標金必須以廠商具有借牌、圍標或故意提供不實文件等惡意行為為要件。若僅是文件漏蓋章、填寫錯誤等單純文書瑕疵而導致不合格標，機關予以沒收追繳是不合理的。建議您核對有無涉案背景，並於 15 日內提出異議。';
    } else if (cleanQ.includes('驗收') || cleanQ.includes('變更') || cleanQ.includes('違約金')) {
        conversationalAnswerText = '針對驗收與逾期違約金 the 爭議，若擺疵並非重大且不影響安全，應積極向機關主張依第 72 條辦理減價收受。對於工期逾期，必須先主張扣除不可歸責廠商的天數（例如天災、工地交付延遲等）；若違約金計處過高，亦可在調解或訴訟中聲請依法酌減。';
    } else if (cleanQ.includes('填錯') || cleanQ.includes('漏蓋') || cleanQ.includes('合理')) {
        conversationalAnswerText = '投標文件填錯或漏蓋章等情形在採購法上僅屬「不合格標」的事由。若機關據此對您做出刊登公報停權或追繳押標金等嚴重處分，實務上皆認定違反行政法比例原則。因為文書筆誤不具有違法的「惡意與可歸責性」。建議您在收到機關通知 20 日內依法提出異議。';
    }
    
    result.conversational_answer = conversationalAnswerText;
    result.reasonability = reasonabilityText;
    result.win_rate = winRateText;
    result.verdict_reason = verdictReasonText;
    result.law_analysis = lawAnalysisText;
    result.action_suggestions = actionSuggestionsText;
    result.dos = dos.slice(0, 4);
    result.donts = donts.slice(0, 4);

    return result;
}

// === 呼叫 Google Gemini API 進行語意分析與對話 ===
async function callGeminiAPI(contentsArray) {
    const models = ['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
    
    if (!geminiApiKey) {
        throw new Error('未設定 Gemini API 金鑰，請先在設定中配置。');
    }

    const requestBody = {
        contents: contentsArray,
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.25
        }
    };

    let lastError = null;

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

            return { model: modelName, text: resultText };

        } catch (err) {
            console.warn(`[Gemini API] 模型 ${modelName} 異常，準備嘗試備用模型。原因:`, err.message);
            lastError = err;
        }
    }

    throw lastError || new Error('所有備用 Gemini 模型皆呼叫失敗');
}

// === 建立 RAG 提示詞內容 ===
function buildRagPrompt(question, retrievedRulings, retrievedJudgments, isFollowUp) {
    const rulingsCtx = retrievedRulings.slice(0, 2).map((r, i) => 
        `【工程會函釋 ${i+1}】
發文字號：${r.發文字號 || '無'}
主題：${r.主題}
內容：${(r.內容 || '').slice(0, 600)}...
連結：${r.連結網址}`
    ).join('\n');

    const judgmentsCtx = retrievedJudgments.slice(0, 2).map((j, i) => 
        `【法院判決 ${i+1}】
案號：${j.案號 || '無'}
法院：${j.裁判法院}
主文：${j.裁判主文}
內容：${(j.內容 || '').slice(0, 600)}...
連結：${j.連結網址}`
    ).join('\n');

    const systemInstruction = 
        `你是一位精通中華民國政府採購法的資深大律師，精通政府採購法、行政院公共工程委員會主管行政函釋與民刑事裁判書。
` +
        `請根據使用者提出的具體採購法爭議事件，並參考以下檢索出的本機 RAG 文獻，進行深入的法律合理性判定與勝率評估。若無直接相關的文獻，請以一般採購法令與採購契約範本進行專業研判。
` +
        `你必須完全以繁體中文回答，並且輸出內容必須是嚴格的 JSON 格式，不可以有額外的解釋文字。JSON 格式如下：
` +
        `{
` +
        `  "conversational_answer": "給使用者的口語化直白回覆。請直接且人性化地回答使用者的問題，『問什麼就回答什麼』。口吻應像一位貼心、溫柔、懂法律的專業律師朋友。千萬不要制式化。請務必在回覆內容中直接且自然地融入相關的法規法條或工程會函釋字號作為依據（引用的法條包括法規名稱與具體條號，例如：依據政府採購法第101條規定、或依照工程會112年X月X日工程企字第XXXX號函釋等），直接以最白話、溫柔、明確且有法律實據的方式回答他的疑問即可。不用多餘的問候或贅言，直奔主題答覆他。",
` +
        `  "reasonability": "核心研判結論，格式應為：『行為判定：具體違法或合理說明（違反法規條號）』。例如：『機關沒收押標金違反採購法第31條』，或『擬刊登公報處分違反比例原則與採購法第101條』，或『廠商請求返還履約保證金具法律依據』。切勿使用籠統或模糊的句子，必須明確寫出行為主體、具體行為與相關法規。",
` +
        `  "win_rate": "例如：90% 或 35%",
` +
        `  "verdict_reason": "一句話總結判定原因，應簡潔有力、高質感且專業。",
` +
        `  "law_analysis": "針對適用法條的詳細解析，指出違反何法條，論述邏輯嚴謹。可使用 **粗體** 強調重點。",
` +
        `  "action_suggestions": "給予廠商/當事人的具體實操行動建議，告訴他如何收集證據、提出異議或進行申訴調解。",
` +
        `  "dos": ["應於收受處分20日內提出書面異議", "應保留與機關往來的所有公文與會議紀錄", "應向行政法院聲請停止執行以防先行停權"],
` +
        `  "donts": ["切勿忽視機關通知並放任異議期限逾期", "不要擅自簽署拋棄逾期工期扣除之驗收文件", "不要任意配合其他廠商借牌投標以免涉刑責"]
` +
        `}

`;

    let contextPromptText = '';
    if (rulingsCtx || judgmentsCtx) {
        contextPromptText = `【本機 RAG 檢索參考文獻（限制前600字）】：
${rulingsCtx}

${judgmentsCtx}

`;
    } else {
        contextPromptText = `【本機 RAG 檢索參考文獻】：針對本次問題，本機資料庫中無直接相關的法條、函釋與裁判書。

`;
    }

    if (!isFollowUp) {
        return `${systemInstruction}
` +
               `${contextPromptText}` +
               `【使用者諮詢問題】：
${question}

` +
               `請開始法律分析，僅回傳符合上述結構的 JSON 物件：`;
    } else {
        return `${systemInstruction}
` +
               `${contextPromptText}` +
               `【使用者追問】：
${question}

` +
               `請結合先前的對話歷史與本次檢索文獻，繼續進行法律分析，僅回傳符合上述結構的 JSON 物件：`;
    }
}

// === 初始化 Tab 3 AI 對話工作區 ===
function initAiWorkspace() {
    const toggleBtn = document.getElementById('ai-sidebar-toggle');
    const sidebar = document.getElementById('ai-sidebar');
    const newChatBtn = document.getElementById('ai-new-chat-btn');
    const sendBtn = document.getElementById('ai-chat-send-btn');
    const voiceBtn = document.getElementById('ai-chat-voice-btn');
    const chatInput = document.getElementById('ai-chat-input');

    // 側邊欄收合按鈕 (支援行動裝置預設收合)
    if (toggleBtn && sidebar) {
        const isMobile = window.innerWidth <= 768;
        const storedCollapsed = localStorage.getItem('ai_sidebar_collapsed');
        let isCollapsed = true;
        if (storedCollapsed !== null) {
            isCollapsed = (storedCollapsed === 'true');
        } else {
            isCollapsed = isMobile; // 行動裝置預設收合，桌機預設展開
        }
        
        if (isCollapsed) {
            sidebar.classList.add('collapsed');
        } else {
            sidebar.classList.remove('collapsed');
        }
        
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            localStorage.setItem('ai_sidebar_collapsed', sidebar.classList.contains('collapsed'));
        });
    }

    // 新增對話按鈕
    if (newChatBtn) {
        newChatBtn.addEventListener('click', resetAiChat);
    }

    // 傳送按鈕
    if (sendBtn) {
        sendBtn.addEventListener('click', handleAiChatSend);
    }

    // 輸入框按 Enter 鍵傳送 (Shift+Enter 換行)
    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleAiChatSend();
            }
        });
    }

    // 初始化語音辨識
    initSpeechRecognition();

    // 匯出備份按鈕
    const exportBtn = document.getElementById('ai-export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportSessionsBackup);
    }

    // 匯入備份按鈕
    const importBtn = document.getElementById('ai-import-btn');
    const importFileInput = document.getElementById('ai-import-file-input');
    if (importBtn && importFileInput) {
        importBtn.addEventListener('click', () => {
            importFileInput.click();
        });
        importFileInput.addEventListener('change', importSessionsBackup);
    }

    // 渲染側邊欄對話清單
    renderSidebar();

    // 載入最上層對話
    if (aiSessions.length > 0) {
        loadSession(aiSessions[0].id);
    } else {
        resetAiChat();
    }
}

// === 初始化語音辨識機制 ===
let voiceRecognition = null;
let isRecording = false;

function initSpeechRecognition() {
    const voiceBtn = document.getElementById('ai-chat-voice-btn');
    const chatInput = document.getElementById('ai-chat-input');
    if (!voiceBtn || !chatInput) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        voiceRecognition = new SpeechRecognition();
        voiceRecognition.continuous = true;
        voiceRecognition.interimResults = true;
        voiceRecognition.lang = 'zh-TW';

        voiceRecognition.onstart = () => {
            isRecording = true;
            voiceBtn.classList.add('recording-active');
            chatInput.placeholder = '🎤 正在辨識您的語音，請說話... (結束請再點擊麥克風即可自動傳送並判讀)';
            chatInput.focus();
        };

        voiceRecognition.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            if (finalTranscript || interimTranscript) {
                chatInput.value = finalTranscript + interimTranscript;
            }
        };

        voiceRecognition.onerror = (event) => {
            console.error('語音辨識錯誤:', event.error);
            if (event.error === 'not-allowed') {
                alert('麥克風權限已被拒絕。請開啟瀏覽器麥克風權限後重試。');
            } else {
                alert('語音辨識發生錯誤: ' + event.error);
            }
            stopRecording();
        };

        voiceRecognition.onend = () => {
            isRecording = false;
            voiceBtn.classList.remove('recording-active');
            chatInput.placeholder = '請輸入您遇到的採購法爭議問題... (例如：漏蓋章被沒收押標金合理嗎？)';
            
            const text = chatInput.value.trim();
            if (text) {
                handleAiChatSend();
            }
        };

        voiceBtn.addEventListener('click', () => {
            if (!isRecording) {
                startRecording();
            } else {
                stopRecording();
            }
        });
    } else {
        voiceBtn.style.display = 'none';
        console.warn('瀏覽器不支援 Web Speech API (語音輸入)');
    }
}

function startRecording() {
    if (!voiceRecognition) return;
    const chatInput = document.getElementById('ai-chat-input');
    if (chatInput) chatInput.value = '';
    try {
        voiceRecognition.start();
    } catch (e) {
        console.error(e);
    }
}

function stopRecording() {
    if (!voiceRecognition) return;
    try {
        voiceRecognition.stop();
    } catch (e) {
        console.error(e);
    }
}

// === 處理發送對話與 RAG/Gemini 呼叫 ===
async function handleAiChatSend() {
    const chatInput = document.getElementById('ai-chat-input');
    const messagesContainer = document.getElementById('ai-chat-messages');
    if (!chatInput || !messagesContainer) return;

    const question = chatInput.value.trim();
    if (!question) return;

    // 停用輸入框與發送鍵防止重複提交
    chatInput.disabled = true;
    const sendBtn = document.getElementById('ai-chat-send-btn');
    if (sendBtn) sendBtn.disabled = true;

    // 1. 插入使用者訊息氣泡
    appendUserBubble(question);

    // 清空輸入框
    chatInput.value = '';

    // 2. 插入 AI 的讀取中(Loading)泡泡
    const loadingBubble = document.createElement('div');
    loadingBubble.className = 'chat-bubble ai-bubble loading-bubble';
    loadingBubble.innerHTML = `
        <span class="loading-dot"></span>
        <span class="loading-dot"></span>
        <span class="loading-dot"></span>
    `;
    messagesContainer.appendChild(loadingBubble);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // 3. 執行本機 RAG 檢索與文獻合併
    const retrieved = localRAGRetrieve(question);
    const isFollowUp = (aiChatHistory.length > 0);

    const turnRefs = retrieved.rulings.concat(retrieved.judgments);
    turnRefs.forEach(ref => {
        if (!accumulatedReferences.some(r => r.連結網址 === ref.連結網址)) {
            accumulatedReferences.push(ref);
        }
    });

    // 4. 若無當前 Session，則建立新對話
    if (!activeSessionId) {
        activeSessionId = Date.now().toString();
        const title = question.slice(0, 12) + (question.length > 12 ? '...' : '');
        aiSessions.unshift({
            id: activeSessionId,
            title: title,
            isPinned: false,
            conversationHistory: [],
            accumulatedReferences: []
        });
    }

    // 5. 判斷金鑰，無金鑰走本地解析
    if (!geminiApiKey) {
        setTimeout(() => {
            if (messagesContainer.contains(loadingBubble)) {
                messagesContainer.removeChild(loadingBubble);
            }
            const result = localSemanticParse(question);
            appendAiBubble(result.conversational_answer, result, turnRefs);
            
            aiChatHistory.push({ role: 'user', parts: [{ text: question }] });
            aiChatHistory.push({ role: 'model', parts: [{ text: JSON.stringify(result) }] });
            
            saveCurrentSession();
            renderSidebar();
            
            chatInput.disabled = false;
            if (sendBtn) sendBtn.disabled = false;
            chatInput.focus();
        }, 800);
        return;
    }

    // 6. 有金鑰，呼叫 Gemini API
    try {
        const turnPrompt = buildRagPrompt(question, retrieved.rulings, retrieved.judgments, isFollowUp);
        aiChatHistory.push({ role: 'user', parts: [{ text: turnPrompt }] });

        const response = await callGeminiAPI(aiChatHistory);
        
        if (messagesContainer.contains(loadingBubble)) {
            messagesContainer.removeChild(loadingBubble);
        }
        
        const result = parseGeminiResponse(response.text);
        appendAiBubble(result.conversational_answer || '我已為您研判完成。', result, turnRefs);
        
        // 儲存 AI 回覆至歷史紀錄
        aiChatHistory.push({ role: 'model', parts: [{ text: response.text }] });

        saveCurrentSession();
        renderSidebar();
    } catch (err) {
        console.error(err);
        if (messagesContainer.contains(loadingBubble)) {
            messagesContainer.removeChild(loadingBubble);
        }
        
        const errorBubble = document.createElement('div');
        errorBubble.className = 'chat-bubble ai-bubble';
        errorBubble.style.borderColor = '#ef4444';
        errorBubble.innerHTML = `<span style="color: #ef4444; font-weight: bold;">⚠️ 研判失敗：</span>${escapeHtml(err.message)}`;
        messagesContainer.appendChild(errorBubble);
        
        // 移除最後一輪 User 輸入，讓使用者可以再次發送
        aiChatHistory.pop();
    } finally {
        chatInput.disabled = false;
        if (sendBtn) sendBtn.disabled = false;
        chatInput.focus();
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

// === 氣泡節點繪製輔助函數 ===
function appendUserBubble(text) {
    const messagesContainer = document.getElementById('ai-chat-messages');
    if (!messagesContainer) return;

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble user-bubble';
    bubble.style.alignSelf = 'flex-end';
    bubble.textContent = text;
    
    messagesContainer.appendChild(bubble);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function appendAiBubble(conversational_answer, result, turnRefs) {
    const messagesContainer = document.getElementById('ai-chat-messages');
    if (!messagesContainer) return;

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble ai-bubble';
    bubble.style.alignSelf = 'flex-start';
    bubble.style.width = '100%';
    bubble.style.display = 'flex';
    bubble.style.flexDirection = 'column';
    bubble.style.gap = '0.5rem';

    // 1. 口語化回答區
    const answerDiv = document.createElement('div');
    answerDiv.innerHTML = formatMarkdownText(conversational_answer);
    bubble.appendChild(answerDiv);

    // 2. 詳細 RAG 報告折疊區
    if (result && result.reasonability) {
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'toggle-report-btn';
        toggleBtn.innerHTML = `
            <span>📊 展開本輪 AI 核心研判報告 (勝率、法規紅綠燈)</span>
            <svg class="chevron-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s;"><polyline points="6 9 12 15 18 9"/></svg>
        `;
        
        const reportDetails = document.createElement('div');
        reportDetails.className = 'ai-report-details';

        // Verdict Banner (勝率與合理性)
        let bannerBg = "background: linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.03)); border: 1px solid rgba(239, 68, 68, 0.2);";
        if (result.reasonability && (result.reasonability.includes("合理") || result.reasonability.includes("法律依據") || result.reasonability.includes("合法"))) {
            bannerBg = "background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(16, 185, 129, 0.03)); border: 1px solid rgba(16, 185, 129, 0.2);";
        } else if (result.reasonability && result.reasonability.includes("爭議")) {
            bannerBg = "background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(245, 158, 11, 0.03)); border: 1px solid rgba(245, 158, 11, 0.2);";
        }

        const banner = document.createElement('div');
        banner.className = 'verdict-banner';
        banner.style = `${bannerBg} margin-bottom: 0; padding: 1rem; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; gap: 1rem;`;
        banner.innerHTML = `
            <div style="flex: 1;">
                <h3 style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); opacity: 0.7; margin: 0;">AI 核心合理性研判</h3>
                <h2 style="font-size: 1rem; font-weight: 700; color: var(--text-primary); margin: 0.15rem 0 0.25rem 0;">${result.reasonability || '未判定'}</h2>
                <div style="font-size: 0.82rem; color: var(--text-secondary); line-height: 1.4; border-top: 1px solid var(--border-color); padding-top: 0.35rem; margin-top: 0.35rem;">
                    <strong>核心理由：</strong>${result.verdict_reason || '無說明'}
                </div>
            </div>
            <div style="flex-shrink: 0; padding: 0.3rem 0.6rem; border-radius: 8px; background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); text-align: center; min-width: 70px;">
                <div style="font-size: 0.62rem; color: var(--text-secondary); opacity: 0.7;">預估勝率</div>
                <div style="font-size: 1.1rem; font-weight: 700; color: var(--primary-hover);">${result.win_rate || '0%'}</div>
            </div>
        `;
        reportDetails.appendChild(banner);

        // Law analysis
        const lawSec = document.createElement('div');
        lawSec.style = 'margin-top: 0.75rem;';
        lawSec.innerHTML = `
            <h4 style="color: var(--text-primary); font-size: 0.9rem; margin-bottom: 0.3rem; display: flex; align-items: center; gap: 0.35rem; font-weight: 600;">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                適用法條與爭點分析
            </h4>
            <div style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.55; padding-left: 0.25rem;">${formatMarkdownText(result.law_analysis)}</div>
        `;
        reportDetails.appendChild(lawSec);

        // Action suggestions
        const suggestionsSec = document.createElement('div');
        suggestionsSec.style = 'margin-top: 0.75rem;';
        suggestionsSec.innerHTML = `
            <h4 style="color: var(--text-primary); font-size: 0.9rem; margin-bottom: 0.3rem; display: flex; align-items: center; gap: 0.35rem; font-weight: 600;">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 2 7 12 12 22 7 12 2 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
                大律師具體行動對策
            </h4>
            <div style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.55; padding-left: 0.25rem;">${formatMarkdownText(result.action_suggestions)}</div>
        `;
        reportDetails.appendChild(suggestionsSec);

        // Dos & Donts
        const lightsGrid = document.createElement('div');
        lightsGrid.style = 'display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-top: 0.75rem;';
        
        const dosBox = document.createElement('div');
        dosBox.style = 'padding: 0.6rem 0.85rem; border-radius: 8px; background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.15);';
        dosBox.innerHTML = `
            <h5 style="font-size: 0.85rem; margin-bottom: 0.35rem; color: #10b981; font-weight: 600; display: flex; align-items: center; gap: 0.25rem;">
                <span>✔️</span> Do's (應採取的行動)
            </h5>
            <ul style="display: flex; flex-direction: column; gap: 0.25rem; list-style: none; padding: 0; margin: 0; font-size: 0.8rem; color: var(--text-secondary);">
                ${(result.dos || []).map(item => `<li style="line-height: 1.4;">• ${escapeHtml(item)}</li>`).join('')}
            </ul>
        `;
        lightsGrid.appendChild(dosBox);

        const dontsBox = document.createElement('div');
        dontsBox.style = 'padding: 0.6rem 0.85rem; border-radius: 8px; background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.15);';
        dontsBox.innerHTML = `
            <h5 style="font-size: 0.85rem; margin-bottom: 0.35rem; color: #ef4444; font-weight: 600; display: flex; align-items: center; gap: 0.25rem;">
                <span>❌</span> Don'ts (法律紅線與避免)
            </h5>
            <ul style="display: flex; flex-direction: column; gap: 0.25rem; list-style: none; padding: 0; margin: 0; font-size: 0.8rem; color: var(--text-secondary);">
                ${(result.donts || []).map(item => `<li style="line-height: 1.4;">• ${escapeHtml(item)}</li>`).join('')}
            </ul>
        `;
        lightsGrid.appendChild(dontsBox);
        reportDetails.appendChild(lightsGrid);

        // Reference Links
        if (turnRefs && turnRefs.length > 0) {
            const refsSec = document.createElement('div');
            refsSec.style = 'margin-top: 0.75rem;';
            const badgesHtml = turnRefs.map(ref => {
                const isJudg = ref.資料來源.includes('裁判');
                const label = isJudg ? (ref.案號 || '判決') : (ref.發文字號 || '函釋');
                const titleText = ref.主題 || ref.裁判主文 || '';
                return `<a href="${ref.連結網址}" target="_blank" rel="noopener noreferrer" class="reference-badge" style="display: inline-block; margin-right: 0.4rem; margin-bottom: 0.4rem; padding: 0.25rem 0.5rem; background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); border-radius: 4px; font-size: 0.75rem; color: var(--text-secondary); text-decoration: none; transition: var(--transition-smooth);" title="${escapeHtml(titleText)}">${escapeHtml(label)}</a>`;
            }).join('');
            
            refsSec.innerHTML = `
                <h4 style="color: var(--text-primary); font-size: 0.9rem; margin-bottom: 0.35rem; display: flex; align-items: center; gap: 0.35rem; font-weight: 600;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                    本輪 RAG 檢索實務文獻
                </h4>
                <div style="padding-left: 0.25rem;">${badgesHtml}</div>
            `;
            reportDetails.appendChild(refsSec);
        }

        // Toggle action
        toggleBtn.addEventListener('click', () => {
            const isCollapsed = (reportDetails.style.display === 'none' || reportDetails.style.display === '');
            reportDetails.style.display = isCollapsed ? 'flex' : 'none';
            const icon = toggleBtn.querySelector('.chevron-icon');
            if (icon) {
                icon.style.transform = isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)';
            }
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        });

        bubble.appendChild(toggleBtn);
        bubble.appendChild(reportDetails);
    }

    messagesContainer.appendChild(bubble);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// === Markdown 格式化為 HTML 輔助函數 ===
function formatMarkdownText(text) {
    return parseMarkdownToHtml(text);
}

// === 側邊欄 Session 渲染與管理 ===
function renderSidebar() {
    const pinnedList = document.getElementById('ai-pinned-chats-list');
    const recentList = document.getElementById('ai-recent-chats-list');
    const modeStatus = document.getElementById('ai-mode-status');
    if (!pinnedList || !recentList) return;

    pinnedList.innerHTML = '';
    recentList.innerHTML = '';

    // 更新狀態列提示
    if (modeStatus) {
        modeStatus.textContent = geminiApiKey ? 'Gemini AI 大律師模式' : '本地專家智慧解析';
    }

    let pinnedCount = 0;
    let recentCount = 0;

    aiSessions.forEach(session => {
        const item = document.createElement('div');
        item.className = 'sidebar-item';
        if (session.id === activeSessionId) item.classList.add('active');

        item.innerHTML = `
            <span class="sidebar-item-title">${escapeHtml(session.title)}</span>
            <div class="sidebar-item-actions">
                <button type="button" class="sidebar-action-btn pin-btn" title="${session.isPinned ? '取消釘選' : '釘選對話'}">
                    ${session.isPinned ? '📍' : '📌'}
                </button>
                <button type="button" class="sidebar-action-btn delete-btn" title="刪除對話">🗑️</button>
            </div>
        `;

        // 切換 Session
        item.querySelector('.sidebar-item-title').addEventListener('click', () => {
            loadSession(session.id);
        });

        // 釘選
        item.querySelector('.pin-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            togglePinSession(session.id);
        });

        // 刪除
        item.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteSession(session.id);
        });

        if (session.isPinned) {
            pinnedList.appendChild(item);
            pinnedCount++;
        } else {
            recentList.appendChild(item);
            recentCount++;
        }
    });

    if (pinnedCount === 0) {
        pinnedList.innerHTML = '<div class="empty-list-text">無釘選對話</div>';
    }
    if (recentCount === 0) {
        recentList.innerHTML = '<div class="empty-list-text">無歷史對話</div>';
    }
}

function saveCurrentSession() {
    if (!activeSessionId) return;
    const session = aiSessions.find(s => s.id === activeSessionId);
    if (session) {
        session.conversationHistory = aiChatHistory;
        session.accumulatedReferences = accumulatedReferences;
        localStorage.setItem('mol_procure_sessions', JSON.stringify(aiSessions));
    }
}

function loadSession(id) {
    const session = aiSessions.find(s => s.id === id);
    if (!session) return;

    activeSessionId = id;
    aiChatHistory = session.conversationHistory || [];
    accumulatedReferences = session.accumulatedReferences || [];

    const messagesContainer = document.getElementById('ai-chat-messages');
    if (!messagesContainer) return;
    
    messagesContainer.innerHTML = '';

    if (aiChatHistory.length === 0) {
        showWelcomeBubble();
    } else {
        // 迴圈讀取對話歷程並還原
        for (let i = 0; i < aiChatHistory.length; i++) {
            const turn = aiChatHistory[i];
            if (turn.role === 'user') {
                let userQ = '';
                const lines = turn.parts[0].text.split('\n');
                let startExtract = false;
                for (let j = 0; j < lines.length; j++) {
                    if (lines[j].includes('【使用者諮詢問題】：') || lines[j].includes('【使用者追問】：')) {
                        startExtract = true;
                        continue;
                    }
                    if (startExtract) {
                        if (lines[j].trim().startsWith('請開始法律分析') || lines[j].trim().startsWith('請結合先前的對話')) {
                            break;
                        }
                        userQ += lines[j] + '\n';
                    }
                }
                userQ = userQ.trim();
                if (!userQ) {
                    userQ = turn.parts[0].text;
                }
                appendUserBubble(userQ);
            } else if (turn.role === 'model') {
                const parsed = parseGeminiResponse(turn.parts[0].text);
                appendAiBubble(parsed.conversational_answer, parsed, accumulatedReferences);
            }
        }
    }

    renderSidebar();
}

function resetAiChat() {
    activeSessionId = null;
    aiChatHistory = [];
    accumulatedReferences = [];
    
    const messagesContainer = document.getElementById('ai-chat-messages');
    if (messagesContainer) {
        messagesContainer.innerHTML = '';
        showWelcomeBubble();
    }
    renderSidebar();
}

function showWelcomeBubble() {
    const messagesContainer = document.getElementById('ai-chat-messages');
    if (!messagesContainer) return;
    const welcome = document.createElement('div');
    welcome.className = 'chat-bubble welcome-bubble';
    welcome.innerHTML = `
        <h3 style="margin-bottom: 0.4rem; color: var(--primary-hover); font-weight: 700; font-size: 1.05rem;">⚖️ AI採購法大律師</h3>
        <p style="font-size: 0.88rem; line-height: 1.55; color: var(--text-secondary); margin: 0 0 0.8rem 0;">
            您好！我是您的 AI 採購法律助手。我精通政府採購法、工程會主管行政函釋與裁判案例。
            請在下方輸入您遇到的政府採購爭議或具體案情，我會為您進行深度合理性判定、勝率估算，並產出專業的分析意見書。
        </p>
        <div style="font-size: 0.8rem; font-weight: 600; color: var(--text-primary); text-align: left; margin-bottom: 0.5rem; border-top: 1px solid var(--border-color); padding-top: 0.5rem;">
            💡 快速引導諮詢範本（點擊下方膠囊立即開始分析）：
        </div>
        <div class="quick-templates" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem; width: 100%; margin-top: 0.25rem;">
            <div class="template-capsule" data-query="投標文件漏蓋章被沒收押標金，機關追繳時效是多久？合理嗎？" style="padding: 0.5rem 0.6rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.78rem; color: var(--text-secondary); cursor: pointer; transition: var(--transition-smooth); text-align: left;" title="沒收押標金時效">
                ⚖️ 沒收押標金時效
            </div>
            <div class="template-capsule" data-query="機關擬依採購法第101條刊登拒絕往來公報處分，該如何申訴救濟？時效是幾天？合理嗎？" style="padding: 0.5rem 0.6rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.78rem; color: var(--text-secondary); cursor: pointer; transition: var(--transition-smooth); text-align: left;" title="101條停權救濟">
                🚫 101條停權救濟
            </div>
            <div class="template-capsule" data-query="機關辦理採購招標，任意採用限制性招照（採購法第22條），是否構成程序違法？" style="padding: 0.5rem 0.6rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.78rem; color: var(--text-secondary); cursor: pointer; transition: var(--transition-smooth); text-align: left;" title="限制性招標合法性">
                🤝 限制性招標合法性
            </div>
            <div class="template-capsule" data-query="因工期延誤（非可歸責）被扣罰逾期違約金，可以主張減價收受或酌減違約金嗎？" style="padding: 0.5rem 0.6rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.78rem; color: var(--text-secondary); cursor: pointer; transition: var(--transition-smooth); text-align: left;" title="逾期違約金酌減">
                ⏳ 逾期違約金酌減
            </div>
        </div>
    `;
    messagesContainer.appendChild(welcome);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // 綁定點擊膠囊自動填入並送出
    const capsules = welcome.querySelectorAll('.template-capsule');
    capsules.forEach(capsule => {
        capsule.addEventListener('click', () => {
            const query = capsule.getAttribute('data-query');
            const chatInput = document.getElementById('ai-chat-input');
            if (chatInput) {
                chatInput.value = query;
                handleAiChatSend();
            }
        });
    });
}

function togglePinSession(id) {
    const session = aiSessions.find(s => s.id === id);
    if (session) {
        session.isPinned = !session.isPinned;
        localStorage.setItem('mol_procure_sessions', JSON.stringify(aiSessions));
        renderSidebar();
    }
}

function deleteSession(id) {
    if (confirm('確定要刪除此對話紀錄嗎？')) {
        aiSessions = aiSessions.filter(s => s.id !== id);
        localStorage.setItem('mol_procure_sessions', JSON.stringify(aiSessions));
        if (activeSessionId === id) {
            resetAiChat();
        } else {
            renderSidebar();
        }
    }
}

function parseGeminiResponse(text) {
    let cleanText = text.trim();
    
    // 清除 markdown json 區塊標示
    if (cleanText.startsWith("```")) {
        const lines = cleanText.split("\n");
        if (lines[0].startsWith("```json") || lines[0].startsWith("```")) {
            lines.shift();
        } else {
            lines.shift();
        }
        if (lines[lines.length - 1] === "```") {
            lines.pop();
        }
        cleanText = lines.join("\n").trim();
    }

    try {
        return JSON.parse(cleanText);
    } catch (e) {
        console.warn("JSON parsing failed. Attempting regex match...", e);
        const regexMatch = cleanText.match(/\{[\s\S]*\}/);
        if (regexMatch) {
            try {
                return JSON.parse(regexMatch[0]);
            } catch (innerErr) {
                console.error("Regex extracted string is also not valid JSON:", innerErr);
            }
        }
        
        return {
            conversational_answer: "抱歉，法律研判模組回傳的數據格式有誤。但我可以告訴您：機關刊登公報停權或沒收押標金必須符合行政法比例原則及明確之可歸責要件。建議您檢視公文救濟期限並向相關主管機關提出異議。",
            reasonability: "行為判定：AI回覆格式異常",
            win_rate: "50%",
            verdict_reason: "AI 回覆未符合 JSON 規範，以下為原始回覆節錄:\n" + text.substring(0, 150) + "...",
            law_analysis: text,
            action_suggestions: "請注意異議申訴時限（20天/15天內），並準備陳情或救濟文件。",
            dos: ["核對函文到達時間", "儘速撰寫異議書狀"],
            donts: ["勿放任時效逾期", "勿在狀況未明前同意私下和解"]
        };
    }
}

// === 格式化 AI 聊天回覆 (簡單 Markdown/HTML 轉換) ===
function formatChatReply(text) {
    return parseMarkdownToHtml(text);
}

// === Markdown 升級表格、引用、標題編譯器 ===
function parseMarkdownToHtml(text) {
    if (!text) return '';
    
    let cleaned = text.trim();
    cleaned = cleaned.replace(/^```[a-zA-Z0-9-]*\n/i, '');
    cleaned = cleaned.replace(/\n```$/i, '');
    cleaned = cleaned.replace(/^```/i, '');
    cleaned = cleaned.replace(/```$/i, '');
    cleaned = cleaned.trim();
    
    let lines = cleaned.split('\n');
    let resultHtml = [];
    let inTable = false;
    let tableHeaders = null;
    let tableRows = [];
    let inQuote = false;
    let quoteLines = [];
    let inList = false;
    let listHtml = [];
    
    function closeQuote() {
        if (inQuote) {
            resultHtml.push('<blockquote>' + parseMarkdownToHtml(quoteLines.join('\n')) + '</blockquote>');
            inQuote = false;
            quoteLines = [];
        }
    }
    
    function closeList() {
        if (inList) {
            resultHtml.push('<ul>' + listHtml.join('\n') + '</ul>');
            inList = false;
            listHtml = [];
        }
    }
    
    function closeTable() {
        if (inTable) {
            let tableHtml = '<div class="table-responsive"><table class="markdown-table">';
            if (tableHeaders) {
                tableHtml += '<thead><tr>';
                tableHeaders.forEach(h => {
                    tableHtml += '<th>' + parseInlineMarkdown(h.trim()) + '</th>';
                });
                tableHtml += '</tr></thead>';
            }
            tableHtml += '<tbody>';
            tableRows.forEach(row => {
                tableHtml += '<tr>';
                row.forEach(cell => {
                    tableHtml += '<td>' + parseInlineMarkdown(cell.trim()) + '</td>';
                });
                tableHtml += '</tr>';
            });
            tableHtml += '</tbody></table></div>';
            resultHtml.push(tableHtml);
            inTable = false;
            tableHeaders = null;
            tableRows = [];
        }
    }
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        let trimmed = line.trim();
        
        // 偵測 Markdown 表格行為
        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
            closeQuote();
            closeList();
            
            let cols = trimmed.split('|').map(c => c.trim());
            cols.shift();
            cols.pop();
            
            let isSeparator = cols.every(c => c.match(/^:?-+:?$/));
            
            if (isSeparator) {
                continue;
            }
            
            if (!inTable) {
                inTable = true;
                tableHeaders = cols;
            } else {
                tableRows.push(cols);
            }
            continue;
        } else {
            closeTable();
        }
        
        // 偵測引用區塊
        if (trimmed.startsWith('>')) {
            closeList();
            inQuote = true;
            let quoteText = line.substring(line.indexOf('>') + 1);
            if (quoteText.startsWith(' ')) quoteText = quoteText.substring(1);
            quoteLines.push(quoteText);
            continue;
        } else {
            closeQuote();
        }
        
        // 偵測三級標題
        if (trimmed.startsWith('###')) {
            closeList();
            let hText = trimmed.substring(3).trim();
            resultHtml.push('<h3>' + parseInlineMarkdown(hText) + '</h3>');
            continue;
        }
        
        // 偵測列表
        if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
            inList = true;
            let itemText = trimmed.substring(2).trim();
            listHtml.push('<li>' + parseInlineMarkdown(itemText) + '</li>');
            continue;
        } else if (trimmed.match(/^\d+\.\s/)) {
            inList = true;
            let itemText = trimmed.replace(/^\d+\.\s/, '').trim();
            listHtml.push('<li>' + parseInlineMarkdown(itemText) + '</li>');
            continue;
        } else {
            closeList();
        }
        
        if (trimmed === '') {
            continue;
        }
        
        resultHtml.push('<p>' + parseInlineMarkdown(trimmed) + '</p>');
    }
    
    closeTable();
    closeQuote();
    closeList();
    
    return resultHtml.join('\n');
}

function parseInlineMarkdown(text) {
    let escaped = escapeHtml(text);
    escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    return escaped;
}

// === 匯出對話紀錄為 JSON 備份檔 ===
function exportSessionsBackup() {
    if (aiSessions.length === 0) {
        alert('目前無歷史對話紀錄可供匯出！');
        return;
    }
    try {
        const dataStr = JSON.stringify(aiSessions, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const exportFileDefaultName = `ai_procure_lawyer_backup_${new Date().toISOString().slice(0,10)}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
    } catch (e) {
        console.error('匯出失敗:', e);
        alert('匯出失敗，請重試！');
    }
}

// === 匯入 JSON 備份檔並合併對話紀錄 ===
function importSessionsBackup(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            if (!Array.isArray(importedData)) {
                alert('匯入失敗：備份檔格式不正確，應為對話陣列。');
                return;
            }

            let mergeCount = 0;
            importedData.forEach(importedSession => {
                if (importedSession.id) {
                    const exists = aiSessions.some(s => s.id === importedSession.id);
                    if (!exists) {
                        aiSessions.push(importedSession);
                        mergeCount++;
                    }
                }
            });

            if (mergeCount === 0) {
                alert('無新增的對話紀錄（對話已存在於目前側邊欄中）。');
            } else {
                aiSessions.sort((a, b) => b.id.localeCompare(a.id));
                localStorage.setItem('mol_procure_sessions', JSON.stringify(aiSessions));
                renderSidebar();
                if (aiSessions.length > 0) {
                    loadSession(aiSessions[0].id);
                }
                alert(`成功匯入並合併 ${mergeCount} 筆對話紀錄！`);
            }
        } catch (err) {
            console.error('讀取備份檔失敗:', err);
            alert('匯入失敗：無法解析 JSON 檔案。');
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}
