import os
import json
import re
import datetime
import urllib.parse
import requests

# === 基礎設定 ===
DATA_DIR = "./data"
RULINGS_MANIFEST = os.path.join(DATA_DIR, "manifest.json")
JUDGMENTS_MANIFEST = os.path.join(DATA_DIR, "judgment_manifest.json")

CHINESE_NUMBERS = {
    '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
    '壹': 1, '貳': 2, '參': 3, '肆': 4, '伍': 5, '陸': 6, '柒': 7, '捌': 8, '玖': 9, '拾': 10,
    '廿': 20, '卅': 30
}

def chinese_to_arabic(chs):
    if not chs:
        return 0
    if chs.isdigit():
        return int(chs)
    total = 0
    temp = 0
    for char in chs:
        if char in CHINESE_NUMBERS:
            val = CHINESE_NUMBERS[char]
            if char in ['十', '拾']:
                if temp == 0:
                    temp = 1
                total += temp * 10
                temp = 0
            elif char == '廿':
                total += 20
                temp = 0
            elif char == '卅':
                total += 30
                temp = 0
            else:
                temp = val
    total += temp
    return total

def normalize_law_article(text):
    if not text:
        return ""
    def replace_match(match):
        prefix = match.group(1) or ""
        num_str = match.group(2)
        unit = match.group(3)
        arabic_num = chinese_to_arabic(num_str)
        return f"{prefix}{arabic_num}{unit}"
    pattern = r'(第)?\s*([零一二三四五六七八九十廿卅\d]+)\s*([條項款])'
    return re.sub(pattern, replace_match, text)

def parse_roc_date(date_str):
    """
    將西元年月日 (YYYYMMDD) 轉民國 (YYYMMDD) 或民國直接回傳
    """
    clean_date = re.sub(r'[-/]', '', date_str)
    if len(clean_date) == 8:
        year = int(clean_date[:4])
        month_day = clean_date[4:]
        if year > 1911:
            return f"{year - 1911}{month_day}"
    return clean_date

# === 裁判書解析輔助函式 ===
def extract_court_from_full_text(full_text):
    if not full_text:
        return "司法法院"
    first_line = full_text.split('\n')[0].strip()
    match = re.search(r'([^\s]+法院)', first_line)
    return match.group(1) if match else "司法法院"

def extract_main_ruling(full_text):
    if not full_text:
        return "無主文記錄"
    pattern = r'主\s*文\s*([\s\S]*?)(?:事\s*實\s*及\s*理\s*由|事\s*實|理\s*由|研\s*判\s*意\s*見|\n\s*中華民國|$)'
    match = re.search(pattern, full_text)
    if match:
        ruling = match.group(1).strip()
        ruling = re.sub(r'\s+', ' ', ruling)
        return ruling
    return full_text[:200].strip().replace('\n', ' ') + "..."

def extract_reasons_summary(full_text, max_len=800):
    if not full_text:
        return "無理由記錄"
    pattern = r'(?:事\s*實\s*及\s*理\s*由|理\s*由)\s*([\s\S]*?)(?:\n\s*中華民國|$)'
    match = re.search(pattern, full_text)
    if match:
        reasons = match.group(1).strip()
        reasons = re.sub(r'\s+', '\n', reasons)
        if len(reasons) > max_len:
            return reasons[:max_len] + "\n..."
        return reasons
    return "請參照原始裁判書全文連結。"

def extract_laws_referenced(full_text):
    if not full_text:
        return "政府採購法綜合"
    pattern = r'(?:政府採購法|採購法)第[零一二三四五六七八九十廿卅\d]+條(?:第[零一二三四五六七八九十廿卅\d]+[項款])?'
    matches = re.findall(pattern, full_text)
    if not matches:
        return "政府採購法綜合"
    normalized_matches = list(set([normalize_law_article(m) for m in matches]))
    def sort_key(article_str):
        num_match = re.search(r'第(\d+)條', article_str)
        return int(num_match.group(1)) if num_match else 999
    normalized_matches.sort(key=sort_key)
    return "、".join(normalized_matches[:5])

# === 資料載入與分塊更新 ===
def load_all_existing_data(manifest_path):
    """
    載入某個 Manifest 與它底下的所有分塊 JSON 資料，合併成一個列表返回
    """
    if not os.path.exists(manifest_path):
        return []
    try:
        with open(manifest_path, 'r', encoding='utf-8') as f:
            manifest = json.load(f)
        all_records = []
        for chunk in manifest.get("chunks", []):
            chunk_path = os.path.join(DATA_DIR, os.path.basename(chunk["filename"]))
            if os.path.exists(chunk_path):
                with open(chunk_path, 'r', encoding='utf-8') as cf:
                    chunk_data = json.load(cf)
                    all_records.extend(chunk_data)
        return all_records
    except Exception as e:
        print(f"[!] 載入現有資料庫失敗: {e}")
        return []

def save_and_chunk_data(records, manifest_path, chunk_prefix, source_label, chunk_size=150):
    """
    將合併後的資料重新進行 150 筆分塊寫入，並重寫 Manifest
    """
    if not records:
        return
    
    total_records = len(records)
    total_chunks = (total_records + chunk_size - 1) // chunk_size
    chunks_list = []
    
    # 依項次排序
    try:
        # 重設項次為連續的 1..N
        for idx, rec in enumerate(records):
            rec["項次"] = str(idx + 1)
    except Exception:
        pass
        
    for i in range(total_chunks):
        start_idx = i * chunk_size
        end_idx = min(start_idx + chunk_size, total_records)
        chunk_data = records[start_idx:end_idx]
        
        chunk_filename = f"data/{chunk_prefix}_chunk_{i+1}.json"
        chunk_filepath = os.path.join(DATA_DIR, f"{chunk_prefix}_chunk_{i+1}.json")
        
        with open(chunk_filepath, 'w', encoding='utf-8') as f:
            json.dump(chunk_data, f, ensure_ascii=False, indent=2)
            
        chunks_list.append({
            "id": i + 1,
            "filename": chunk_filename,
            "records_count": len(chunk_data)
        })
        
    manifest_data = {
        "total_records": total_records,
        "total_chunks": total_chunks,
        "chunks": chunks_list
    }
    
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest_data, f, ensure_ascii=False, indent=2)
    print(f"[+] 資料庫更新完成！{source_label} 共 {total_records} 筆，寫出 {total_chunks} 個分塊。")

# === 司法院 API 抓取邏輯 ===
def fetch_judicial_updates():
    user = os.environ.get("JUDICIAL_USER")
    passwd = os.environ.get("JUDICIAL_PASS")
    
    if not user or not passwd:
        print("[*] 未設定環境變數 JUDICIAL_USER/JUDICIAL_PASS，自動跳過司法院裁判書更新。")
        return []
        
    print("[*] 偵測到司法院金鑰，開始驗證並抓取更新...")
    
    # 1. 取得 API Token
    auth_url = "https://opendata.judicial.gov.tw/api/v2/auth"
    try:
        auth_resp = requests.post(auth_url, json={"account": user, "password": passwd}, timeout=15)
        if not auth_resp.ok:
            print(f"[!] 司法院 Token 取得失敗: HTTP {auth_resp.status_code}")
            return []
        token = auth_resp.json().get("token")
        if not token:
            print("[!] 司法院 Auth 回傳格式錯誤，無 Token")
            return []
    except Exception as e:
        print(f"[!] 連線司法院 Auth 失敗: {e}")
        return []
        
    headers = {"Authorization": f"Bearer {token}"}
    
    # 2. 獲取最近 3 天的異動清單
    today = datetime.date.today()
    jids_to_fetch = set()
    
    for i in range(3):
        query_date = (today - datetime.timedelta(days=i)).strftime("%Y-%m-%d")
        changelist_url = f"https://opendata.judicial.gov.tw/api/v2/judgements/changelist?date={query_date}"
        try:
            resp = requests.get(changelist_url, headers=headers, timeout=15)
            if resp.ok:
                jids = resp.json().get("data", [])
                for j in jids:
                    if isinstance(j, dict) and "jid" in j:
                        jids_to_fetch.add(j["jid"])
                    elif isinstance(j, str):
                        jids_to_fetch.add(j)
        except Exception as e:
            print(f"[!] 抓取異動清單失敗 (日期: {query_date}): {e}")
            
    print(f"[*] 最近 3 天共偵測到 {len(jids_to_fetch)} 筆裁判異動，開始篩選採購法相關判決...")
    
    new_records = []
    
    # 3. 獲取每筆裁判明細並篩選
    for jid in list(jids_to_fetch)[:150]: # 單次 Actions 限制最多請求 150 筆避免超時或被封鎖
        detail_url = f"https://opendata.judicial.gov.tw/api/v2/judgements/{urllib.parse.quote(jid)}"
        try:
            resp = requests.get(detail_url, headers=headers, timeout=10)
            if resp.ok:
                item = resp.json().get("data", {})
                full_text = item.get("JFULL", "")
                title = item.get("JTITLE", "")
                
                if "政府採購法" in title or "政府採購法" in full_text or "採購法" in full_text:
                    court = item.get("JCOURT", "")
                    if not court:
                        court = extract_court_from_full_text(full_text)
                    
                    year = item.get("JYEAR", "")
                    case = item.get("JCASE", "")
                    no = item.get("JNO", "")
                    case_num = f"{year}年度{case}字第{no}號"
                    
                    raw_date = item.get("JDATE", "")
                    roc_date = parse_roc_date(raw_date)
                    
                    main_ruling = extract_main_ruling(full_text)
                    reasons_summary = extract_reasons_summary(full_text, max_len=800)
                    laws_referenced = extract_laws_referenced(full_text)
                    
                    official_link = f"https://judgment.judicial.gov.tw/FJUD/data.aspx?ty=JD&id={urllib.parse.quote(jid)}"
                    
                    new_item = {
                        "項次": "", # 後續會重整
                        "案號": case_num,
                        "裁判法院": court,
                        "發文日期": roc_date,
                        "主題": f"【{court}】因政府採購法爭議事件判決案",
                        "依據採購法條文": laws_referenced,
                        "裁判主文": main_ruling,
                        "內容": reasons_summary,
                        "連結網址": official_link,
                        "資料來源": "司法院裁判書"
                    }
                    new_records.append(new_item)
        except Exception as e:
            print(f"[!] 取得裁判明細失敗 (JID: {jid}): {e}")
            
    print(f"[*] 司法院更新完成，本期共新增 {len(new_records)} 筆採購法裁判案例。")
    return new_records

# === 工程會函釋自動更新邏輯 ===
def fetch_pcc_updates():
    """
    自動向工程會法規查詢頁面拉取最新函釋（作為模擬或簡單 HTML 爬取）
    由於工程會並無裁判書那樣的 JWT 開放 API，我們抓取最新頁面的前 10 筆進行追加。
    """
    print("[*] 開始檢查工程會採購法最新函釋...")
    new_rulings = []
    
    # 工程會最新解釋函令公告頁面
    pcc_url = "https://planpe.pcc.gov.tw/prms/explainLetter/readPrmsExplainLetterList"
    try:
        # 發送模擬查詢的 POST 請求以取得最新列表
        # 由於此網頁具有驗證，如果爬取失敗，本腳本會優雅地 catch 並跳過更新，絕不中斷 Action
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        resp = requests.post(pcc_url, data={"pageSize": 15, "pageIndex": 1}, headers=headers, timeout=10)
        
        if resp.ok:
            # 解析最新的函釋
            # 說明：因為政府電子採購網具有防爬機制，此處作為防禦性程式碼
            # 若取得的內容非預期，會輸出日誌並安全退出
            data = resp.json()
            rows = data.get("rows", [])
            for row in rows:
                doc_num = row.get("explainLetterNo", "") # 發文字號
                title = row.get("subject", "")          # 主旨
                content = row.get("content", "")        # 內容
                raw_date = row.get("issueDate", "")     # 發文日期
                pk = row.get("pkPrmsRuleContent", "")
                
                if doc_num and title:
                    # 格式化日期 (西元轉民國)
                    roc_date = parse_roc_date(raw_date)
                    detail_url = f"https://planpe.pcc.gov.tw/prms/explainLetter/readPrmsExplainLetterContentDetail?pkPrmsRuleContent={pk}"
                    
                    new_item = {
                        "項次": "",
                        "發文字號": doc_num,
                        "主題": title,
                        "依據採購法條文": extract_laws_referenced(content),
                        "上網日期": roc_date,
                        "發文日期": roc_date,
                        "連結網址": detail_url,
                        "內容": content,
                        "廢止或補充之備註": row.get("memo", "")
                    }
                    new_rulings.append(new_item)
    except Exception as e:
        print(f"[!] 工程會最新函釋爬取未成功 (這很正常，工程會官網設有防爬檢驗): {e}")
        
    return new_rulings

# === 主控制流程 ===
def main():
    # 確保資料夾存在
    os.makedirs(DATA_DIR, exist_ok=True)
    
    # 1. 處理工程會函釋更新
    existing_rulings = load_all_existing_data(RULINGS_MANIFEST)
    new_rulings = fetch_pcc_updates()
    
    if new_rulings:
        # 用「發文字號」去重，避免重複添加
        existing_doc_nums = set([r.get("發文字號") for r in existing_rulings if r.get("發文字號")])
        added_count = 0
        for nr in new_rulings:
            if nr["發文字號"] not in existing_doc_nums:
                existing_rulings.insert(0, nr) # 新的排最前面
                added_count += 1
        if added_count > 0:
            save_and_chunk_data(existing_rulings, RULINGS_MANIFEST, "pcc", "工程會函釋")
        else:
            print("[*] 沒有發現新的工程會函釋。")
    else:
        print("[*] 工程會函釋無更新。")
        
    # 2. 處理司法院裁判書更新
    existing_judgments = load_all_existing_data(JUDGMENTS_MANIFEST)
    new_judgments = fetch_judicial_updates()
    
    if new_judgments:
        # 用「案號」與「裁判法院」組合作為唯一 Key 去重
        existing_keys = set([f"{j.get('裁判法院')}_{j.get('案號')}" for j in existing_judgments])
        added_count = 0
        for nj in new_judgments:
            key = f"{nj.get('裁判法院')}_{nj.get('案號')}"
            if key not in existing_keys:
                existing_judgments.insert(0, nj)
                added_count += 1
        if added_count > 0:
            save_and_chunk_data(existing_judgments, JUDGMENTS_MANIFEST, "judgment", "司法院裁判書")
        else:
            print("[*] 沒有發現新的裁判書案例。")
    else:
        print("[*] 裁判書資料庫無更新。")

if __name__ == "__main__":
    main()
