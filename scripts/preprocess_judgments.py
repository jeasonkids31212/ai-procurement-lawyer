import os
import json
import re
import sys

# === 中文數字轉阿拉伯數字字典 ===
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
    """
    將文本中提到的 '第X條第X項第X款' 轉換為標準格式，例如：'第22條第1項第7款'
    """
    if not text:
        return ""
    
    def replace_match(match):
        prefix = match.group(1) or ""
        num_str = match.group(2)
        unit = match.group(3)
        arabic_num = chinese_to_arabic(num_str)
        return f"{prefix}{arabic_num}{unit}"
    
    # 匹配 '第[一二三四五六七八九十廿卅\d]+[條項款]'
    pattern = r'(第)?\s*([零一二三四五六七八九十廿卅\d]+)\s*([條項款])'
    return re.sub(pattern, replace_match, text)

def parse_roc_date(gregorian_date_str):
    """
    將西元年月日 (YYYYMMDD 或 YYYY-MM-DD) 轉換為民國年月日 (YYYMMDD)
    例如：'20230815' -> '1120815'
    """
    clean_date = re.sub(r'[-/]', '', gregorian_date_str)
    if len(clean_date) == 8:
        year = int(clean_date[:4])
        month_day = clean_date[4:]
        roc_year = year - 1911
        return f"{roc_year}{month_day}"
    return gregorian_date_str

def extract_court_from_full_text(full_text):
    """
    從裁判書全文首行提取法院名稱
    """
    if not full_text:
        return "未知法院"
    first_line = full_text.split('\n')[0].strip()
    # 尋找像是 "臺灣臺北地方法院" 或 "最高行政法院" 的名稱
    match = re.search(r'([^\s]+法院)', first_line)
    if match:
        return match.group(1)
    return "未知法院"

def extract_main_ruling(full_text):
    """
    從全文中擷取「主文」區塊
    """
    if not full_text:
        return "無主文記錄"
    
    # 尋找 "主 文" 與其後的 "事 實" 或 "事 實 及 理 由" 之間的文字
    # 支援各種空白分隔的「主文」或「主  文」
    pattern = r'主\s*文\s*([\s\S]*?)(?:事\s*實\s*及\s*理\s*由|事\s*實|理\s*由|研\s*判\s*意\s*見|\n\s*中華民國|$)'
    match = re.search(pattern, full_text)
    if match:
        ruling = match.group(1).strip()
        # 去除多餘空白與換行
        ruling = re.sub(r'\s+', ' ', ruling)
        return ruling
    
    # 兜底：若匹配不到，回傳全文前200字
    return full_text[:200].strip().replace('\n', ' ') + "..."

def extract_reasons_summary(full_text, max_len=800):
    """
    從全文中擷取「判決精簡理由」
    """
    if not full_text:
        return "無理由記錄"
    
    # 尋找「理由」或「事實及理由」區塊
    pattern = r'(?:事\s*實\s*及\s*理\s*由|理\s*由)\s*([\s\S]*?)(?:\n\s*中華民國|$)'
    match = re.search(pattern, full_text)
    if match:
        reasons = match.group(1).strip()
        
        # 精簡化處理：移除重複的換行、空格與當事人姓名等雜訊
        reasons = re.sub(r'\s+', '\n', reasons)
        
        # 僅保留前 max_len 個字，並加上省略號
        if len(reasons) > max_len:
            return reasons[:max_len] + "\n..."
        return reasons
    
    # 兜底：若無明顯理由區塊，擷取主文之後的段落
    lines = full_text.split('\n')
    if len(lines) > 15:
        return "\n".join(lines[15:25]) + "\n..."
    return "請參照原始裁判書全文連結。"

def extract_laws_referenced(full_text):
    """
    從裁判書中掃描所引用的政府採購法條文
    """
    if not full_text:
        return "政府採購法綜合"
    
    # 匹配 "政府採購法第XX條"、"採購法第XX條" 及其項款
    pattern = r'(?:政府採購法|採購法)第[零一二三四五六七八九十廿卅\d]+條(?:第[零一二三四五六七八九十廿卅\d]+[項款])?'
    matches = re.findall(pattern, full_text)
    
    if not matches:
        return "政府採購法綜合"
    
    # 去重並標準化條文
    normalized_matches = list(set([normalize_law_article(m) for m in matches]))
    # 排序（依條文數字排序）
    def sort_key(article_str):
        num_match = re.search(r'第(\d+)條', article_str)
        return int(num_match.group(1)) if num_match else 999
    
    normalized_matches.sort(key=sort_key)
    return "、".join(normalized_matches[:5]) # 最多顯示前5個主要條文

def generate_official_link(jid, court, year, case, no, date):
    """
    根據裁判案號資訊生成官方裁判書檢索系統連結
    """
    # 官方查詢網址格式通常可用 JID 參數
    # 例如: https://judgment.judicial.gov.tw/FJUD/data.aspx?ty=JD&id=TPA%2c112%2c%e5%88%a4%2c312%2c20230815%2c001
    import urllib.parse
    
    # 補足序號或格式化
    clean_jid = jid.strip()
    encoded_jid = urllib.parse.quote(clean_jid)
    return f"https://judgment.judicial.gov.tw/FJUD/data.aspx?ty=JD&id={encoded_jid}"

def preprocess_judgments(source_dir, output_dir, chunk_size=150):
    """
    讀取原始裁判書 JSON，進行篩選與分塊輸出
    """
    print(f"[*] 開始從 {source_dir} 讀取原始裁判書...")
    
    matched_records = []
    record_count = 0
    
    if not os.path.exists(source_dir):
        print(f"[Error] 找不到來源目錄 {source_dir}，請確認是否已放置司法院下載的資料包。")
        return
        
    os.makedirs(output_dir, exist_ok=True)
    
    # 遍歷來源目錄中的所有 json 檔案 (司法院資料包通常包含多個大 json)
    for root_dir, _, files in os.walk(source_dir):
        for file in files:
            if file.endswith('.json'):
                file_path = os.path.join(root_dir, file)
                print(f"[*] 處理檔案: {file}")
                
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        
                        # 判斷是否為列表結構
                        if not isinstance(data, list):
                            # 有時司法院 JSON 是字典包裝，例如 {"list": [...]} 或 {"data": [...]}
                            if "list" in data:
                                data = data["list"]
                            elif "data" in data:
                                data = data["data"]
                            else:
                                print(f"[!] 檔案 {file} 結構非預期，嘗試跳過")
                                continue
                        
                        for item in data:
                            full_text = item.get("JFULL", "")
                            title = item.get("JTITLE", "")
                            
                            # 篩選條件：案由或全文中包含「政府採購法」或「採購法」
                            if "政府採購法" in title or "政府採購法" in full_text or "採購法" in full_text:
                                record_count += 1
                                
                                # 提取與解析各欄位
                                court = item.get("JCOURT", "")
                                if not court or court == "未知":
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
                                
                                jid = item.get("JID", "")
                                if not jid:
                                    # 拼湊 JID: 法院代碼,年度,字號,案號,日期,序號
                                    jid = f"{item.get('JID_COURT', 'COURT')},{year},{case},{no},{raw_date},001"
                                    
                                official_link = generate_official_link(jid, court, year, case, no, raw_date)
                                
                                # 組合為精簡版 record
                                processed_item = {
                                    "項次": str(record_count),
                                    "案號": case_num,
                                    "裁判法院": court,
                                    "發文日期": roc_date, # 民國年月日格式，方便前端日期過濾
                                    "主題": f"【{court}】因政府採購法爭議事件判決案", # 用於前端卡片大標題
                                    "依據採購法條文": laws_referenced,
                                    "裁判主文": main_ruling,
                                    "內容": reasons_summary, # 對位至前端 card-body 內容區
                                    "連結網址": official_link,
                                    "資料來源": "司法院裁判書"
                                }
                                
                                matched_records.append(processed_item)
                                
                except Exception as e:
                    print(f"[!] 解析檔案 {file} 失敗: {e}")
                    
    total_records = len(matched_records)
    print(f"[*] 篩選完畢！共匹配到 {total_records} 筆政府採購法相關裁判書。")
    
    if total_records == 0:
        print("[!] 未找到任何政府採購法相關裁判，請確認原始資料是否正確。")
        return
        
    # === 分塊寫出與 Manifest 生成 ===
    total_chunks = (total_records + chunk_size - 1) // chunk_size
    chunks_list = []
    
    for i in range(total_chunks):
        start_idx = i * chunk_size
        end_idx = min(start_idx + chunk_size, total_records)
        chunk_data = matched_records[start_idx:end_idx]
        
        chunk_filename = f"data/judgment_chunk_{i+1}.json"
        chunk_filepath = os.path.join(output_dir, chunk_filename)
        
        # 確保 data 目錄存在
        os.makedirs(os.path.dirname(chunk_filepath), exist_ok=True)
        
        with open(chunk_filepath, 'w', encoding='utf-8') as f:
            json.dump(chunk_data, f, ensure_ascii=False, indent=2)
            
        chunks_list.append({
            "id": i + 1,
            "filename": chunk_filename,
            "records_count": len(chunk_data)
        })
        print(f"[+] 已寫出分塊: {chunk_filename} ({len(chunk_data)} 筆)")
        
    # 寫出 manifest 檔
    manifest_data = {
        "total_records": total_records,
        "total_chunks": total_chunks,
        "chunks": chunks_list
    }
    
    manifest_filepath = os.path.join(output_dir, "data/judgment_manifest.json")
    with open(manifest_filepath, 'w', encoding='utf-8') as f:
        json.dump(manifest_data, f, ensure_ascii=False, indent=2)
        
    print(f"[+] 已寫出索引檔: data/judgment_manifest.json")
    print(f"[*] 裁判書資料預處理圓滿完成！")

if __name__ == "__main__":
    # 預設路徑設定
    source = "./raw_judgments" if len(sys.argv) < 2 else sys.argv[1]
    output = "../" if len(sys.argv) < 3 else sys.argv[2]
    
    # 測試執行
    preprocess_judgments(source, output)
