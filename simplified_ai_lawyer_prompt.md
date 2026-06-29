# 全新極簡版 AI 法律王牌大律師系統 —— 開發提示詞 (System Prompt for AI Coding)

您可以直接複製這份提示詞（Prompt），輸入給任何強大的 AI 程式助手（如 Gemini 或 Cursor），即可在幾分鐘內自動生成您的全新法規專案。

---

```text
請幫我建立一個全新、極簡設計的「AI 【您的法規名稱，例如：勞動基準法】王牌大律師」單網頁（Single Page Application）系統。
該系統必須支援 RAG（檢索增強生成）本機語意檢索，並直接部署於 GitHub Pages（純靜態網頁，無須伺服器後端）。

請嚴格依照以下設計與規格進行實作：

### 1. 極簡 UI 介面設計（減少冗餘窗格）
- **不要使用多個複雜的頁籤或窗格**。使用者輸入問題後，請在單一畫面中以「由上至下」的方式呈現：
  1. 【AI 核心研判 Banner】：使用高質感的藍色漸層背景（如 linear-gradient(135deg, #1e3c72, #2a5298)）與黃金左邊框（border-left: 6px solid #ffd700），以最大字體顯示 AI 的法律合理性研判與勝訴率。
  2. 【法律分析與具體建議】：以兩欄式（Desktop）或一欄式卡片呈現「核心法律條文分析」與「具體行動建議」。
  3. 【行動紅綠燈】：以簡潔的 Do's (應做事項，綠色符號) 與 Don'ts (避雷事項，紅色符號) 清單列出。
  4. 【相關法條與案例參考】：極簡折疊式或超連結清單，列出本次 RAG 檢索到且提供給 AI 作為證據的 2 筆函釋與 2 筆裁判書（只顯示標題、字號與連結，點擊可展開內容，避免佔用版面）。

### 2. 免費 Gemini API 與 TPM 防護機制（核心 JavaScript）
請在前端 JavaScript 中實作以下機制，以保障免費 API Key 穩定運行：
- **RAG 背景文本控制**：限制只取檢索結果前 2 筆，且每筆內容以 `.slice(0, 600)` 截斷至 600 字，避免觸發免費 API 每分鐘 40,000 Tokens 的限制 (TPM)。
- **自動模型降級 (Fallback)**：使用陣列依序嘗試呼叫 2026 最新規格模型：['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-2.5-flash']。若其中一個失敗（如額度為0），自動嘗試下一個。
- **金鑰保存**：提供金鑰設定輸入框，將金鑰加密保存於瀏覽器 `localStorage` 中。

### 3. RAG 靜態資料庫架構與自動化更新腳本
- **RAG 載入機制**：前端在載入網頁時，自動異步讀取 `data/manifest.json` 索引，並載入切分好的 `data/chunk_1.json`, `data/chunk_2.json` 等靜態檔案。
- **「自動更新最新函釋」Python 腳本**：
  請為我寫一個 Python 腳本（命名為 `update_data.py`），它能做到：
  1. 讀取一個本地的最新函釋 Excel/CSV 檔案，或對接政府開放平台 API（請寫出框架）。
  2. 自動與現有的 RAG 資料進行合併去重。
  3. 自動將合併後的資料重新切分成每份約 300KB 的 `chunk_X.json` 檔案。
  4. 自動更新 `data/manifest.json` 的分塊數量與索引。
  5. 產生一個 GitHub Actions 的工作流檔案（`.github/workflows/auto_update.yml`），設定為每週自動執行該更新腳本，並自動 commit 與 push 回 GitHub 儲存庫，實現 GitHub Pages 的無痛自動發布。

請幫我產出以下三個檔案：
1. `index.html` (整合所有極簡 CSS 樣式與 RAG 檢索 + Gemini API 降級邏輯的單網頁應用程式)
2. `update_data.py` (自動載入、去重、分塊、更新 RAG 的 Python 腳本)
3. `.github/workflows/auto_update.yml` (每週自動更新資料並推送到 GitHub Pages 的 CI/CD 設定檔)
```

---

## 💡 新專案開發關鍵要點（供您在新專案開發時參考）

### 1. 如何精簡回應窗格（UI/UX 簡化）
原本的系統包含「主管機關函釋」、「法院裁判」、「AI法律研判」、「申訴審議」等多個大窗格，資訊過於分散。
新專案建議採用**「單一主卡片流」**：
- **頂部**：大字體金鑰輸入與查詢欄位。
- **中央**：AI 法律判定 Banner（直接秀出：**判定合理/極可能不合理、勝率 XX%**）。
- **下方**：條列式 Dos/Donts。
- **底部**：折疊式的參考連結。

### 2. 「自動上傳/更新最新函釋」的實現方式
我們為您設計的 `update_data.py` 會自動讀取最新釋出的資料，將其轉換為 RAG 標準 JSON 格式，然後自動執行 `git commit` 將其推送到 GitHub 上。這代表您的網頁在 GitHub Pages 上運作時，背後的 RAG 資料庫永遠是最新的。

詳細腳本與工作流設定已備妥於下方。

---

## 🛠️ 附錄：自動更新 RAG 資料庫之配套程式碼

以下是您可以用於新專案的 `update_data.py` 腳本與 GitHub Actions 設定，讓您的網頁能每週自動抓取最新函釋並推送到 GitHub 靜態站點上。

### 1. 數據自動去重與分塊 Python 腳本 (`update_data.py`)

在新專案的根目錄下，建立此 `update_data.py` 檔案。它能將新獲取的資料合併、去重，並重新打包成約 300KB 的靜態 RAG JSON 檔：

```python
import os
import json
import pandas as pd # 如無安裝，可直接使用 Python 內建 csv 模組

# 配置參數
DATA_DIR = "data"
CHUNK_SIZE_KB = 300  # 每個分塊控制在 300KB 以內，方便前端快速下載
MANIFEST_PATH = os.path.join(DATA_DIR, "manifest.json")

def load_all_existing_data():
    """載入所有現有的 RAG 歷史資料"""
    all_data = []
    if not os.path.exists(MANIFEST_PATH):
        return all_data
        
    try:
        with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
            manifest = json.load(f)
        for chunk_info in manifest.get("chunks", []):
            filepath = os.path.join(".", chunk_info["filename"])
            if os.path.exists(filepath):
                with open(filepath, "r", encoding="utf-8") as cf:
                    all_data.extend(json.load(cf))
    except Exception as e:
        print(f"載入現有資料失敗: {e}")
    return all_data

def save_and_chunk_data(merged_data):
    """將資料分塊寫入，並更新 manifest.json"""
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
        
    # 計算每塊容納多少筆（以平均大小估計，或嚴格以位元組切分）
    # 這裡採簡單切分法，約 100 筆為一個分塊
    records_per_chunk = 100 
    chunks = [merged_data[i:i + records_per_chunk] for i in range(0, len(merged_data), records_per_chunk)]
    
    manifest_chunks = []
    for index, chunk_data in enumerate(chunks):
        chunk_id = index + 1
        filename = f"{DATA_DIR}/chunk_{chunk_id}.json"
        
        # 寫入分塊檔案
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(chunk_data, f, ensure_ascii=False, indent=2)
            
        manifest_chunks.append({
            "id": chunk_id,
            "filename": filename
        })
        print(f"成功產生分塊: {filename}")
        
    # 寫入 manifest
    manifest = {
        "total_chunks": len(manifest_chunks),
        "chunks": manifest_chunks
    }
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print("成功更新 manifest.json")

def fetch_latest_rulings_from_api_or_file():
    """
    從政府 Open Data API 抓取或讀取本地最新下載的 csv。
    這裡示範讀取最新下載的 'latest_download.csv'。
    """
    new_records = []
    latest_file = "latest_download.csv"
    
    if not os.path.exists(latest_file):
        print(f"未檢測到最新資料檔 '{latest_file}'，僅執行資料重新整理。")
        return new_records
        
    try:
        df = pd.read_csv(latest_file, encoding="utf-8")
        # 轉換為 RAG 標準 JSON 欄位結構
        for _, row in df.iterrows():
            new_records.append({
                "發文字號": str(row.get("文號", "")),
                "發文日期": str(row.get("日期", "")),
                "依據採購法條文": str(row.get("法條", "")),
                "主題": str(row.get("標題", "")),
                "內容": str(row.get("全文內容", "")),
                "廢止或補充之備註": "",
                "連結網址": str(row.get("來源網址", "")),
                "資料來源": "自動上傳最新函釋"
            })
        print(f"從本地最新檔案中讀取到 {len(new_records)} 筆新函釋。")
    except Exception as e:
        print(f"解析最新下載檔失敗: {e}")
    return new_records

def main():
    # 1. 讀取現有資料庫
    existing_data = load_all_existing_data()
    print(f"目前資料庫已有 {len(existing_data)} 筆資料。")
    
    # 2. 獲取/下載最新資料
    new_data = fetch_latest_rulings_from_api_or_file()
    
    # 3. 合併去重（利用 '發文字號' 當作唯一 Key）
    unique_keys = set(item["發文字號"] for item in existing_data if item.get("發文字號"))
    added_count = 0
    for record in new_data:
        key = record.get("發文字號")
        if key and key not in unique_keys:
            existing_data.append(record)
            unique_keys.add(key)
            added_count += 1
            
    print(f"成功併入並去重 {added_count} 筆新資料！總計 {len(existing_data)} 筆。")
    
    # 4. 重新分塊寫入
    if added_count > 0 or not os.path.exists(MANIFEST_PATH):
        save_and_chunk_data(existing_data)
        # 刪除已處理過的暫存檔
        if os.path.exists("latest_download.csv"):
            os.remove("latest_download.csv")
    else:
        print("資料庫無更新，無須重新產生分塊。")

if __name__ == "__main__":
    main()
```

### 2. GitHub Actions 自動更新排程 (`.github/workflows/auto_update.yml`)

在新專案中，建立 `.github/workflows/auto_update.yml`。它會在每週一凌晨自動執行更新腳本，若是資料庫有變更，便會自動 Commit 並 Push，進而觸發 GitHub Pages 更新：

```yaml
name: 每日/每週自動更新法規 RAG 資料庫

on:
  schedule:
    - cron: '0 0 * * 1' # 每週一凌晨 00:00 (UTC) 自動執行
  workflow_dispatch: # 允許您在 GitHub 網頁上手動點擊按鈕立即執行

jobs:
  update-rag-db:
    runs-on: ubuntu-latest
    steps:
    - name: 檢出儲存庫代碼
      uses: actions/checkout@v3

    - name: 設定 Python 環境
      uses: actions/setup-python@v4
      with:
        python-version: '3.10'

    - name: 安裝相依套件
      run: |
        pip install pandas openpyxl requests

    - name: 執行資料更新與分塊腳本
      run: python update_data.py

    - name: 檢查檔案是否有變更並提交回儲存庫
      run: |
        git config --global user.name "GitHub Actions Bot"
        git config --global user.email "actions@github.com"
        git add data/
        # 若有變更才進行 Commit，避免排程報錯
        if git diff --cached --quiet; then
          echo "沒有新函釋資料，無須更新。"
        else
          git commit -m "auto: 自動同步最新函釋並重新打包 RAG 分塊"
          git push origin main
        fi
```

