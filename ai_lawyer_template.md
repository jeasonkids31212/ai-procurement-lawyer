# AI 王牌大律師：法規研判與 RAG 系統開發範本 (Template)

本文件整理了「AI 採購法王牌大律師」所使用的核心提示詞（Prompt）與 JavaScript 呼叫代碼，以便您在開立新專案、導入其他法規庫（如：勞基法、環境法、建造法規等）時直接套用。

---

## 1. 核心 AI 法律研判提示詞（Prompt Template）

請將此提示詞模板發送給 Gemini。它要求 AI 根據檢索到的實務案例進行「合理性判定與勝率評估」，並強制以純 JSON 格式回傳，方便前端程式直接解析與渲染。

```text
你是一位精通中華民國【您要導入的法規名稱，如：勞動基準法】的資深大律師。請針對使用者提出的口語問題，結合系統檢索到的主管機關實務函釋及法院判決案例，提供一份專業的法律諮詢意見書。
    
以下為系統檢索出的相關參考資料：
---
【主管機關相關函釋】
${rulingsCtx || '未檢索到直接相關函釋。'}

【法院相關裁判案例】
${judgmentsCtx || '未檢索到直接相關判決。'}
---

請依據上述資料及中華民國【法規名稱】，客觀且專業地分析使用者問題，並嚴格以下列的 JSON 格式回傳（不要包含任何 Markdown 格式框或 ```json 標記，僅回傳純 JSON 內容）：
{
  "legal_judgment": "針對使用者的糾紛或法規爭議，給予一個明確且直指核心的 AI 法律判定結論，包含合理性判定與勝率評估（約 100-150 字，例如：『【AI 判定：極可能不合理，勝訴率高】本案機關以...為由擬處分，因廠商...，本件處分顯然違反比例原則，若提出救濟勝訴率極高。建議儘速依程序申訴。』）",
  "core_analysis": "核心法律問題分析與適用法條（約 150 字，明確提及涉及的法條條文）",
  "pcc_views": "主管機關實務函釋之見解摘要（約 150 字，說明主管機關的態度）",
  "court_ruling_views": "司法法院判決案例之見解與訴訟勝敗關鍵分析（約 150 字）",
  "professional_advice": "給使用者的具體行動建議與解決途徑（約 200 字，說明如何向對手主張或進行後續行政/司法救濟）",
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
JSON 輸出：
```

---

## 2. 前端 JavaScript 呼叫代碼 (RAG + 2026 模型降級機制)

此 JavaScript 函數具備兩大優勢：
1. **防止 Token 爆量（TPM 限制）**：對 RAG 檢索出的文本進行強制截斷（前 600 字）並限制背景文檔數量，保障免費版 API Key 穩定運行。
2. **依序自動降級（Fallback）**：按順序呼叫 2026 年最新規格模型，確保不會因為單一模型額度為 0 而中斷服務。

```javascript
/**
 * 呼叫 Google Gemini API 進行 RAG 語意分析與法律研判
 * @param {string} question 使用者口語問題
 * @param {Array} retrievedRulings 檢索出的函釋陣列
 * @param {Array} retrievedJudgments 檢索出的裁判書陣列
 * @returns {Promise<Object>} 解析後的意見書 JSON 對象
 */
async function callGeminiAPI(question, retrievedRulings, retrievedJudgments) {
    // 依序嘗試呼叫的模型清單 (2026 年最新穩定規格模型)
    const models = ['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];
    const geminiApiKey = localStorage.getItem('gemini_api_key') || ''; // 從瀏覽器快取讀取您的金鑰

    if (!geminiApiKey) {
        throw new Error('未設定 Gemini API 金鑰，請先在設定中配置。');
    }

    // 1. 限制只取前 2 筆最相關資料，且內容截斷至 600 字，防止觸發免費版 40,000 TPM 限額
    const rulingsCtx = retrievedRulings.slice(0, 2).map((r, i) => 
        `【主管機關函釋 ${i+1}】\n文號：${r.發文字號 || '無'}\n主題：${r.主題}\n內容：${(r.內容 || '').slice(0, 600)}...\n連結：${r.連結網址}`
    ).join('\n\n');

    const judgmentsCtx = retrievedJudgments.slice(0, 2).map((j, i) => 
        `【法院判決 ${i+1}】\n案號：${j.案號 || '無'}\n法院：${j.裁判法院}\n主文：${j.裁判主文}\n內容：${(j.內容 || '').slice(0, 600)}...\n連結：${j.連結網址}`
    ).join('\n\n');

    // 2. 組合意見書提示詞
    const prompt = `你是一位精通中華民國法律的資深大律師。請針對使用者提出的口語問題，結合系統檢索到的主管機關實務函釋及法院判決案例，提供一份專業的法律諮詢意見書。
    
以下為系統檢索出的相關參考資料：
---
【主管機關相關函釋】
${rulingsCtx || '未檢索到直接相關函釋。'}

【法院相關裁判案例】
${judgmentsCtx || '未檢索到直接相關判決。'}
---

請依據上述資料及相關法律，客觀且專業地分析使用者問題，並嚴格以下列的 JSON 格式回傳（不要包含 any Markdown 格式框或 \`\`\`json 標記，僅回傳純 JSON 內容）：
{
  "legal_judgment": "針對使用者的糾紛或法規爭議，給予一個明確且直指核心的 AI 法律判定結論，包含合理性判定與勝率評估（約 100-150 字）",
  "core_analysis": "核心法律問題分析與適用法條（約 150 字，明確提及涉及的法規條文）",
  "pcc_views": "主管機關實務函釋之見解摘要（約 150 字）",
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

    // 3. 依序嘗試呼叫模型 (自動降級備用機制)
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

            // 解析 JSON 內容
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
```

---

## 3. 前端 UI 法律判定 Banner 渲染範例 (HTML + CSS)

為了凸顯 AI 的法律核心判定，您可以使用類似以下的樣式來呈現：

### HTML 結構
```html
<div class="verdict-banner">
    <div class="verdict-title">⚖️ AI 核心研判意見</div>
    <div class="verdict-content" id="ai-verdict-text">
        <!-- 填入 JSON.legal_judgment -->
    </div>
</div>
```

### CSS 樣式
```css
.verdict-banner {
    background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
    color: #ffffff;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 24px;
    box-shadow: 0 4px 20px rgba(30, 60, 114, 0.15);
    border-left: 6px solid #ffd700;
}

.verdict-title {
    font-size: 1.2rem;
    font-weight: 700;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
}

.verdict-content {
    font-size: 1.05rem;
    line-height: 1.6;
    font-weight: 500;
}
```

---

## 4. RAG 靜態資料庫的擴充架構

在新專案中，您只需要將您的新法規資料（如勞基法）整理成多個小體積 JSON 分塊，並發布於專案的 `data/` 資料夾下，並更新索引檔即可：

1. **`data/manifest.json` (函釋/案例索引)**
   ```json
   {
     "total_chunks": 2,
     "chunks": [
       { "id": 1, "filename": "data/chunk_1.json" },
       { "id": 2, "filename": "data/chunk_2.json" }
     ]
   }
   ```
2. **`data/chunk_1.json` (單個數據分塊範例)**
   每個資料條目應包含以下統一格式，以便前端 RAG 引擎正確讀取和評分：
   ```json
   [
     {
       "項次": 1,
       "發文字號": "勞動條 3 字第 115XXXXX 號",
       "發文日期": "1150820",
       "依據採購法條文": "勞動基準法第24條",
       "主題": "加班費計算與工時認定疑義",
       "內容": "說明：一、依勞動基準法第24條規定...加班費之成數應按...",
       "廢止或補充之備註": "",
       "連結網址": "https://laws.mol.gov.tw/...",
       "資料來源": "勞基法解釋令"
     }
   }
   ```
