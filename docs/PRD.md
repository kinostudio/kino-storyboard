# KINO Storyboard 產品需求與開發排程

**版本：** 1.7

**更新日期：** 2026-11-14
**文件狀態：** 整合需求與相對排程基準；不代表全部功能已實作、驗收或可發布。

**整合依據：** PRD v1.6 與本對話後續定案。本文末的 v1.7 增補覆寫衝突舊規格；未覆寫的 R01–R13 繼續有效。舊 execution-plan 等歷史文件尚未搬入此發布儲存庫，不作為已完成證據。

> **最高優先目標：** 把「分鏡創作、拍攝安排、文件交付」的主要操作做清楚，讓每個畫面有明確的下一步。

本文件是完整整合版 PRD，不是功能完成清單。v1.4 未被明確覆寫的需求繼續有效；v1.5 附錄與 2026-10-28 定案只覆寫其中明確衝突處。每項狀態依實際驗收證據記錄。程式碼存在、單元測試通過或隔離桌面瀏覽器可操作，都不能單獨證明正式資產往返、iPad 真機或正式 PDF 通過。

## 1. 產品定位與交付目標

第一版面向單一有效編輯者，讓導演由文字與參考圖建立分鏡，讓製片依拍攝日安排既有鏡頭，並產生可帶到現場的分鏡與通告文件。離線優先、可靠保存、可復原及可驗證的備份交接，是核心工作流程的前提。

主要使用者與工作結果：

| 使用者 | 主要工作 | 預期結果 |
|---|---|---|
| 導演／分鏡創作者 | 由腳本參考建立場次與鏡頭、編輯畫面／VO／SUPER／秒數、整理參考圖及手繪 | 依敘事次序可辨識、可編輯、可保存的分鏡 |
| 製片／拍攝安排者 | 將既有鏡頭安排到拍攝日、設定分鐘或固定時段、規劃跨日製作任務 | 拍攝順序與敘事順序分離，安排引用原鏡頭且可復原 |
| 現場工作者 | 查閱當日集合資訊、Rundown 與分鏡圖 | 可讀取當日順序、所需鏡頭及文件版本 |

核心流程：

1. 建立專案，保存完整劇本參考，再由使用者人工拆分場次與鏡頭；原稿不自動解析或改寫。
2. 在分鏡主要工作區挑選鏡頭、編輯內容、排序並管理照片／手繪。
3. 將鏡頭加入拍攝日並安排日內順序、拍攝分鐘或固定時段；更動排程不改敘事排序。
4. 預覽並輸出固定 revision 的分鏡文件或通告單；另以完整專案封裝備份／交接，並能在乾淨環境重新匯入驗證。

## 2. 首版範圍與明確非目標

### 2.1 首版範圍

- 離線優先的網頁應用；目標平台為 Windows Chrome／Edge 與 iPadOS Safari。完整 iPad 核心編輯與基本手繪屬必要驗收目標。
- 專案、照片、Drawing、輸出偏好及版本需按各自 schema 保存；同專案採單一有效寫入者，避免多分頁以舊 revision 覆蓋新內容。
- 主要工作區包括分鏡、拍攝安排及文件輸出；拍攝日可多個，每個 Shot 依目前模型最多一筆有效拍攝安排。
- JPEG／PNG 照片、鎖定參考底圖、固定筆寬手繪、Scene／Subject 兩個可變圖層及逐筆復原屬 R11 範圍。HEIC 若無法可靠解碼，須明確說明，不可無聲失敗。
- 第一版正式文件範圍包含分鏡 PDF 與依拍攝日輸出的通告文件；此範圍已納入 WP-08。較早的隔離 Chromium 真實影像 fixture 涵蓋 9 張影像，純圖橫／直式各 3 頁、細項橫式 3 頁、細項直式 5 頁（每頁 2／2／2／2／1 鏡）。後續修復案例以真實 PNG、可再編輯 Drawing 與 14,945 字長文組合，產生並檢查實際 Chromium PDF：橫式 16 頁、直式 14 頁，頁面分隔與續頁 markers 可見。更大圖量、其他畫幅／density、Edge、紙本及真 iPad 驗收仍待完成。
- 專案封裝需帶有 manifest、Project／Drawing 資料、必要原始資產及雜湊，可在另一環境重新編輯。CSV／Markdown 不是完整封裝格式。

### 2.2 延後或排除

- AI 自動拆鏡、雲端帳號與多人即時共編、任意自訂欄位、手機完整編輯器、剪輯時間軸、影片剪輯、逐格時間碼及 Git 操作不在首版範圍。
- 完整自由圖層樹、套索、進階筆刷、文字圖層、跨鏡可變背景連動與原生 PencilKit 替代承諾不屬 P0。
- 壓感屬 G1 實機技術門檻後的條件功能；固定筆寬與手動調整不可因此延後。
- 本版借用通告資訊分區作為需求參考，不承諾 STB 專案格式、匯出格式或功能相容。
- 完整演員／工作人員名冊、人事、服化道、交通、保險、餐務、許可、成本或後勤管理不屬此版通告輸出範圍。

## 3. 資訊架構與主要互動

### 3.1 分鏡工作區

桌面主要工作區沿用原版**緊湊三欄**：左側場次、中間鏡頭清單、右側鏡頭編輯區。清單／圖庫可作中間清單區的輔助檢視，不得取代或重組這條主要操作路徑。狹窄版面可將詳細編輯器改成抽屜，但須保留目前鏡頭、捲動位置及未提交草稿。

標題、畫面描述、VO／台詞旁白、SUPER 與影片秒數可直接編輯。欄位閒置時不顯示框線；焦點移入右側編輯區時短暫閃動，提示目前鏡頭位置。提示結束後仍保留持續可見的焦點標示；開啟減少動態效果時提示保持常亮。焦點提示不能取代鍵盤焦點、只靠顏色傳達狀態，或干擾中文輸入法組字、游標與讀屏。

卡片／清單空白拖曳區按下並移動即可開始排序，不等待 500 ms 長按。輸入欄位、照片控制、功能按鈕不啟動排序。分鏡拖曳只改目前 Scene 內的敘事次序；鍵盤及可點按的上移／下移入口亦須可用。搜尋期間不可將可見子集誤作全清單而改寫全域排序。

觸控／粗指標環境的分鏡清單與圖庫在右側保留 44 CSS px、可見並標示「滑動」的捲動通道；沿通道垂直滑動只捲動頁面，不改變鏡頭順序。清單與圖庫都須保留此操作入口。

場次編號與鏡次編號獨立：場次依 Scene 順序顯示；每場的鏡次依本場 `shotOrderByScene` 自動分配。使用者鎖定的鏡次保留原號，未鎖定鏡頭依序取得未占用的正整數並跳過已鎖定號碼；不同場可重用相同鏡次，顯示不補零。跨場移動的鎖定鏡頭若與目的場另一個鎖定號碰撞，必須明確拒絕，不得靜默改號。重編先提供不寫入的預覽，確認後以一筆可 undo／redo 的批次命令套用。

### 3.2 拍攝安排與製作時程

- 拍攝日以頁籤導覽，保留 `shootingDayOrder`。每個拍攝日包含日期、標題及集合時間；通告地點、legacy 聯絡人／電話、預計收工、製作公司／統編，以及結構化聯絡人、大組 call、車輛和注意事項均為可選資料，缺少時留空。
- 每日拍攝項目引用既有 Shot；拍攝次序與 `sceneOrder`／`shotOrderByScene` 分開。跨日移動一次原子更新日別及兩日順序，不複製 Shot 或留下重複排程。
- 日內項目可切換「自動順延／指定時段」。固定時段提供開始、結束、獨立的「開始於翌日／結束於翌日」選項及套用動作；開始翌日把開始時刻移至拍攝日次日，結束翌日表示結束時刻在開始時刻的下一日。可選布林 `ScheduleEntry.startNextDay` 缺省時維持舊資料的拍攝日當天語意，且不回寫預設值。桌面時間欄可將常見輸入（如 `09:30`、`9.30`、`930`、`2359`）正規化為 `HH:mm`；無效值保留草稿並拒絕提交。觸控裝置保留原生時間輸入。
- 固定時段重疊時依 D02 保留原固定值並顯示衝突，不靜默搬移或覆寫；空檔為說明資訊，不是自動建立的排程項。`Shot.durationSeconds` 是影片秒數，`ScheduleEntry.minutes` 是現場拍攝分鐘，兩者不得混用。
- 製作時間軸有跨日任務條，以及每個拍攝日的一個日期標記列。任務列與標記列共用 `productionTimelineOrder`，可垂直混排；任務可排在拍攝日標記上方。列順序獨立於拍攝日頁籤順序並可保存、undo／redo。時間條水平移動／拉伸才改日期或區間；垂直改列順序不改日期。
- 桌面拍攝安排支援 Ctrl 點選切換、Shift 範圍選取及多選拖曳；組內順序須保留，成功移動視為一筆可撤銷命令。iPad 須有不依賴 Ctrl／Shift 的明確選取及組合移動方式。

### 3.3 輸出工作區

分鏡輸出含「純分鏡圖」與「包含鏡頭細項」兩種模式，輸出偏好 v2 分別保存欄位與最近有效設定。通告單預覽與輸出包含三個資訊區：**通告時間軸、Rundown、分鏡圖**。可輸出所選單日或全部拍攝日；全部輸出於同一份文件按 `shootingDayOrder` 分日，空日仍保留日期與空日提示。

輸出須固定同一份 Project／Drawing revision，且預覽不得因搜尋條件暗中縮小匯出範圍。正式輸出需是真正產生的 PDF；瀏覽器預覽或 `window.print` 對話框不是 PDF 驗收證據。

## 4. 正式需求（R01–R13）

以下沿用 PRD v1.4／`docs/prd-v1.3.json` 的需求編號與優先序。表中驗收條件為最低門檻；對應 AT 案例、2026-10-28 修訂與工作包出口條件同時適用。

| ID／優先序 | 需求 | 最低驗收條件 |
|---|---|---|
| R01 P0 | **專案保存與復原。** Project、照片原檔、Drawing、Scene／Subject layers、筆跡、畫幅、輸出偏好與必要快照各按契約保存。只有交易成功才顯示已保存；本機保存不等於外部備份。 | 關閉重開、快照及封裝往返後，revision、ID、順序、內容與資產引用一致；注入交易／配額失敗時不偽報成功，保留最後可開啟版本及恢復入口。 |
| R02 P0 | **場次與分鏡編輯。** Scene 是場景容器；Shot 保留畫面、腳本／VO、聲音、景別／運鏡、標籤與影片秒數。空狀態、搜尋無結果、保存失敗均提供下一步。 | 從空白專案新增場次與鏡頭，編輯多行中文、切換工作區再返回，內容／草稿／焦點正確。VO 與 SUPER 各自顯示正確原文來源；SUPER 不併入舊 script。 |
| R03 P0 | **場次、鏡號與排序。** Scene／Shot 有穩定 ID；敘事排序與拍攝排序分離；每場獨立編鏡，鎖定鏡次保留，未鎖定鏡頭依序避開已用號碼；鎖號及重編需預覽。場次數字靠右、場次名稱靠左，數字欄寬依最大位數同步擴縮。Scene、Shot、Slate、Take 語意分離。 | 由 9→10、99→100 及刪除／復原跨位數時全表欄寬一致調整；排序或搬場不破壞穩定 ID／排程引用；跨場鎖號碰撞明確拒絕；不補零、不把 Slate 或 Take 當鏡頭 ID。 |
| R04 P0 | **圖片資產。** 支援多張參考圖、主圖、明確排序及解除引用；原圖為不可變資產，裁切需主動設定並可還原。移除某 Shot 的引用不影響其他 Shot 共用的不可變原圖。 | Shot 可選擇保存 `photoCropsByAssetId`，由嚴格 schema 驗證；設定／還原可 undo／redo，複製鏡頭會複製裁切，移除照片會清掉該引用。新 Drawing 使用 v2 固定底圖裁切快照（`backgroundCrop`）；Shot 後續裁切不改變既有 Drawing，換／移除底圖會清除裁切且 undo 還原，原圖與筆跡保持不變。舊 Drawing v1 維持無裁切欄位並按完整原圖顯示。隔離 Chromium 原生 IndexedDB／Worker package 測試驗證 v2 與 v1 匯入、copy Asset ID remap、來源及副本 SHA-256 相同，5/5；另有 Drawing Model 11/11 與隔離瀏覽器底圖保存／替換／移除／undo／redo／重載驗證。R04 整體仍 `in_progress`；真照片 EXIF／iPad、完整封裝矩陣與一般編輯的既有 Asset 全量 hash 保證未驗。 |
| R05 P0 | **拍攝安排。** ScheduleEntry 引用 Shot；一鏡最多一筆有效排程；待排池不自動加入鏡頭。分鐘、固定／自動時段、狀態與影片秒數分離。 | 改日內排序只影響拍攝次序；固定時段與自動順延按規則計算；跨夜明示；gap 是純文字；修改影片秒數不變更拍攝分鐘，反之亦然。 |
| R06 P0 | **復原與重做。** 新增、修改、刪除、重排、資產關係及每筆手繪依持久命令歷史處理。 | 一個完成的使用者手勢為一筆可撤銷操作；逐筆 undo／redo 後內容、ID、排序、資產引用及 Drawing revision 一致。 |
| R07 P0 | **舊資料遷移與完整封裝。** 遷移輸入唯讀；先檢查及預覽，再建立新專案；未知／損毀資料不覆寫目前專案。封裝包含重新編輯所需原圖與筆跡資料。 | 取消／失敗時原資料及當前專案不變；阻擋重複 ID、孤兒引用、未知 schema、缺資產及錯誤雜湊；乾淨環境成功往返後仍可逐鏡編輯。 |
| R08 P0 | **文件預覽與輸出。** 分鏡純圖／細項模式，selected／all 拍攝日範圍，固定 revision；長文可續頁、圖像保留畫幅、缺圖明示。 | 真實 PDF parser 與逐頁視覺檢查；正文至少 9 pt，無漏字／裁字／錯版；orientation 與模式變更不清除選擇；輸出版本與來源 revision 可追溯。純圖及通告詳細規格見第 7 節。隔離 Chromium 長文案例曾產生 A4 橫式 12 頁／直式 11 頁、44 個 markers 順序正確、每頁頁首／頁尾可見且無空白頁；短文與純圖 2×2 佔位框測橫直方向，output tests 16/16。9 張真實影像 fixture 四種模式依序為純圖橫／直式 3／3 頁、細項橫式 3 頁、細項直式 5 頁；直式細項 9 鏡分布 2／2／2／2／1。後續混合 fixture 加入真實 PNG、可再編輯 Drawing 與 14,945 字長文，修復後產生並逐頁檢查實際 Chromium PDF：橫式 16 頁、直式 14 頁，分頁與續頁 markers 可見。WP-08 仍 `in_progress`；較大圖量、其他畫幅／density、Edge print、紙本及真 iPad／其他設備仍待驗。 |
| R09 P0 | **搜尋與鍵盤操作。** 可搜尋畫面、腳本、聲音、鏡號及標籤；顯示命中數。Tab／Shift+Tab、Enter／Esc 行為一致，焦點及狀態不只靠顏色或 hover。 | Windows 原生注音 IME 組字、貼上長文及鍵盤操作不因重繪或快捷鍵中斷；輸出密度等控制可用鍵盤調整；焦點可見。 |
| R10 P0 | **iPad 操作與自適應。** iPadOS Safari 與 Windows 桌面皆為目標；支援橫直向、軟鍵盤、觸控替代操作與基本編輯閉環。觸控區目標至少 44×44 CSS px；不要求 hover、Ctrl／Shift 或精確滑鼠拖曳。 | 指定真實 iPad 完成建案、編輯、排序、照片／手繪、拍攝安排、輸出與封裝核心閉環；旋轉、切換畫布模式及軟鍵盤不遺失已保存內容或草稿。模擬視窗不算真機通過。 |
| R11 P0 | **iPad 手繪與可再編輯保存。** JPEG／PNG 匯入、空白畫布、照片加註、固定基本筆刷、雙指縮放／平移、Scene／Subject 兩層、逐筆 undo／redo。參考照片鎖定且不可變；複製上一鏡場景筆跡須建立新 Drawing／layer／stroke ID。 | 真機以手指／筆完成創作與切換；重開及封裝後筆跡可再編輯，來源照片 hash 不變，複製鏡與原鏡可各自修改／撤銷。衍生預覽不能取代原始向量資料。 |
| R12 條件 P0 | **壓感與替代行為。** 壓感僅在 G1 以相容實機、有效變化 pressure 樣本與校準通過後啟用；否則明確標 deferred／not_checked。固定線寬、手動線寬、觸控與滑鼠替代仍是 P0。 | 輕／中／重筆畫寬度須單調變化且可重開一致；全 0、全 0.5、缺欄或無壓感筆不可假稱支援。AT17 不通過不阻止基本固定線寬驗收。 |
| R13 P0 | **畫幅與顯示一致性。** 合法畫幅 16:9（預設）、1:1、4:3、2.35:1；紙張方向獨立。列表、選圖、畫布及文件共用專案比例。 | 各畫幅圖框誤差不超過 1%；不拉伸、不暗中裁切；空白／舊案缺值以 16:9 遷移；重開、復原、封裝及輸出一致。 |

## 5. 2026-10-28 使用者定案（A01–A15）

本節將附錄決策併入主規格，以便產品、工程與 QA 直接引用。欄位／排序／輸出偏好屬 canonical Project 或版本化輸出偏好；其實作狀態另見第 10 節。

| ID | 正式定案 |
|---|---|
| A01 | 每個 Shot 新增獨立 `Shot.super`，編輯器排在既有台詞／旁白欄之後。舊專案缺值視為空；不從 script、畫面描述或其他文字推測。 |
| A02 | 卡片分開顯示 VO／台詞旁白與 SUPER。VO 來源為 `Shot.script` 原文，SUPER 來源為 `Shot.super`；空值不顯示空標籤，禁止依文字前綴自動分類。 |
| A03 | 提供獨立 VO 彙整輸出開關；按 `sceneOrder` 與 `shotOrderByScene` 收集非空 script 原文，保留換行、原文及鏡次追溯，不改寫、不去重、不猜測類型。 |
| A04 | 分鏡卡空白區按下並移動即開始直接拖曳，不設 500 ms 等待。欄位、照片控制與按鈕不啟動排序；只改目前 Scene 內次序。鍵盤／點按替代操作保留。 |
| A05 | 拍攝安排支援桌面 Ctrl 切換與 Shift 範圍多選、保留組內次序的群組拖曳；iPad 提供明確等效選取。跨日移動須單一原子更新，不複製 Shot。 |
| A06 | 日內安排可明確切換自動順延／指定時段。桌面時間文字正規化，無效值不得提交；觸控裝置使用原生時間欄。固定時段衝突遵守 D02，不靜默修改。 |
| A07 | 每頁鏡數依模式、紙張方向、Project 畫幅、欄位與可讀版面動態限位，最小 1、最大 12。超過新上限須明示夾限，純圖／細項各自保存最近有效設定；長文續頁，不得低於 9 pt。 |
| A08 | Shot 標題為空或全空白時，任何卡片、排程引用、分鏡 PDF 或通告單都不產生「未命名鏡頭」等替代標題、空標籤或假資料。 |
| A09 | 純圖提供獨立開關，順序為鏡次、標題、VO／台詞旁白、SUPER、秒數；預設全關。全部關閉即只輸出圖像；四鏡預設 2×2。秒數為 0 時寫「秒數未估」，不是 0 秒。 |
| A10 | 通告／拍攝安排文件支援單日或全部拍攝日；全部輸出按 `shootingDayOrder` 分日，保留空日、跨頁日期與固定 revision。 |
| A11 | `Project.title` 可編輯；新增 `projectType` 列舉 `film`／`script_plan`，新案與舊案缺值採 `film`；舊資料遷移 deterministic，不改寫 Shot。 |
| A12 | 拍攝日頁籤順序 `shootingDayOrder` 與混合時程列順序 `productionTimelineOrder` 分開保存。任務列與拍攝日標記列可垂直混排，任務可排在標記列上方；條形水平移動／調整端點改日期或區間。列順序可 undo／redo。 |
| A13 | 通告單包含「通告時間軸／Rundown／分鏡圖」三個內容區。此為資訊架構參考，不宣稱 STB 格式、schema 或功能相容。 |
| A14 | 桌面分鏡主要工作區固定採原版緊湊三欄；清單／圖庫只作輔助，不取代三欄主操作路徑。 |
| A15 | 卡片文字欄位無框直接編輯；選鏡時右側編輯區短暫閃動提示焦點，之後保有可見焦點；減少動態效果時常亮，輸入法組字與讀屏不可受影響。 |

## 6. 資料、保存與風險控制

### 6.1 Canonical 資料邊界

- `Project` 保存標題、類型、畫幅、`sceneOrder`、`shootingDays`、`shootingDayOrder`、製作任務與相應 revision。輸出偏好另以版本化 preference 保存，不混入創作 undo。
- `Scene` 是場景容器；`Shot` 有穩定 ID、敘事位置、畫面、script、SUPER、聲音、景別／運鏡、秒數、資產引用及 Drawing 引用。顯示鏡號由規則計算或依鎖號契約保存，不能替代 ID。可選 `shotNoLocked` 缺省／false 表示自動編號；true 表示保留 `shotNo` 中的無前導零正整數。舊資料的任意 `shotNo` 字串不推斷為鎖定，載入時不改寫。鏡次解析先保留同場所有鎖定號，再依敘事順序為未鎖定鏡頭取未占用號碼；同號可出現在不同 Scene。鎖定時快照目前解析出的顯示號；跨場鎖定碰撞拒絕移動。重編預覽不寫資料，確認後只批次更新未鎖定鏡頭並形成一筆歷史命令。
- `ScheduleEntry` 以 `shotId` 引用 Shot。每個 Shot 的拍攝安排最多一筆有效紀錄；拍攝排序不修改 Scene／Shot 敘事次序。固定時段的 `startTime`、`endTime`、可選 `startNextDay`、`endNextDay` 與 `minutes` 必須一致；舊紀錄省略 `startNextDay` 時依同日開始解讀並保留欄位缺省。
- `ShootingDay` 是拍攝日唯一來源；通告欄位在 Project schemaVersion 1 中均可省略，投影缺值為空白而不回寫預設。可選 scalar 為 `location`、legacy `contactName`／`contactPhone`、`expectedWrap`、`productionCompany`、`businessNumber`；可選集合為 `contacts[{id, position, name, phone, onCall}]`、`groupCalls[{id, group, location, time}]`、`vehicles[{id, label, plate, driver, driverPhone, passengers}]`、`notices[{id, text}]`。`expectedWrap` 與大組 `time` 可空或為 `HH:mm`；預計收工不覆蓋依日內排程計算出的收工。Legacy 聯絡 pair 若未由結構化列表示，Bridge 投影為 `legacy-primary`；結構化聯絡人保存順序並權威，首筆有姓名或電話的 row 會鏡像至 legacy scalars。新增這些 optional 欄位不 bump Project schemaVersion。Project 層級 `productionTasks` 代表跨日工作，不帶 `shotId` 或日內時分；任務日期重疊可表示平行工作。
- 多張照片以不可變原圖 Asset 引用，需清楚保存排序與主圖選擇；解除 Shot 引用不得刪除仍被其他 Shot、快照或 Drawing 使用的原圖。照片縮圖與 Drawing 預覽為可重建衍生資產，不是唯一資料來源。
- Drawing、Layer、Stroke 各有穩定 ID。Drawing v2 明確保存 `backgroundCrop`（`null` 表示完整原圖，否則為嚴格正規化矩形，相對套用 EXIF 顯示方向後的原圖）；v1 省略該欄位並保持完整原圖行為。新 Drawing 可將建立當下 Shot 照片裁切固定為快照，後續 Shot crop 不會隱式傳播；更換／移除背景 Asset 會清空該快照，undo 可還原。複製上一鏡場景筆跡時重新建立 Drawing／Scene layer／每筆 stroke ID；只有 hash 完全一致的不可變照片原檔可共用 AssetId。

### 6.2 交易、遷移與輸出一致性

- UI 不直接拼改零散陣列。一次有效操作透過 Model／Bridge 命令原子更新內容、排序、引用、revision 及必要歷史；交易成功前不得顯示已保存。
- 健康條件下文字變更於 500 ms 內排入寫入，2 秒內完成並標示保存時間／revision。失敗時維持最後成功版本、保留可恢復內容與常駐錯誤提示；不以 seed 或示意資料掩蓋錯誤。
- 同一專案多分頁採單寫入者 lease 與 revision 比對。通知不是鎖的權威；過期 revision 不能覆寫新資料。
- 遷移先複製唯讀來源，產生差異報告及預覽，使用者確認後才建立另一個新專案。未知 schema、損毀 manifest、重複 ID、孤兒引用、缺資產或 hash 不符時阻止提交並保留來源。
- PDF 以輸出開始時捕獲的單一 Project／Drawing revision、偏好及驗證過的資產生成；後續編輯不混入該文件。封裝需包含可繼續編輯所需的 canonical 筆跡、底圖與來源資產，不以合成縮圖取代。

### 6.3 時間、排序與照片資料風險

主要資料風險是把影片秒數和拍攝分鐘混用、把拍攝次序誤當敘事次序、跨日移動造成重複排程、固定／自動時段互相覆寫，以及照片解除引用誤刪其他鏡頭仍使用的原檔。這些操作需具備原子提交、明確確認／提示、undo／redo 與重開後檢查。Shot per-Asset 裁切用於鏡頭卡與輸出；新 Drawing v2 可保存獨立、固定的底圖裁切快照，舊 v1 仍以完整原圖顯示。隔離 native IndexedDB package 案例驗證生成 PNG 的 v2／v1 匯入與 copy 往返；真實 EXIF／iPad 及完整資產 hash 契約仍未驗，R04 尚不可標 passed。

## 7. 文件輸出規格

### 7.1 分鏡文件

| 項目 | 規格 |
|---|---|
| 純圖模式 | 以圖像為主；可選鏡次、非空標題、VO／台詞旁白原文、SUPER、秒數，依此順序置於圖像下方。五個開關預設全關；全關時沒有空資訊列。四鏡純圖固定 2×2。 |
| 細項模式 | 一鏡一列、單欄序列；橫式圖左文右，直式圖上文下；鏡次保留，標題非空才出現。畫面描述、script、SUPER、聲音、景別／運鏡、秒數依偏好顯示非空內容。 |
| density | UI 目標 1–12；依模式、方向、Project 畫幅、欄位與可讀空間動態計算可用上限，不能將 12 當固定可用值。超長內容可以減少實際每頁鏡數並續頁。 |
| 圖片與文字 | 不拉伸、不暗中裁切；完整顯示圖片，除非使用者明確選擇可還原裁切。正文最小 9 pt；長文續頁並保留場次／鏡次識別，不漏字、不縮至不可讀。 |
| 頁面 | A4 直式／橫式與 Project 畫幅分開；頁首／頁尾可標專案名稱、類型、revision、輸出日期與頁碼。輸出範圍明確，搜尋不改變「全部」。 |
| 文字來源 | VO／台詞旁白為 `Shot.script` 原文，不以字首分類；SUPER 為 `Shot.super`。標題空值不產生替代名稱。影片秒數 0 可顯示「秒數未估」。 |

v1.5 的 output v2 明確覆寫 v1.4 D06 原本「純圖完全不可顯示文字」的衝突部分：純圖可選顯示上述五欄；其餘 D06 的比例、2×2、完整可讀與頁面識別原則延續。v1 preference 遷移只轉換輸出偏好，不更改 Project 或 Shot 內容。

### 7.2 通告單

通告輸出允許選單日或全部拍攝日。全部輸出依 `shootingDayOrder`，每日以日期、日標題與集合時間分組；空日保留日期與「尚無排程項目」。三個內容區可以跨多頁，屬同一份固定 revision 文件：

1. **通告時間軸：** 專案名稱、拍攝日、集合時間；有填資料時才顯示地點與聯絡資料；依日內 ScheduleEntry 顯示時間、分鐘、break、gap 與 overlap。
2. **Rundown：** 依日內排序列出鏡次、非空標題及拍攝時間；縮圖、備註、狀態按偏好選擇。Break 是活動資訊，不附 Shot 縮圖。
3. **分鏡圖：** 依拍攝順序列出已排 Shot 的分鏡圖，可選鏡次及標題；不把 break 當作 Shot。

通告不預設塞入完整劇本／台詞、美術或攝影長篇細項，避免遮蔽現場順序資訊。現有預覽或三區 UI 不能代替正式 PDF 解析、逐頁視覺檢查及目標紙本檢查。STB 僅為可核對的資訊架構參考；產品、文件或發版說明不得標示「STB 相容」。

## 8. 驗收矩陣與發布門檻

### 8.1 驗收層級

| 證據層 | 可以證明 | 不能替代 |
|---|---|---|
| Schema／Model／repository 測試 | 資料不變條件、原子命令、migration、失敗恢復的指定程式範圍 | 真瀏覽器 UI、實際資產檔往返、PDF、iPad |
| 隔離桌面瀏覽器操作 | 指定桌面瀏覽器情境的焦點、操作、保存／重開 | 完整鍵盤／IME／讀屏矩陣、真實觸控、Pencil、正式 PDF |
| 真實輸出文件 | 指定 PDF 的 parser 結果、逐頁版面與紙本可讀性 | 未測的輸出選項、另一組版型或其他 revision |
| 真實裝置與使用者任務 | 記錄型號、OS／Safari、配件及步驟下的實機操作 | 未列入矩陣的 iPad 尺寸、Pencil 型號、瀏覽器或全體使用者 |

### 8.2 核心 AT 驗收組

沿用 PRD v1.4 AT01–AT20，並加入 A01–A15 對應案例。最低覆蓋如下：

- **AT01–02：** 正式保存、重開、資料／資產一致、寫入中斷、配額不足及緊急恢復；已保存 revision 必須可開啟。
- **AT03：** Windows Chrome／Edge 原生注音 IME、長文、貼上、焦點與 Tab／Shift+Tab；iPad 軟鍵盤／草稿另以真機測試。
- **AT04、AT19：** 場次／鏡號、Slate／Take、鎖號、遷移、兩種排序及引用一致。
- **AT05：** fixed／auto、gap、明確開始翌日與結束翌日、overlap、無效時間及影片秒數／拍攝分鐘分離。
- **AT06、AT15：** 命令與筆跡逐筆撤銷／重做；至少 100 筆畫、10,000 採樣點，失敗中斷後不損壞已提交資料。
- **AT07–08、AT16：** 唯讀遷移預覽、封裝 staging、乾淨環境 package 往返與 asset hash；失敗不得替換目前專案。
- **AT09、AT20：** 純圖／細項、欄位、density、方向、四種畫幅、真實 PDF 逐頁、同 revision、長文續頁、最小 9 pt 及圖片比例誤差不超過 1%。
- **AT10：** 同專案第二分頁不覆寫新 revision；Windows 500 鏡／50 場／10 拍攝日／500 張、總 250 MB 資產，開啟 ≤5 秒，搜尋／改序 p95 ≤200 ms，健康提交 ≤2 秒。
- **AT11–14、AT18：** 指定真實 iPad 無鍵鼠完成核心閉環；觸控目標、橫直向、分割視窗、照片匯入、畫布、掌觸、取消、縮放、固定線寬及大型專案測試。畫筆呈現 p95 ≤50 ms，500 鏡專案開啟 ≤8 秒，搜尋 p95 ≤300 ms；每個正式組合至少重跑 3 次。
- **AT17：** 條件式壓感校準；未提供有效硬體樣本時標 deferred／not_checked，不能以模擬樣本宣稱通過。
- **A01–A15：** 舊 script 未改寫、SUPER 逐鏡獨立、VO 原文彙整、空標題、拖曳取消／多選、時間輸入、動態密度、單日／全日通告、專案類型、混合時程列排序及復原，逐項依第 5 節驗收。

### 8.3 發布條件

發布前需所有適用 P0 與必備 AT 通過；阻斷及重大缺陷為零，一般已知問題具影響說明與產品決策；儲存、匯入、封裝、PDF、iPad 及回退證據可追溯；產品／工程／QA 簽核。R12 壓感依 G1 決定通過或明確延期。未驗設備、未驗 PDF、未完成封裝往返或正在整合的需求不可寫成通過。

升級前須保留可恢復快照；程式回退應使用升級前專案副本，不可用舊 schema 覆寫新資料。MVP 完成與否以發布門檻及簽核為準，不以 Site 部署、程式碼存在或測試總數代替。

**最終公開交付（使用者指定）：** 所有適用 P0、必備 AT、G0–G8 發布條件及產品／工程／QA 簽核完成後，才將核准的 release commit 推送至 GitHub，並發布公開 GitHub Pages。交付須包含可開啟的公開網址、來源 commit／部署識別，以及在公開線上版本實際操作核心流程的驗收紀錄。不得在上述發布條件完成前公開 Pages；既有私人部署、隔離瀏覽器或視窗模擬不替代公開線上驗收。真實 iPadOS Safari、Apple Pencil／固定線寬替代行為、原生列印及紙本等門檻仍依 G1、G6、G8 與本 PRD 的適用條件驗收，不能因公開網址可用而升級狀態。目前 `.github/workflows/deploy-pages.yml` 僅以 `workflow_dispatch` 手動觸發；尚未公開部署或完成線上驗收。

## 9. 開發工作包、依賴與狀態

### 9.1 工作包

目前唯一排程來源為 `docs/execution-plan.json` v1.5；下表保留其狀態。WP-01／02 為各自範圍內 verified，並不表示全產品發布驗收通過。

| 工作包 | 範圍與主要出口條件 | 相依 | 計畫狀態（2026-10-28） |
|---|---|---|---|
| WP-01 | 非同步啟動接點、storage adapter、legacy 保留 harness；隔離 schema／遷移／啟動驗證 | — | `verified` |
| WP-02 | IndexedDB repository、原子交易、分頁 lease、故障恢復；提交成功後才顯示保存 | WP-01 | `verified`（repository 範圍；主 UI／裝置 gate 尚未通過） |
| WP-03 | 非同步 Model API、app boot／command runner 整合；回歸中文輸入、選取、保存、排序及舊草稿 | WP-01、WP-02 | `in_progress`（execution-plan 內部狀態 `architecture_in_progress`） |
| WP-04 | 持久命令歷史、checkpoint、cloneShot／reuseSceneLayer；資料與歷史同一原子流程 | WP-03 | `in_progress`（本輪新增保存失敗／重試模型測試及 native IndexedDB historyDelta abort 證據；完整 WP-04 出口條件仍未通過） |
| WP-05 | 原圖、多照片、縮圖、主圖／排序／解除引用及 hash 驗證；不可誤刪仍被引用資產 | WP-03、WP-04 | `in_progress`；既有照片管理、Shot per-Asset crop map、嚴格驗證、設定／重設與歷史操作、卡片／輸出顯示及 package copy remap 證據保留。Drawing v2 的固定底圖裁切快照與 v1 相容另經隔離 Chromium／原生 IndexedDB package 5/5 驗證（生成 1×1 PNG，來源／副本 SHA-256 相同）。真照片 EXIF／iPad、一般編輯時既有 Asset 全量 hash 保證與完整 WP-05 出口仍未驗；本輪不升級狀態 |
| WP-06 | Drawing layers、逐筆資料、鎖定底圖、畫布與 iPad 輸入；保存、復原及 asset 一致 | WP-04、WP-05 | `in_progress`（既有圖層／場景複用桌面隔離證據持續有效。Drawing v2 固定保存 `backgroundCrop`，v1 無欄位仍為完整原圖；Model 11/11 與隔離 Chromium／原生 IndexedDB 驗新建快照、換／移除背景清除 crop、undo／redo／重載還原，以及原圖 bytes/hash 不變。後續修正 `pointercancel`／`lostpointercapture` 僅取消相同 pointer ID 的筆畫；隔離 Chromium／原生 IndexedDB 驗非目標取消不丟筆、目標取消零提交。另以兩張 PNG 驗證共用原圖引用解除、Drawing 底圖明確替換／移除、取消零寫入、undo／redo 跨重開保存，兩個 vector layers 及原圖 bytes/hash 不變；注入一次 `QuotaExceededError` 後 Project／Drawing／history 不變，重試只提交一次。此為限定桌面證據；真 iPadOS Safari／Pencil、壓感校準及完整出口仍未驗） |
| WP-07 | `.storyboard.zip` 匯出與 staging 匯入；manifest、schema、ID、資產與 hash 驗證 | WP-04、WP-05、WP-06 | `in_progress`（44 項 package Node 測試與小型 UI 往返通過；新增隔離 Chromium module-level stress 以 4 張生成 1536×1536 PNG、500 鏡、500 Drawing、4,000 strokes／96,000 points 完成約 38.8 MB package 與另存副本往返，Project/Drawing 與 asset bytes/hash 相同；CRC、manifest hash 及自訂超限均拒絕。實測匯出約 0.53 秒、匯入約 0.33 秒、可見約 1.0 秒 main-thread long task；heap 取樣約 0.33–0.38 GB（首次匯入）及 0.88–1.0 GB（保留多份 fixture／archive），不是 RSS／peak。這不是 app UI、iPad 或 provisional 20 MiB／500 MiB 上限壓力驗收；工作包仍未通過出口） |
| WP-08 | 同 revision 繁體中文 A4 分鏡與通告文件；純圖、細項、VO 彙整、單／全日通告、PDF 逐頁驗收 | WP-04、WP-05、WP-06、WP-07 | `in_progress`；既有續頁 selector、長文 12／11 頁與 44 markers、短文及純圖 2×2 佔位框、9 張真圖四模式 3／3／3／5 頁及通告 E2E 證據保留。混合 fixture 以真 PNG、可再編輯 Drawing 與 14,945 字長文產生並檢查 Chromium PDF：橫式 16 頁、直式 14 頁；純圖五欄 × 四畫幅 × 橫直 8 份限定 PDF 案例通過。另有 print-preparation 實作及隔離 Chromium 實際 app handler、CSS print media 與 PDF 驗證：橫式 12 頁、直式 10 頁，頁面無 overflow；於 image decode、snapshot capture、版本變更時取消皆未誤呼叫 `window.print`，會恢復 preparation 狀態。另以真資產 fixture 驗得 A4 橫式 3 頁、9/9 張圖載入且無頁框溢位，含可編輯 Drawing 內容。`window.print` 在測試中攔截，非原生 Edge 對話框或實紙驗收。全專案 Node suite 234/234 passed，但不等同 WP 出口；原生 Edge print、實紙、真 iPad、較大圖量與完整矩陣仍未驗，WP-08 未完成 |
| WP-09 | 故障恢復、效能、跨瀏覽器／真機、真案試用、發版與回退 gate | WP-03–WP-08 | `planned` |

**依賴關鍵路徑：** Repository → Model／command runner → history／assets → Drawing → package 與 PDF → 真實裝置及 release gates。契約、版型試作可與不相依工作平行；不可在 schema、資產或來源 revision 未確定前宣稱整合驗收。

### 9.2 相對週程

v1.4／execution-plan 的規劃基準為 20 個活躍工作週加 2 週風險緩衝。W1 是人力與環境到位後首週；下表為相對工作窗，不是日曆日期承諾。工作包未滿足出口條件不得只因跨到下一週就升級狀態。

| 相對週 | 工作重點 | Gate／出口 |
|---|---|---|
| W1–W2 | WP-01、凍結 R／AT 與 Drawing／Asset／Package 契約、取得裝置矩陣、壓感試作、500 鏡基線 | G0／G1；目前 G0 未執行，G1 需外部設備 |
| W3–W5 | WP-02 repository 原子交易與 lease，接入 Model／command runner | G2；repository 有範圍受限證據，主 UI 與裝置仍待驗 |
| W4–W8 | WP-03 整合；WP-06 局部程式已開始，完整 Drawing 整合仍依 WP-04／05 資產與歷史契約 | G3；目前未通過 |
| W6–W10 | WP-04／05 歷史、筆跡／底圖／縮圖保存、manifest／hash、遷移預覽 | G5 準備；工作包出口仍待驗 |
| W7–W12 | WP-05–08 fixed／auto、跨日／gap、分鏡輸出、封裝、通告及正式 PDF | G4／G5；WP-08 已有部分隔離 Chromium 輸出證據，完整矩陣與真實影像／紙本仍待驗，維持 in progress |
| W11–W15 | WP-09 故障注入、跨瀏覽器、大專案、真實 iPadOS Safari／Pencil 驗收 | G6；需要指定真機 |
| W16–W18 | 兩個去識別真實專案試用，至少一案 iPad 手繪到拍攝表交付 | G7；需專案與參與者 |
| W19–W20 | RC、正式 PDF／Package 證據、備份恢復、升級／回退與簽核 | G8；尚未執行 |
| W21–W22 | 只吸收風險、外部依賴延遲與缺陷修復 | 不新增預設功能 |

### 9.3 人力估算與排程限制

PRD v1.5 附錄估算的是各角色投入合計的**人力週**，不是日曆週；尚未因 2026-10-28 定案重新估算，也須與 WP-01–WP-09 已含工作逐項對照，避免重複計算。

| 階段 | 工程人力週 | 設計人力週 | QA 人力週 | 合計人力週 |
|---|---:|---:|---:|---:|
| P0 語意凍結與版型／iPad 試作 | 1–2 | 0.5–1 | 0.5–1 | 2–4 |
| P1 Schema、migration、Model、history | 3–5 | 0.5–1 | 1.5–2.5 | 5–8.5 |
| P2 分鏡排序、拍攝多選、頁籤與甘特圖 | 5–8 | 2–3 | 2–4 | 9–15 |
| P3 動態輸出、VO 彙整、通告與 PDF | 4–7 | 1–2 | 2.5–4.5 | 7.5–13.5 |
| P4 整合、真機與 release gate | 1–2 | 0.5–1 | 3–5 | 4.5–8 |
| **範圍合計** | **14–24** | **4.5–8** | **9.5–17** | **28–49** |

v1.4 另有 2 位工程師、0.5 設計、建議 0.75 QA 與 20+2 週的舊容量模型。兩組估算採不同層級，不相加、不互相當作期限保證；交付負責人需在投入人力、真機及 PDF 驗收設備確認後重新校準日曆排程。W21–W22 不是免費新增功能容量。

## 10. 現況與證據邊界

### 10.1 已有的有限證據

- **Site v15 部署回報：** commit `be5955283b8aa5a64ba9f2719e040c8379a3efd3`。主代理回報隔離 IAB 截圖 `compact-card-qa.png` 顯示緊湊三欄、無框欄位及右側焦點提示；同一隔離桌面情境驗過 VO／SUPER blur-save-reopen 與分鏡直接拖曳保存／重開。右側提示在減少動態效果下保持常亮。
- **WP-05 私人 Site 開發版部署回報（先前版本）：** 私人 Site 曾部署多照片管理開發版，source commit `95aa5ab464acb397ef9e9eb71f8ce4ca14e16eda`。這筆舊部署紀錄不代表本輪部署；本輪 Chromium 真 PNG UI 流程已有成功證據，真 iPad 仍 `not_checked`。
- **後續私人 Sites 部署（2026-10-28）：** 私有站點部署 succeeded，source commit `11c03314e2aa9ec33ac1b18f2ed7aa71b5ee4e9c`。部署後 UI 因瀏覽器要求登入而 `not_checked`；站點保持私有，部署成功不代表部署後 UI 驗收通過。
- **最新私有 Sites／Edge 唯讀檢視（2026-10-28）：** private deploy succeeded，commit `bd827b795c1ddfe537471b4c28e965b3e2757bfb`。Edge 以唯讀方式載入既有專案，分鏡頁視覺檢查正常，未修改資料。此為唯讀畫面檢視，不代表可編輯流程、quota 故障救援或 PDF 輸出互動已通過。
- **WP-06 圖層命令與編輯器局部實作（2026-10-28）：** 本機工作樹新增 `clearDrawingLayer`、`setDrawingLayerState` bridge／Model 命令及圖層清空、顯示／鎖定 UI；清空需確認、每次命令走既有 Model 歷史、空操作不新增 transaction／revision／history。限定 Node 測試命令 `node --test tests/wp06-drawing-bridge.test.cjs tests/wp06-drawing-model.test.cjs tests/wp06-drawing-editor-ui.test.cjs tests/wp06-canvas-geometry.test.cjs` 回報 18/18 passed；三個對應 JavaScript 檔 `node --check` passed。隔離 Chromium UI 另驗兩層筆畫、顯示／鎖定、清空取消／確認、undo／redo、重開保存及第二頁唯讀。後續場景複用 UI 於隔離 Chromium／原生 IndexedDB 驗證：預覽後取消不寫入；確認後建立獨立 Drawing／layer／stroke ID 並保存；來源鏡與目標鏡分別編輯不互相影響，重開後 undo／redo 正確。`tests/wp06-drawing-editor-ui.test.cjs` UI regression 5/5 passed，Chromium QA 腳本與截圖為 `tests/wp06-drawing-scene-reuse-browser-qa.cjs`、`tests/wp06-scene-reuse-preview-qa.png`。當時未驗真 iPad 與失敗注入／重試；後續有一個底圖替換失敗重試的隔離案例（見本輪追補），但完整 WP-06 出口仍未達。
- **WP-06 指標取消、照片底圖與可編輯筆跡追補（2026-10-28）：** 修正 `pointercancel`／`lostpointercapture` handler，只取消相同 pointer ID 的活動筆畫。`tests/wp06-drawing-input-browser-qa.cjs` 在隔離 Chromium／臨時 localhost origin／原生 IndexedDB 驗證非目標取消不丟筆、目標取消零提交、真 PNG `photoOriginal` 底圖 hash 在畫筆／橡皮／undo／redo／重開後不變，以及 Scene／Subject 向量筆跡重開後仍可編輯。固定線寬保存且 points pressure 為 null；測試派發取消事件，並非真實觸控／Pencil 輸入。真 iPadOS Safari、Apple Pencil 與 G1 壓感校準仍未驗，WP-06 維持 `in_progress`。
- **前一輪整合證據（2026-10-28）：** 當時主代理回報 project-wide Node suite 221/221 passed，不等同任一 WP 完整驗收。模型保存失敗／佇列重試測試 2/2、Model 測試 21/21、WP-04 repository 測試 3/3；隔離 Chromium 原生 IndexedDB 在 historyState.put 注入 abort 後驗證 8 個 stores 全部回滾，無已提交 project/history/receipt/snapshot。測試使用新隔離資料，不觸及使用者專案；quota exhaustion、OS crash 與真機未驗。修正照片狀態 projection 漏掉 assets 後，隔離 Chromium 真 PNG app 流程通過匯入、排序、移除、重載及 Undo／Redo。WP-08 續頁圖片區 selector 覆寫已修復；長文輸出橫式 12 頁／直式 11 頁、44 markers 順序正確、每頁頁首／頁尾可見且無空白頁；短文與純圖 2×2 佔位框測橫直方向，output tests 16/16。後續 9 張真圖 fixture 四模式頁數為 3／3／3／5；直式細項 9 鏡分布 2／2／2／2／1。每筆真圖文字樣本 72 字，當時的長文案例未與該 9 張真圖 fixture 組合；較早 3／3／3／9 頁為密度調整前歷史結果。Chromium iPad viewport 模擬回報 15 個 viewport／75 個 UI states，只代表桌面尺寸模擬，不是 iPadOS Safari／觸控／Pencil／真機保存驗收。Edge print、紙本及其他設備未驗；WP-08 維持 in_progress。該輪程式變更未部署，局部測試不代表各 WP 完整驗收。
- **通告單隔離 UI／PDF E2E（2026-10-28）：** `docs/callsheet-isolated-browser-qa.json` 記錄 fresh isolated Chromium BrowserContext 的 12/12 checks passed。UI 建立 fixture project，加入三日（含空日），保存地點、手動預計收工、公司／統編、included/excluded contacts、大組順序、車輛／乘客與 449 字注意事項；重開後驗證 canonical Project。另驗未改欄位 blur no-op 及實際輸入後 blur 單次 commit。由 UI 路徑產生並解析 selected-day PDF 4 頁及 all-days PDF 10 頁，核對日序、空日、欄位、收工分離、長備註及三個內容區，pageerror／console errors 為 0；有 PDF 頁面樣本供有限視覺檢查。隔離流程使用新 BrowserContext 和測試專案，不碰使用者既有資料。這不覆蓋完整 output-option／畫幅／density 矩陣、Edge／紙本／真 iPad，故 WP-08 維持 `in_progress`。
- **WP-07 封裝 UI 往返（2026-10-28）：** `node --test tests/project-package.test.cjs tests/wp07-package-model.test.cjs tests/wp07-zip-adapter.test.cjs tests/wp07-import-repository.test.cjs` 通過 38/38。隔離 headless Chromium 實際 app UI 完成 ZIP 匯入預覽／確認、原生 IndexedDB 寫入、Drawing Editor 重開、UI ZIP 下載、reload/reopen、同 ID 碰撞拒絕（無確認覆寫按鈕且 Project／Drawing／Asset／history／snapshot／lock rows fingerprint 不變），並在新 BrowserContext 重匯出 UI 產生的封包；比對 canonical Project／Drawing 與 Asset bytes/hash 完全一致，page errors 為 0。fixture 由 Node 使用 `makeCanonicalProject()` 及 package 模組產生，含兩個各 74-byte 的 2×2 PNG（`photoOriginal`、`drawingPreview`）和既有筆跡；素材不是在 UI 中現場建立。重現腳本與截圖見 `tmp/wp07-package-ui-qa.cjs`、`tmp/wp07-package-drawing-ui.png`、`tmp/wp07-package-collision-ui.png`。該輪僅有小型桌面 fixture；本輪另有 bounded package stress（見後續追補），但暫定上限校準與真 iPadOS Safari 下載／Files 匯入仍 `not_checked`，WP-07 維持 `in_progress`。
- **WP-08 混合真圖／Drawing／長文 PDF 追補（2026-10-28）：** 隔離 Chromium 以真實 PNG、可再編輯 Drawing 與 14,945 字長文產生並逐頁檢查實際 PDF；修復後橫式 16 頁、直式 14 頁，分頁與續頁 markers 可見。此案例補上此前長文與真圖未組合的缺口，但只涵蓋該混合 fixture；較大圖量、其他畫幅／density、Edge、紙本及真 iPad 仍待驗，WP-08 維持 `in_progress`。
- **前一輪整合與部署邊界（2026-10-28）：** 當時全專案 Node suite 回報 230/230 passed（224/224 為更早快照），不代表 WP-06 或 WP-08 的完整出口驗收。較早的最新私有 Sites 部署 commit 為 `bd827b795c1ddfe537471b4c28e965b3e2757bfb`；Edge 唯讀載入既有專案並視覺檢查分鏡頁正常，未修改資料。這不代表可編輯、quota 恢復或 PDF 互動驗收通過；該筆紀錄撰寫時本輪程式變更尚未部署；後續私有部署見本輪追補。
- **前一輪 quota、拍攝安排及 PDF 限定驗證（2026-10-28）：** `tests/quota-save-recovery-browser-qa.cjs` 在全新隔離 Chromium BrowserContext 開啟本機 app，於原生 IndexedDB `projects.put` 前注入一次 `QuotaExceededError`，沒有耗盡真實配額或填滿磁碟。失敗後 canonical 與 IndexedDB revision 均保持 0；UI 顯示未保存狀態及 retry／rescue，場次 modal 關閉以露出復原入口且表單值仍保留；救援 JSON 實際下載並含失敗候選，重試提交後 revision 1，reload／重開仍可讀回該場次，page errors 為 0。證據見 `docs/quota-save-recovery-browser-qa.json`。另拍攝安排 UI 的 8 項限定 checks（含 drop marker）通過；純圖五欄（鏡次、標題、VO／台詞旁白、SUPER、秒數）在 16:9、1:1、4:3、2.35:1 四畫幅各測橫／直，8 份實際 Chromium PDF 限定案例通過。該輪全專案 Node suite 為 230/230 passed；本輪最新 234/234 見追補。該輪隔離案例未耗盡真實配額；print preparation 後續證據更新見追補。較早 private deployment commit `bd827b795c1ddfe537471b4c28e965b3e2757bfb` 後，Edge 唯讀載入既有專案並視覺檢查分鏡頁正常，未修改資料；該筆紀錄撰寫時本輪程式變更尚未部署；後續私有部署見本輪追補。
- 上述瀏覽器證據僅代表報告中的桌面隔離情境。WP-06 圖層、場景複用與指標取消有 Chromium 證據，仍不代表完整資產生命週期或失敗注入；照片匯入／管理流程、WP-07 小型封包往返、WP-08 指定 PDF 輸出案例皆有桌面證據。真 PNG、可編輯 Drawing 與 14,945 字長文已在一組實際 PDF fixture 組合，但此單一案例不代表更多圖片、完整 PDF 矩陣或紙本已驗收；IME／讀屏矩陣、真 iPad 及其他設備亦未驗。
- execution-plan.json 保留 2026-10-27 的 85 項及先前 208、213、214、219、221、224 項歷史 Node 結果；較早全專案 Node suite 曾為 230/230；最新主代理回報為 234/234 passed，並非單一 WP 專項驗收。WP-04 保存重試 Node 測試 2/2、Model 21/21、repository 3/3，原生 IndexedDB historyDelta abort 驗證 8 個 stores 回滾；先前 WP-06 子切片 Node 測試 18/18、WP-08 output tests 16/16。局部結果不代表真 iPad、Edge、紙本或完整工作包驗收；本次文件同步只驗證 JSON 可解析，未重跑程式測試。
- **本輪跨工作包驗收追補（2026-10-28）：** 全專案 Node suite **234/234 passed**；這是程式測試證據，不代表任一工作包已通過出口。`tests/wp06-drawing-background-browser-qa.cjs` 使用隔離 Chromium、臨時 localhost origin、原生 IndexedDB 及兩張 fixture PNG，驗證共享 Asset 解除引用後仍保留 Drawing 底圖與 bytes/hash；明確替換／移除底圖、取消零寫入、兩個向量圖層不變、undo／redo 跨重開；另注入一次 `QuotaExceededError`，失敗時 Project、Drawing、history cursor／entries 不變，重試提交原候選一次。這不是耗盡真實配額或真機觸控驗收。`tests/wp07-package-stress-browser-qa.cjs` 使用 fresh BrowserContext 與記憶體生成圖片（不使用使用者圖片、app DB 或磁碟封裝），4 張 1536×1536 PNG（共 28.4 MB）、500 鏡、500 Drawing、4,000 strokes／96,000 points 形成 38.76 MB ZIP；完整匯出／匯入及另存副本再往返後 Project／Drawing／Asset bytes/hash 相同。ZIP CRC 和 manifest SHA-256 損毀、單圖／總解壓／archive／entry 自訂超限均遭拒；CRC lookup-table 修正後 package suite 44/44 passed。該 fixture 的匯出約 0.53 秒、匯入約 0.33 秒、另存副本 remap／往返匯出／匯入約 0.29／0.52／0.33 秒，觀察到 1,078／1,026／464 ms long tasks，最大事件迴圈延遲約 1,082 ms；JS heap 首次匯入取樣 374,862,725 bytes，保留 source／copy／archives 時 1,000,830,628 bytes，皆非 RSS 或峰值。這是有限桌面 Chromium/module-level 試作，未測到暫定 20 MiB 單圖或 500 MiB 解壓封裝上限，亦未驗真 iPadOS Safari Download／Files。`tests/output-print-preparation-browser-qa.cjs` 在隔離 Chromium 中驗實際 app print handler、CSS print media 與 PDF：A4 橫式 12 頁、直式 10 頁、沒有頁框 overflow；image decode、snapshot capture 或輸出版本變更時取消皆未列印舊快照並會恢復 preparation 狀態。另有獨立真資產 fixture（`tmp/pdfs/real-asset-print-prep-qa/real-assets-qa-result.json`）驗得 A4 橫式 PDF 3 頁、9/9 張圖載入、含可編輯 Drawing 內容且無頁框溢位。PDF 由 Chromium 產生；原生 Edge print 與實紙仍 `not_checked`。本輪私有部署已於 commit `a0b9566eb5f9c3a939a8e4734a459f7bb84657f7` 成功；Edge 唯讀開啟既有專案，分鏡頁顯示正常且未修改資料，這不代表互動、quota recovery、原生 Edge 列印或紙本驗收。本次更新不改 WP-06／07／08 或 release gate 狀態。

- **本輪鍵盤／IME 與 Package Worker 追補（2026-10-28）：** `tests/shot-inline-ime-browser-qa.cjs` 及 `docs/shot-inline-ime-browser-qa.json` 記錄隔離 Chromium 6 項檢查通過：無框欄位、Enter 提交與焦點保留、Tab 順序、多行 VO／SUPER 換行及 Ctrl+Enter、合成 composition 過程的 Escape guard／blur／compositionend 保存，以及 Escape 取消後重開、blur 保存與 reload 持久化。組字由 synthetic `CompositionEvent`／`InputEvent` 派發；這不能證明 Windows 原生注音或 iPadOS 原生 IME，兩者仍 `not_checked`。使用者指定的右側閃動提醒符是焦點視覺提示，並非實際輸入 caret，已保留該設計。Package Worker 的隔離 Chromium UI／stress／fallback／取消檢查通過，涵蓋 38.76 MB generated fixture、Worker 運算、CSP／Worker 不可用時的安全 fallback、活動 Worker 取消且不寫入，以及 transfer subview 不 detach caller backing buffer。三項既有 P2 經唯讀複核：expired copy ticket／transport fallback 僅限可安全本機 remap 的情況，其他業務錯誤 fail closed；照片逐張解碼期間檢查取消並釋放遲到解碼結果；transfer subview 先複製有效 bytes。未發現新增重大資料完整性問題。全專案 Node suite 最新回報 **237/237 passed**，不等同工作包或真機驗收。Astra 因容量不可用，由 Luna 完成獨立複核。此前 checkpoint 的私有部署 commit 為 `9c7e4c1423662fb3322cc079e9cc29958cf44ec4`；Edge 唯讀載入既有專案並目視分鏡頁正常、未修改資料，並非互動或原生列印驗收。真 Windows 注音、iPadOS 原生 IME／真機及原生 Edge 列印仍未驗，WP-03／07 與 release gates 狀態不升級。
- **WP-07 staging 故障與 500 鏡 UI 效能追補（2026-10-28）：** `tests/wp07-package-stage-failures-browser-qa.cjs` 在 fresh isolated Chromium BrowserContext、原生 IndexedDB 及實際 app UI 中，以既有小型專案及 UI 建立的 history receipt 為基線，驗證 Worker 中斷、損毀 ZIP、重複 ZIP entry、同 Project ID 碰撞，以及明確注入 `QuotaExceededError`／`AbortError` 的 staging transaction。所有路徑都保留 Project、Drawing、Asset Blob bytes、receipt、history entry／cursor、snapshot 等既有 rows；中斷沒有 fallback 寫入，交易錯誤在 `historyState.add` 注入並由原生交易回滾。所有封包均於記憶體生成，沒有填滿磁碟或真實瀏覽器配額。證據：`tmp/wp07-package-stage-failures-browser-qa.json`；相關 repository 復原測試主代理回報 15/15 passed，全專案 Node suite 回報 237/237 passed。另以真 `dist` app 和原生 IndexedDB 測 500 鏡／50 場／10 拍攝日／500 張生成 PNG；照片 fixture 合計 29,290,493 bytes（約 29.3 MB），不是使用者圖片。三次開啟為 1.47／2.36／2.39 秒，符合 AT10 開啟 ≤5 秒；搜尋 p95 129.2 ms，唯一搜尋命中 1 鏡、其餘 499 卡片隱藏，符合 AT10 搜尋 p95 ≤200 ms。排序 p95 599.7 ms，未達 AT10 ≤200 ms；編輯提交 p95 651 ms，列為本輪互動 p95 未達標，須與 AT10 健康提交 ≤2 秒的持久化上限分開看待。互動監測最大 long task 為 1,228 ms；開啟週期另觀察到 1,923／1,963 ms long tasks。明確注入舊照片 `<img>` 的 `error` callback（在 URL 被撤銷、替代圖片已載入後）未覆蓋目前圖片，也未寫入錯誤／reload 狀態；自然的瀏覽器 URL revoke→image error 時序尚未證實。來源：`tests/storyboard-large-project-browser-qa.cjs`、`tmp/large-storyboard-500-browser-qa.json`。該效能／故障 fixture 首次記錄時尚未部署；2026-10-29 最終部署與 Edge 唯讀追補見下一筆。真 iPadOS Safari、250 MB 資產 fixture、暫定 package 最大尺寸與真機資源校準仍 `not_checked`，WP-07 維持 `in_progress`。
- **2026-10-29 badge regression 與最終私有部署追補：** 修復此前拍攝日 badge regression 後，`tests/schedule-day-count-browser-qa.cjs` 在 fresh isolated Chromium BrowserContext、實際 app UI 與生成 IndexedDB 專案中通過 initial/add/reload 檢查：初始 3 日 badge 與資料一致，新增後為 4，reload 後仍為 4，切換 storyboard／schedule 顯示一致；證據見 `tmp/schedule-day-count-browser-qa.json`。全專案 Node suite 為 237/237 passed。最終私有部署 source commit 為 `fbc2ce1b87902386443847ceead06efd9f7cbc86`；部署後 Edge 以唯讀方式載入既有專案，分鏡頁的「拍攝安排 3」正常顯示，未修改使用者資料。這只驗證既有專案的唯讀視覺顯示，不代表互動驗收；500 鏡排序 p95 599.7 ms 仍未達 AT10 ≤200 ms，WP-07 維持 `in_progress`，真 iPad／250 MB fixture 仍未驗。
- **2026-10-29 AT10 大圖／保存復原與 v23 部署追補：** 較新的 29,290,493-byte（29.29 MB）500-shot app fixture（`tmp/large-storyboard-500-browser-qa.json`）改序 p95 為 479.3 ms，仍高於 AT10 的 200 ms（先前測值 599.7 ms 亦未達）。另於 fresh isolated Chromium 對真 `dist` app 執行 500 鏡／50 場／10 拍攝日／500 張合成 1146×764 JPEG（實際 252,074,895 bytes／252.07 MB；非相機照片；`tmp/at10-250mb-20261029/at10-250mb-result.json`）：31.87 GiB Windows host 的 Chromium headless shell，三次開啟 1.46／2.44／2.25 秒、搜尋 p95 113 ms、健康編輯提交 p95 712.7 ms，達各自 ≤5 秒／≤200 ms／≤2 秒門檻；改序 p95 566.9 ms 未達 200 ms。重開後資料仍在，但 app 顯示唯讀並提示舊頁面可能仍持有編輯權；互動最大 long task 1,217 ms，page／console errors 皆 0。Browser storage estimate 為使用 253,001,728／配額 10,990,419,968 bytes；未耗盡實際配額。這是 32 GB-class 桌面 headless Chromium 局部測試，非 AT10 指定 16 GB Windows Chrome／Edge target-hardware 驗收，也非真 iPad。`tests/save-failed-lock-browser-qa.cjs`／`tmp/save-failed-lock-browser-qa.json` 兩頁 UI 驗證注入 quota failure 時保留可編輯草稿且 retry 成功；lease loss 後保留草稿、鎖住分鏡與拍攝安排寫入，重取 lease 後原候選及草稿可保存；revision conflict 保留草稿為唯讀並拒絕 stale retry。`tests/project-lifecycle-recovery-browser-qa.cjs`／同名 JSON 驗證 legacy migration preview／取消零寫入、注入 quota fail 後可重試、future schema／corrupt JSON 顯示穩定錯誤並可精確下載原始來源／返回既有專案，初始錯誤來源可明確另建 revision 0 空白專案，重開後 legacy 原值不變；page errors 為 0。全專案 Node suite 237/237 為主代理回報，並非完整 WP 驗收。大圖及 recovery 檢查先於本次部署執行；依主代理回報，v23 後續已部署，commit `6426a8dd408af800e9c9442b3b375bbc8b955a1a`。部署後 Edge 只讀目視既有專案：15 鏡、3 拍攝日及已保存狀態顯示正常，未改資料；這不代表互動驗收。WP-03／WP-07 與 release gates 均維持 in_progress／未完成。
- **v24 本輪輸出／排序與部署追補（2026-10-29）：** A08 通告時間軸空白 Shot 標題不再輸出替代活動名；`tests/shot-title-empty.test.cjs` 2/2、`tests/output-layout.test.cjs` 16/16 passed，未驗實際 PDF／真機列印。History 同次驗證去重經獨立唯讀安全 review，公開 API、replay tamper 與 Project schema 驗證未見弱化；排序內部 stage p95 由 223.9 ms 降至 104.4 ms，但端到端改序 p95 為 506.3 ms（8 次樣本），仍未達 AT10 ≤200 ms。衝突保護仍在開發，WP 狀態與 release gates 不升級。Private v24 commit `fe938b1ee14ec5f73acb2a3c0251de59753f81f8` 部署成功；部署後 Edge 唯讀目視既有專案畫面，未修改資料。此為視覺檢查，不代表互動、PDF、原生列印或真機驗收。
- **v25 同 revision history drift guard／部署追補（2026-10-29）：** guard 已實作，Model 命令帶 `expectedHistory` snapshot。`tmp/wp04-expected-history-native-qa.cjs` 以原生 Chromium IndexedDB 驗證：同 revision 歷史已漂移時拒絕可逆且合法的 patch，8 個 stores 保持不變；Model 對 corruption／revision mismatch 走既有衝突復原，必要測試 16/16 passed。直接呼叫 repository 且未帶 `expectedHistory` 的舊 caller 不受此 guard 保護；guard 成本隨歷史大小線性增加，端到端效能尚未重測。Private v25 commit `68cfd00782984bd33c001c2e9b6b5ba53fd1006b` 部署成功；Edge 唯讀載入既有專案顯示 15 鏡、3 拍攝日及已保存狀態，未修改資料。此為目視，不代表互動或 PDF／真機驗收；WP 與 release gates 不升級。
- **v26 手繪手勢／排序／部署追補（2026-10-29）：** 手繪雙指縮放／平移加入暫態操作；pointer cancel、Pencil／palm 判別、三指重錨及跨圖層橡皮取消已修復。隔離 Chromium synthetic QA 與 38/38 Node checks 通過，獨立唯讀 review 複核修復，未見明顯新增資料遺失。500 鏡改序重測 6 樣本 p95 為 438.3 ms，仍未達 AT10 ≤200 ms。Private v26 commit `1d220b3f2f3eb1c4299778fe8975bca2a1d920e9` 部署成功。Edge 實際開啟一個原本沒有 Drawing 的既有第一鏡時，應用意外自動建立空 Drawing，revision 由 0 升至 1；透過 UI Undo 恢復示意圖後 revision 已升至 2，且仍有 redo 歷史，因此不能宣稱零資料更動或精確恢復。空畫布／路由開啟即寫入列為待修 UX 缺陷。真 iPad／Apple Pencil 未驗；WP 與 G0–G8 release gates 不升級。

- WP-01／WP-02 僅在其獨立工作包範圍內標示 verified。WP-03 仍整合中；WP-04–WP-09 仍未通過出口條件。

- **v1.6 v35 搜尋、排程與 history 追補（2026-10-29）：** 搜尋排序沿用 v34 的定向結果（Node 17/17、隔離 Chromium 搜尋後可見鏡頭排序及完整 Scene 順序保存）；本次沒有重跑搜尋案例。排程以全日已知區間聯集計算跨 unknown 邊界的固定時段碰撞與空檔；未知自動時長仍不推算，固定時間仍可重新錨定 cursor。`tests/model.test.cjs` 26/26、輸出版型／收工測試 19/19，隔離 Chromium 安排與通告均顯示非連續空檔 `10:00–10:30、11:30–12:00 · 空檔 60 分鐘`；未知時長前後固定時段碰撞與填入先前空檔的兩項 fixture 通過。另以 fresh Chromium／生成 IndexedDB 專案驗證新拍攝日通告預覽、返回安排後套用 10:15–10:45 固定時段，保存後 reload/reopen 值一致，無 page／console error。這只驗證該 UI 保存路徑；若 Undo `addDay` 會使 `outputPreferences.schedule.selectedDayId` 成為孤兒，Model 仍拒絕該 Undo（`HISTORY_INVALID_PROJECT`／`ORPHAN_SELECTED_DAY`），並保留 history cursor／redo branch，尚未解除。Asset hash／引用檢查仍以 bounded generated-fixture package roundtrip 為範圍；嚴格 duplicate／`photoOriginal` 規則尚未在 legacy Schema／migration 同等強制，異常 Project 會於 package export 被拒絕；完整真實素材／裝置往返未驗。本輪不升級任何 WP、MVP 或 G0–G8 gate。
- **v1.6 v36 選日 Undo、未知後自動碰撞與 Pages 依賴檢查（2026-10-29）：** 選日 Undo 已修正：fresh isolated Chromium／原生 IndexedDB 生成專案撤銷新拍攝日時，若輸出選日指向該日便清為預設 `null`，其他輸出偏好與 redo 保留；重載後仍一致，Undo 後更改偏好再 Redo 亦保留新偏好。隔離 atomic-failure 案注入 `AbortError` 時確認交易失敗不改 Project、偏好、history cursor／entry／receipt，重試只提交一筆 Undo；WP-04 Model 11/11、history engine 10/10、atomic 1/1 與原生 IndexedDB Chromium 案通過。未知自動項之後的已知自動項若與未知之前的固定區間重疊，現在會以已知區間聯集計算碰撞；生成 fixture 中未知項仍不推算、固定錨點不變，安排頁與通告均顯示碰撞警示，`tests/model.test.cjs` 27/27、輸出版型／收工測試 19/19 及隔離 Chromium QA 通過。Pages 依賴檢查方面，`.github/workflows/deploy-pages.yml` 仍只由 `workflow_dispatch` 手動觸發；本機 `node tools/check-static-dependencies.cjs --tracked` 未通過：0 missing、17 untracked、0 source/reference issues。目前引用的未追蹤 `dist` 檔案尚須納入發布 commit 才能通過此 guard。該 checker 只檢查靜態本機 runtime references／存在性／Git tracking，不是 npm 套件或 GitHub Actions 供應鏈稽核；本輪未執行 GitHub workflow、未發布公開 Pages、未作線上驗收。Asset hash／legacy schema 相容限制沿用 v35；真 iPadOS Safari 仍 `not_checked`。本輪不升級 WP、MVP 或 G0–G8 gate，亦不改變發布前置條件。
- **v1.6 v40 手動照片完整性檢查與分鏡卡片離屏快取（2026-10-29）：** `tests/photo-integrity-manual-browser-qa.cjs` 在 fresh isolated Chromium／生成專案／原生 IndexedDB 通過：顯示逐張進度，切換專案可取消，舊 session 完成不會覆蓋新 session，同大小 Blob 損壞被判為 `ASSET_HASH_MISMATCH`；檢查前後 Project revision、Asset metadata 與損壞 Blob 均不變，無 page errors。這是使用者明確啟動的唯讀掃描，不代表一般保存會自動重驗所有既有 Asset。`tests/storyboard-photo-cache-browser-qa.cjs` 的 IntersectionObserver 與 bounded fallback 兩模式均通過；fallback 分支另驗切換專案、離開分鏡時撤銷卡片 URL，回到原案／分鏡可建立新 URL 並保留 crop。測試亦確認 Drawing 預覽、輸出照片／Drawing 與 `photoOriginal` bytes／SHA-256 不受卡片快取回收影響。另以同類 500 鏡、500 張生成 320×180 PNG（原始影像共 29,290,493 bytes）的桌面 headless Chromium 瀏覽器量測：完成捲動後，快取前載入 494 張卡片圖，按尺寸×4 bytes 估算約 108.54 MiB decoded pixel surface；快取後 5 張、約 1.10 MiB，估算減少約 99%。此數字是已載入圖片的像素表面估算，不是 RSS、GPU 記憶體或峰值量測，也不是指定 Windows 設備或 iPad 實測。這不是排序／AT10 通過證據；AT10 改序 p95 ≤200 ms 門檻維持，已記錄的大型 fixture 排序結果仍未達標。一般寫入的完整既有 Asset hash 保證、交易外 digest／直接資料庫變更 TOCTOU 仍未解；R04／WP-05、效能 gate、MVP 及 G0–G8 狀態均不升級。

### 10.2 必須維持未驗或進行中

| 項目 | 狀態 | 尚缺的證據 |
|---|---|---|
| Site v15 三欄／無框編輯／VO、SUPER／右側焦點提示／直接拖曳 | 隔離 Chromium 6 項鍵盤／synthetic composition、Escape 取消／重開與保存檢查通過；右側閃動符是保留的視覺提示，不是 caret | Windows 原生注音與 iPadOS 原生 IME、讀屏、完整取消／捲頁／多選、響應式及真 iPad 驗收 |
| R01／AT01–02 保存失敗、legacy 與空白案 recovery | 隔離 Chromium UI 的 quota／lease／revision failure tests 保留 candidate 與草稿，按錯誤類型提供可編輯重試或安全唯讀；lease 恢復後 retry 保存原候選。另驗 migration preview／cancel 零寫入、future-schema／corrupt legacy fail-closed、原稿精確下載、返回既有案，以及明確另建 revision 0 空白案後 reload；來源 bytes 未變。 | 注入錯誤不等於真實 quota exhaustion／OS crash；完整交易故障矩陣、目標設備與 iPadOS Safari recovery 仍未驗 |
| WP-05 多照片資料與資產關係 | 原生瀏覽器隔離隨機 DB 檢查 **10/10 passed**；另有 Chromium 真 PNG app 流程通過匯入／排序／移除／重載／Undo／Redo；手動唯讀完整性掃描另通過進度、切案取消、session race、同大小 hash 損壞偵測，且未改 Project／Asset；已修正資產狀態 projection 遺漏 assets 的 bug；WP-07 小型 fixture UI 往返已驗 | 手動掃描不等於每筆一般寫入都重新 hash 全部既有 Asset；仍需完整資產生命週期、失敗恢復、stale／唯讀、交易外 digest／直接資料庫變更 TOCTOU 審查及真 iPad Photos／Files picker 驗收 |
| 分鏡卡片離屏照片快取 | `tests/storyboard-photo-cache-browser-qa.cjs` 在 IntersectionObserver 與 bounded fallback 兩模式通過；fallback 覆蓋 project/view 切換清理及回入重載；Drawing／輸出獨立呈現與原圖 SHA／bytes 保持。500 張生成 320×180 PNG 的載入圖像數為 494→5；按 320×180×4 bytes 估算的表面為 108.54→1.10 MiB | 數值不是 RSS／GPU／峰值，也非真 iPad 或 AT10 改序測量；指定 Windows Chrome／Edge 與 iPadOS Safari 資源校準未驗，AT10 改序 p95 ≤200 ms 仍未達標 |
| 拍攝安排／混合時程列 | 限定 UI 8 checks（含 drop marker）通過 | 全面桌面保存／undo／重開、失敗／取消矩陣與真 iPad 觸控驗收 |
| WP-06 圖層、場景複用與指標取消 | 既有 Node／UI 證據仍有效；`tests/wp06-drawing-background-browser-qa.cjs` 在隔離 Chromium／原生 IndexedDB 驗共享 Asset、底圖替換／移除、取消零寫入、原圖 hash 與兩層 vectors 保留、undo／redo 跨重開；一次注入 `QuotaExceededError` 使 Project／Drawing／history 不變，同一候選重試後只新增一筆 history。WP-06 仍 `in_progress` | 這是單一限定故障注入，非真實 quota exhaustion；其他失敗情境、部署後互動、完整資產／封裝往返、真 iPadOS Safari／觸控／Pencil、背景恢復與壓感 G1 校準；整個 WP-06 尚未通過 |
| WP-04 同 revision history drift guard | Model 帶 `expectedHistory` snapshot；隔離 Chromium／原生 IndexedDB 測試拒絕歷史漂移下的可逆合法 patch，8 個 stores 不變；corruption／revision mismatch 使用既有衝突復原，必要測試 16/16 passed | 不帶 `expectedHistory` 的直接 repository 舊 caller 不受 guard 保護；成本隨歷史大小線性增加，端到端效能未重測；WP-04 及相關 gates 仍未完成 |
| Drawing 空畫布自動建立 | v27 已修正：開啟與離開空草稿不寫入；隔離 Chromium 驗證首次編輯、Undo／Redo 與失敗重試，Edge 確認開啟與返回時 revision 維持 2。v26 驗收曾造成 revision 0→2 並留下 redo 歷史。 | 真 iPad／Pencil、真實 quota exhaustion 與完整 Drawing 驗收仍待完成。 |
| Drawing、照片匯入及 Pencil 其餘需求 | 部分程式／契約，不是裝置驗收 | 真實 iPadOS Safari、完整觸控／Pencil 閉環、背景恢復、封裝往返；壓感需 G1 校準 |
| `.storyboard.zip` 完整匯出／匯入 | 小型 UI 往返、38.76 MB package stress、Worker fallback／取消與 transfer ownership 已驗；WP-07 staging failure UI 保留 Project／Drawing／Asset／history；另完成 252.07 MB synthetic-image／500 鏡 app UI 保存重開測量。WP-07 仍 `in_progress` | 前兩個 fixture 的改序 p95 為 479.3／566.9 ms，均未達 AT10 ≤200 ms；history 同次驗證去重後排序內部 stage p95 由 223.9 降至 104.4 ms，但端到端改序 p95 為 506.3 ms（8 次樣本），仍未達標；v26 再測 6 樣本 p95 438.3 ms，仍未達標。衝突保護已在 v25 部署；指定 16 GB Windows Chrome／Edge target hardware、暫定 package size、真 iPad 與完整 WP-07 驗收仍未完成 |
| 分鏡 PDF／通告單 | `in_progress`；既有長文、圖片、通告與 14,945 字混合案例證據保留；v31 output tests 39/39，隔離 Chromium A4 橫式／直式各 12 頁，檢查 toggle 往返、DOM 原字順序、pypdf emoji markers 及 raster 頁面；修正 UTF-16 代理對跨頁切割與單 emoji＋art fallback。既有真資產 fixture 另驗 A4 橫式 3 頁、9/9 張圖載入、含 Drawing 且無頁框溢位 | 更大圖量、其他畫幅／density 與完整 output-option 矩陣仍待驗；`window.print` 被測試攔截，原生 Edge print、紙本、真 iPad 未驗。通告 E2E 仍是隔離 fixture，不代表真實專案往返或全功能通過；WP-08 未完成 |
| iPad 真機與 iPad 觸控排序／甘特圖 | **not_checked** | 指定機型、OS／Safari、Pencil 型號與實機步驟記錄；本輪未做真 iPad 測試 |
| 發布 gates G0–G8 | 未全部通過 | 各 Gate 狀態與產品／工程／QA 簽核；尚無 MVP release acceptance |

狀態用語：`verified/passed` 僅能指已具備該項所需的全部證據；`in_progress` 用於部分工作已進行但尚未達出口條件；`planned/not_started` 表示未進入可驗收階段；`not_checked` 表示尚無所需實機／文件／外部證據。程式碼存在與局部通過不得升級成 `passed`。

## 11. Release gates 與外部依賴

### 11.1 Gate 狀態快照

| Gate | 必要結果 | execution-plan v1.5 狀態 |
|---|---|---|
| G0（W2） | 凍結最高目標、R／AT、工程／設計／QA 與驗收環境 | `not_run` |
| G1（W2） | 記錄 iPad／Safari／配件矩陣；判定壓感通過或 deferred | `external_device_required` |
| G2（W5） | AT01／02 與故障注入、保存不偽報 | `partial_repository_and_scoped_desktop_ui_verified_device_pending` |
| G3（W8） | Drawing 雙層、照片鎖定、獨立複製與畫布切換 | `not_run` |
| G4（W12） | fixed／auto、gap、跨日、動態場次欄寬與雙排序 | `not_run` |
| G5（W12） | 遷移、Package roundtrip 與實際 PDF 逐頁檢查 | `not_run` |
| G6（W15） | 指定真實 iPad AT11–18 與無重大缺陷 | `external_device_required` |
| G7（W16–W18） | 兩個去識別真案、目標使用者走查與核心任務結果 | `user_projects_and_participants_required` |
| G8（W19–W20） | 發版／恢復／回退、文件及產品／工程／QA 簽核 | `not_run` |

### 11.2 外部驗收依賴

- **iPad 矩陣：** 執行計畫目前記錄使用者描述為 iPad Pro M1 與磁吸充電 Apple Pencil；精確尺寸、iPadOS／Safari 版本、Pencil 世代及可用時段尚待確認。若要宣稱壓感，另需真實可提供變化 pressure 樣本的筆與校準環境。
- **Windows 測試機：** 需明確記錄 Windows 11、16 GB RAM、Chrome／Edge 穩定版、原生注音 IME、200% 縮放、測試資產及可用磁碟空間。
- **正式文件檢查：** 需能開啟產生的實際 PDF，逐頁檢查；至少使用目標印表機或紙本核對。瀏覽器列印預覽不能替代。
- **真案使用性驗收：** 需兩份可去識別的 20–50 鏡專案、至少 5 位目標使用者及走查時間。目標為至少 4/5 可無協助完成核心五任務，否則記錄例外並作產品決策。
- **人力及套件檢視：** 確認工程、設計及 QA 可用投入比例；WP-07／08 前工程檢查 ZIP／PDF 函式庫與字型來源、固定版本及授權。

## 12. 版本變更與追溯來源

### 12.1 版本變更

- **v1.4：** 保留產品最高目標、R01–R13、資料／保存／遷移、Drawing、畫幅、AT01–AT20、20+2 週相對路線與發布門檻。
- **v1.5：** 增補 SUPER、VO 彙整、圖片欄位、排序、時間輸入、輸出 v2、全日通告與時程列契約；明確覆寫 D06 純圖欄位限制；列出 WP-08 及目前狀態。
- **v1.6（2026-10-28 狀態增補）：** 納入 WP-05 隨機 IndexedDB 隔離檢查 10/10、project-wide 完整 Node suite 221/221（先前 219、214、213 為歷史結果，完整 suite 不代表單一 WP 驗收）、私人 Site 開發版 source commit 95aa5ab464acb397ef9e9eb71f8ce4ca14e16eda 的歷史回報，以及 WP-04 保存失敗／佇列重試 2/2、Model 21/21、repository 3/3 與 native IndexedDB historyDelta abort 的隔離證據：注入 abort 後 8 個 stores 保持不變，未提交 project/history/receipt/snapshot。WP-06 子切片 Node 18/18 與隔離 Chromium UI、場景複用預覽取消零寫入、確認後獨立 Drawing/layer/stroke ID、兩鏡編輯隔離及重開後撤銷／重做與 UI regression 5/5 均為局部證據；真機與完整工作包出口仍未驗。另納入 WP-07 聚焦 Node 38/38 與隔離 Chromium 小型 fixture package UI 往返；ZIP fixture 由 Node 建立，含兩個 74-byte 2×2 PNG 與既有 Drawing 筆跡，並非 UI 現場創作，大封包與真 iPadOS Safari 下載／匯入未驗。WP-08 隔離 Chromium 長文橫式 12／直式 11 頁、44 markers 順序正確、頁首／頁尾無空白頁、短文與純圖 2×2 佔位框橫直測試及 output tests 16/16；後續 9 張真圖 fixture 四模式為 3／3／3／5 頁，直式細項 9 鏡分布 2／2／2／2／1。每筆真圖文字樣本 72 字，長文與真圖未組合；較早 3／3／3／9 頁為密度調整前歷史結果。Chromium iPad viewport 模擬 15 個 viewport／75 個 UI states，並非實際 iPadOS Safari／觸控／Pencil 驗收。Edge、紙本、真 iPad 與其他設備未驗，WP-08 仍 in_progress。部署不等於驗收；破損 1px fixture 的 IMAGE_DECODE_FAILED／零寫入只代表拒絕路徑觀察。WP-05 維持 in_progress。

- **通告單 E2E 狀態補記（2026-10-28）：** 隔離 Chromium fresh BrowserContext 的通告 UI→保存／重開→selected/all PDF 流程 12/12 checks passed；PDF parser 核對 selected 4 頁、all 10 頁及欄位／順序／空日／三區內容，測試頁面樣本可供有限視覺檢查。測試涵蓋多日、空日、預計收工、公司／統編、結構化聯絡人、大組、車輛／乘客、449 字注意事項，以及 untouched blur no-op／changed blur commit。這是 demo Project 的桌面隔離證據，不覆蓋完整輸出選項矩陣、Edge／紙本／真 iPad；WP-08 仍 `in_progress`。該輪全專案 Node suite 主代理回報為 221/221 passed（後續主代理回報已更新為 224/224），兩者均不等同此 E2E 或 WP-08 完整出口條件。
- **v1.6 後續狀態補記（2026-10-28）：** 後續 Chromium 混合 PDF fixture 組合真 PNG、可再編輯 Drawing 與 14,945 字長文，修復後實際輸出橫式 16 頁／直式 14 頁並檢查分頁與 markers 可見；WP-06 修正指標取消只作用於相同 pointer ID，隔離 Chromium 驗證 photoOriginal hash 與向量筆跡重開可編輯。全專案 Node suite 更新為 224/224。私有 Sites source commit `11c03314e2aa9ec33ac1b18f2ed7aa71b5ee4e9c` 部署 succeeded，但部署後 UI 因瀏覽器要求登入未驗；站點仍私有。WP-06／WP-08 保持 `in_progress`；iPadOS Safari、Pencil／壓感、Edge 與紙本仍待驗。

- **v1.6 本輪狀態補記（2026-10-28）：** 隔離 Chromium 的 shot inline editor 六項鍵盤／synthetic IME、取消／重開／保存檢查通過；合成 CompositionEvent/InputEvent 不等同 Windows 注音或 iPadOS 原生 IME，真機仍未驗。保留右側閃動焦點提示作為視覺設計，不將其記為 caret。Package Worker 的 UI／stress／fallback／取消與 transfer ownership 檢查通過；expired ticket／transport fallback、photo decode cancellation、非完整 buffer view transfer 三項 P2 修補已由 Luna 獨立唯讀複核，未見新增重大資料完整性問題。全專案 Node suite 最新回報 237/237。Astra 因容量不可用；本輪改由 Luna 複核。此前 checkpoint 的私有部署 commit 為 `9c7e4c1423662fb3322cc079e9cc29958cf44ec4`；Edge 唯讀目視分鏡頁正常且未修改資料，原生 Edge 列印及互動仍未驗；WP-03／07 及 release gates 保持未完成。
- **v1.6 最終部署追補（2026-10-29）：** 拍攝日 badge regression 修復後，隔離 Chromium app UI initial/add/reload 通過（3 日初始、4 日新增並 reload 保留）；全專案 Node suite 237/237 passed。最終 private deployment commit 為 `fbc2ce1b87902386443847ceead06efd9f7cbc86`；部署後 Edge 唯讀檢視既有專案，Storyboard 的「拍攝安排 3」顯示正常且未修改使用者資料。這不是互動／列印／真機驗收；WP-07 仍 `in_progress`，500 鏡排序 p95 599.7 ms 未達 AT10 ≤200 ms，真 iPad 與 250 MB fixture 未驗。
- **v1.6 v24 本輪追補（2026-10-29）：** A08 通告時間軸空白 Shot 標題輸出修正；`tests/shot-title-empty.test.cjs` 2/2、`tests/output-layout.test.cjs` 16/16 passed。History 同次驗證去重經獨立唯讀 review，公開 API 與 replay/schema 驗證未見弱化。排序內部 stage p95 223.9→104.4 ms，端到端 8 次樣本 p95 506.3 ms 仍未達 AT10 ≤200 ms；衝突保護仍在開發。Private v24 commit `fe938b1ee14ec5f73acb2a3c0251de59753f81f8` 部署成功；Edge 僅唯讀目視既有專案、未改資料，非互動、PDF、原生列印或真機驗收。產品目標與 G0–G8 狀態維持不變。
- **v1.6 v25 本輪追補（2026-10-29）：** Model 傳入同 revision `expectedHistory` snapshot；原生 Chromium IndexedDB 測試拒絕歷史漂移下的可逆合法 patch，8 個 stores 不變；Model corruption／revision mismatch 走既有衝突復原，必要測試 16/16 passed。舊 repository caller 未帶 snapshot 時不受 guard 保護，成本隨歷史大小線性增加，端到端效能未重測。Private v25 commit `68cfd00782984bd33c001c2e9b6b5ba53fd1006b` 部署成功；Edge 唯讀目視既有專案 15 鏡／3 拍攝日／已保存、未改資料，僅視覺非互動驗收。WP 與 G0–G8 狀態維持不變。
- **v1.6 v26 本輪追補（2026-10-29）：** 手繪雙指縮放／平移及 pointer cancel、Pencil／palm、三指重錨、跨圖層橡皮取消修復經隔離 Chromium synthetic QA、38/38 Node checks 與獨立唯讀 review；真 iPad／Apple Pencil 未驗。500 鏡改序 6 樣本 p95 438.3 ms，未達 AT10 ≤200 ms。Private v26 commit `1d220b3f2f3eb1c4299778fe8975bca2a1d920e9` 部署成功；Edge 開啟沒有 Drawing 的既有第一鏡時意外寫入空 Drawing（revision 0→1），UI Undo 後示意圖已恢復但 revision 為 2 且有 redo 歷史，不能聲稱零資料更動；空畫布開啟即寫入列為待修。WP 與 release gates 不升級。
- **v1.6 v27 本輪追補（2026-10-29）：** 空鏡頭開啟只建立本機 draft、不寫入；第一筆有效編輯以單一 Model 交易建立 Drawing 並可一次 Undo，符合預設值的 no-op 不建立 Drawing。aspect change、global retry、undo／redo draft 同步經獨立唯讀 review，未見覆寫已完成筆跡的路徑。Model／UI checks 20/20 passed。隔離 Chromium 滑鼠流程涵蓋空白畫布進出、首筆、注入 quota failure 後 retry、undo／redo 與再次繪製並通過；這是合成桌面 fixture，不是真實 quota exhaustion 或 Pencil 驗收。Private v27 commit `ae088a027b2df0a118f650c931894761890532ff` 部署 succeeded。Edge 對舊專案 revision 2 開啟空白 draft 再返回後仍為 revision 2，原示意圖仍在；僅目視畫布，未測筆輸入。v26 曾意外建立空 Drawing 並 Undo，revision 由 0 變 2 且保留 redo 歷史，應保留此資料更動紀錄。500 鏡 p95 438.3 ms 是 v26 的 6 樣本結果，v27 未重測；WP 與 release gates 不升級。

- **v1.6 v28 本輪追補（2026-10-29）：** Scene reuse 過期 preview 拒絕套用未預覽內容，來源／目標不變並提示重試；fresh preview 隔離 Chromium 成功，Model／UI 20/20。private history 去重獨立唯讀 review 未發現降低 public API 防護或歷史 schema／replay 驗證（靜態審查）。500 鏡／29.29 MB、6 樣本排序 p95 由 400.6 降至 377.3 ms，仍未達 200 ms。真照片與可再編輯 Drawing PDF 四版型各 3 頁、12 頁全數檢視且圖框 contain；缺圖 details 4／images 12 的 16:9、2.35:1 隔離 PDF 未裁切，output Node 12/12。兩次 PDF harness timeout 均發生於 waitForOutputReady，Astra low 確認兩次 timeout 均非畫幅保存失敗；timeout 後狀態未捕捉，根因未定，詳 blocker-events。Private v28 commit 03a06447a47cb5ed6e95f0dc70265c86ba30a803 部署 succeeded；Edge 開啟既有 Project revision 2 並目視輸出預覽，未改資料。非原生 Edge 列印、實紙或真 iPad 驗收；WP／release gates 維持未完成。
- **v1.6 v29 本輪追補（2026-10-29）：** 拍攝日 marker 改為直接垂直排序、水平移動改日，並設 `touch-action: none`；focused checks 36/36，Chromium CDP touch 修正後 reorder／`updateDay` 皆 0 cancel。舊 `pan-y` headless 情境未重現取消；真 iPad 仍待驗。WP-06 修正 Subject 首筆 Undo 後保留選層；隔離 Chromium 確認既有 Drawing 與原圖 hash 不變，WP-06 Node 28/28。WP-07 package validator 拒絕重複 Shot asset 引用及非 `photoOriginal` 引用；package Node 29/29，Worker fallback／cancel 通過；copy cache ticket 單次使用並於 60 秒到期。舊 migration compatibility 保留，但 Schema 尚未執行同等嚴格引用檢查，異常 Project 匯出會被拒絕。Private v29 commit `2fbc78d5d999bbba003efc454bab3c31757fafcb` 部署成功；Edge 唯讀目視既有 Project revision 2 的拍攝安排與展開時程，未拖曳、未改資料。真 iPad／Pencil 未驗，WP 與 release gates 維持未完成。

 - **v1.6 v30 本輪追補（2026-10-29）：** 跨拍攝日 UI 以單次 `updateEntry` 更新，含固定／自動提示、double-click guard、`save_failed` retry；Undo 後選取回到來源項目。隔離 Chromium 重開／Undo／一次性注入保存失敗通過，scoped Node 49 項通過；44 px 控件僅桌面 Chromium 證據，非真 iPad。封裝 UI Save As copy→reload→vector edit/save→export→clean import/reopen/re-export 通過，使用生成 2×2 PNG，向量 hash 完全相同；未知 extension 依契約拒絕，預覽標示來源專案 ID／revision。package checks 48/48。競態 QA 同一 wait 兩次逾時，Astra low 指出 frozen model monkey-patch 無效；修正測試注入後通過，見 blocker ledger。Private v30 source commit `658a5502fdab5b89cebc00d0fd0c3063585e443c` succeeded。Edge 唯讀目視既有 revision 2 的拍攝安排與移動控件、未改資料。工作包／goal／release gates 未完成；真 iPad 未驗。

- **v1.6 v31 輸出／手繪／排序與部署追補（2026-10-29）：** 輸出長文切點保留 UTF-16 代理對，單一 emoji＋art 可正確拆續頁；output tests 39/39。隔離 Chromium UI toggle 往返及 A4 橫／直 PDF 各 12 頁通過；DOM 原文順序、pypdf emoji markers 通過，含 emoji 的實際 PNG 頁面已目視。print-origin QA 連續兩次失敗後，Astra low 診斷 viewport／document 座標混用；測試加入 scroll／document／page-stage 量測與 scroll reset，保留 geometry 及實際 PDF 檢查後重跑通過，詳 blocker ledger。手繪 scoped checks 37/37、五個隔離 workflows 通過，均非真 iPad／Pencil。相鄰 DOM 排序微優化的 app profile 92.4→68.6 ms，但六樣本端到端 p95 511.8 ms 仍未達 200 ms，且無證據顯示端到端改善，因此依 KISS 移除；511.8 ms 是移除前測量，不是回退後版本數值。Private v31 commit `605c0eab23816bc0ccb76947f8457c97d24019d3` succeeded；Edge 唯讀目視既有 revision 2 輸出頁，未改資料。真 iPad／Pencil／原生列印／實紙仍待驗，WP、goal 與 release gates 不升級。
- **v1.6 v32 本輪互動追補（2026-10-29）：** `tests/wp06-drawing-global-retry-browser-qa.cjs` 注入一次 `QuotaExceededError` 後確認 Project、Drawing、history 不變；全域重試使同一筆清除命令只提交一次，編輯器回到 saved、重試提示清除且可返回分鏡。`tests/wp06-drawing-background-browser-qa.cjs` 亦通過照片底圖更換失敗／重試，底圖 hash、history、undo／redo 與重開結果一致；本次未重現逾時。分鏡 list／gallery 右側 44 px「滑動」通道以 `tests/storyboard-touch-browser-qa.cjs` synthetic CDP touch 驗證頁面由 `scrollY=0` 捲至 205 且鏡頭順序不變，另外確認觸控排序與標題保存。`tests/schedule-cross-day-browser-qa.cjs` 驗明示 `startNextDay`：預設同日，勾選後 timeline 與通告單均顯示翌日日期及正確空檔。三項均為隔離桌面 Chromium／生成資料證據，不是真實配額耗盡或 iPadOS Safari／Apple Pencil 驗收；真 iPad 仍 `not_checked`，WP 與 release gates 不升級。
- **v1.6 v33 WP-04 native history 追補（2026-10-29）：** `tests/wp04-native-history-100-browser-qa.cjs`／`tmp/wp04-native-history-100-browser-qa.json` 在 fresh isolated Chromium、生成 blank Project 與原生 IndexedDB 中提交 101 個創作命令；保存 100 筆唯一 history entry。重載後 100 次 undo 停在保留 floor（`native-history-step-1`，`canUndo=false`），再次重載後 100 次 redo 回到 `native-history-step-101`；Project 與 historyState revision 由 103→203→303 持續一致，page errors 為 0。這是限縮的桌面 Chromium／native IndexedDB 證據，不覆蓋配額耗盡、OS crash、完整 WP-04 或真 iPadOS Safari；WP-04 與 release gates 均維持未完成。
- **v1.6 v34 本輪搜尋排序、預估收工與自動輸出方向追補（2026-10-29）：** 搜尋期間方向鍵及上／下移改為移動至相鄰可見鏡頭，同時提交完整 Scene 次序並保留隱藏鏡頭相對順序；`tests/reorder-ui.test.cjs` 17/17 通過，隔離 Chromium 三鏡案例確認搜尋後可見順序改變、完整次序保留且後續拖曳正常，無頁面錯誤。日內所有時段皆可推算時，派生收工改取所有已知 `endOffset` 最大值；重疊固定時段 09:00–17:00 與 10:00–11:00 保留 420 分鐘警示，但安排摘要及通告預覽均正確顯示 17:00。`tests/estimated-wrap.test.cjs` 2/2 通過；fresh Chromium BrowserContext／生成空白專案檢查安排頁與通告預覽，page／console errors 為 0。自動輸出方向依所選 density 評估方向容量；`tests/output-layout.test.cjs` 40/40 通過，隔離 Chromium 的 4:3 四鏡細項案例確認直／橫容量為 2／3，density=1 時兩向皆可容納並選 portrait，列印媒體字級為 12px（9pt），無瀏覽器例外；此案例未產生 PDF。GitHub Pages workflow `.github/workflows/deploy-pages.yml` 僅手動 `workflow_dispatch`，本輪沒有部署。上述皆是限定 Node／桌面 Chromium 證據，不是原生列印、實紙或真 iPadOS Safari 驗收；WP、MVP、goal 及 release gates 均未升級。
- **v1.6 v35 搜尋／排程／history 追補（2026-10-29）：** 本輪排程與新增日固定時間的限定證據及 undo／asset hash 未解限制見 §10.1；搜尋排序僅沿用 v34 證據，未重跑。本輪不升級工作包或 release gate。
- **v1.6 v36 選日 Undo／未知後自動碰撞／Pages 依賴追補（2026-10-29）：** 選日 Undo 現可在不留下孤兒 selected-day preference 的情況下提交，atomic abort／retry、redo 與重載證據及範圍見 §10.1。已知自動項與未知前固定區間的碰撞會同步呈現在安排及通告；unknown 仍不推算。Pages workflow 為手動觸發；靜態相依 guard 本機發現 17 個未追蹤 dist references，workflow／公開部署未執行。Asset hash／legacy 相容與真機驗收仍未解，本輪未升級 WP 或 release gates。
- **v1.6 v37 R04 裁切資料與 package 往返追補（2026-10-29）：** `Shot.photoCropsByAssetId` 為 optional per-Shot crop map，schema 嚴格驗證參照與正規化矩形；Model／bridge 支援設定與 reset 歷史命令，duplicate／移除引用同步保留或清理 map。裁切只套用鏡頭卡與輸出，Drawing.backgroundAssetId 與向量筆跡保持原樣。`tmp/wp07-crop-package-native-qa.json` 記錄隔離 Microsoft Edge 原生 IndexedDB 5/5 passed、0 failed／not_checked：ZIP 匯出解析、source import/readback、Worker copy ticket／Asset ID remap、copy import/readback；生成 1×1 PNG 的來源與副本 SHA-256 相同，來源未變。這不代表真照片、EXIF 方向、真 iPadOS Safari 或一般編輯每次重新驗全部既有 Asset hash 已通過；Asset hash 缺口沿用 §10.1／wp05-assets-contract。R04／WP-05、MVP 與 release gates 均不升級。
- **v1.6 v38 Drawing v2 固定底圖裁切追補（2026-10-29）：** 新 Drawing v2 以 `backgroundCrop` 保存建立時選定 Shot 照片的裁切快照；`null` 表示完整原圖，矩形為正規化座標。既有 v1 不含此欄位並維持完整原圖；schema 測試確認 v1/v2 驗證及對 v1 加 crop、缺少 v2 crop、無效矩形與未支援未來版本的拒絕。Shot 後續裁切不改既有 Drawing；換／移除背景 Asset 清除 crop，undo／redo 可還原。`tests/wp06-drawing-model.test.cjs` 11/11；`tests/wp06-drawing-background-browser-qa.cjs` 以隔離 Chromium／原生 IndexedDB 驗證建立、替換／移除、undo／redo、重載與原圖 bytes/hash 不變；`tests/wp07-native-harness-browser-qa.cjs` 5/5，驗證 package 匯入及 Worker copy 保留 v2 crop 和 v1 shape、Asset ID remap、來源／副本 bytes 與 SHA-256 相同。證據使用生成 PNG 與桌面隔離瀏覽器，不是 iPadOS Safari／Apple Pencil、真照片 EXIF 或一般編輯每次重驗所有 Asset hash；WP-05／WP-06、R04、MVP 與 G0–G8 不升級。

- **v1.6 v39 跨夜固定時段與 package copy 提示追補（2026-10-29）：** `tests/timing-toggle-ui.test.cjs` 11/11 通過，涵蓋當日、跨午夜與翌日同日的 `dayShift` 邊界；隔離 Chromium 兩個新 BrowserContext 實際從拍攝安排將 auto 切換為 fixed。23:30＋90 分鐘保存為 23:30–01:00，僅「結束於翌日」為 true；前項 60 分鐘後的 00:30–01:00 保存為「開始於翌日」true、「結束於翌日」false。時間欄、翌日勾選、固定模式與通告列標示一致，page errors 為 0。`tests/package-import-preview-ui-browser-qa.cjs` 以隨機 localhost origin、合成 ZIP 及隔離原生 IndexedDB 通過：未知 `project.projectExtension` 無法安全重映射時顯示欄位路徑、隱藏確認匯入動作並提示不建立副本／不寫入，再提供改用原 ID 的明確提示；原 ID 已存在時拒絕覆寫，碰撞及重試路徑的資料庫列數保持不變，page errors 為 0。以上為生成資料的限定桌面 Chromium 證據，不是公開部署或真機驗收；WP、MVP、goal 與 G0–G8 release gates 維持未完成。

- **v1.6 v40 手動照片完整性與分鏡卡片快取追補（2026-10-29）：** 照片完整性掃描為使用者啟動的唯讀逐張驗證；隔離 Chromium 測試確認切案取消、舊／新 session 競態隔離、同大小 Blob 的 `ASSET_HASH_MISMATCH` 偵測及 Project／Asset／Blob 不變。分鏡卡片 URL 快取在 IntersectionObserver 與 bounded fallback 兩種隔離瀏覽器模式通過；fallback 另驗切換專案與離開分鏡清 URL、回入重載，Drawing／輸出獨立圖像與原圖 hash 不變。500 張生成 320×180 PNG（29,290,493 原始 bytes）捲動案例載入卡片圖 494→5；以每張 320×180×4 bytes 估算 decoded surface 108.54→1.10 MiB。此為像素表面估算，非 RSS／GPU／峰值或 iPad 量測；未重跑排序，AT10 ≤200 ms 改序 p95 gate 及一般保存對所有既有 Asset 的 hash 保證仍未通過／未驗，WP、MVP 及 G0–G8 不升級。

- **v1.6 v41 鏡次鎖定規則與隔離驗收追補（2026-10-29）：** 使用者確認鎖定鏡次保留；未鎖定鏡頭依本場順序避開已用號碼，場次與鏡次獨立、不同場可重用鏡次、顯示不補零。已實作 optional `shotNoLocked`、舊任意 `shotNo` 向後相容、共用 resolver、跨場鎖號碰撞拒絕、唯讀重編 preview 與單筆批次 command；另存副本白名單保留此已知欄位並維持未知欄位 fail-closed。空標題 Shot 新排入日程時 `entry.title` 留空，避免保存 raw `shotNo` 作為舊標題；既有 entry 標題及 break／活動名稱不猜測、不改寫。Schema、Bridge、Model、package-copy 與 lock/history 定向 Node 測試通過；新空標題與既有自訂標題回歸案例所在隔離 Node suite 46/46。`tests/shot-number-lock-ui-browser-qa.cjs` 與 `tests/shot-number-lock-output-conflict-browser-qa.cjs` 使用生成專案和隔離 Chromium，覆蓋鎖定／解除、排序、搜尋／旁白鏡次、空標題及舊排程標題、唯讀控制、預覽取消／過期／衝突及輸出範圍的 fail-closed；round report 為通過且無 page errors。這不代表真 iPadOS Safari／Apple Pencil、原生列印或實紙驗收；R03／WP-03、MVP、goal 與 release gates 均不升級。

### 12.2 追溯文件

- [PRD v1.5 變更附錄](PRD-v1.5-addendum.md)：A01–A15、D06 覆寫、輸出偏好、估算及狀態界線。
- [開發執行計畫 v1.5](execution-plan.json)：WP-01–WP-09、G0–G8、相對週程、外部依賴與最新狀態快照。
- [輸出 v2 契約](output-v2-contract.md)：分鏡純圖／細項、偏好 v2、動態 density、固定 revision 與通告輸出。
- [製作時程、拍攝日與通告單契約](production-schedule-contract.md)：混合列、拍攝日、日內時間、通告資訊及驗收條件。
- [分鏡卡片互動規格](shot-card-interaction.md)：緊湊三欄、無框編輯、焦點提示、草稿與拖曳邊界。
- [使用者需求與狀態盤點](user-requirements-2026-10-27.md)：需求依據與 10/28 狀態更正；盤點不等於驗收。
- [v1.4 原始 PRD／開發排程 DOCX](../../storyboard-prd/v1.4/Director_Storyboard_Editor_PRD_開發排程_v1.4.docx)：較完整的 AT 案例與架構背景。
- 競品通告架構參考：[STB 官方 README](https://github.com/qwert2813434-ctrl/STB/blob/main/README.md)，只支援資訊架構參考，不構成相容性宣稱。

- **v28 進度（2026-10-29）：** 已部署私人原型 commit `03a06447a47cb5ed6e95f0dc70265c86ba30a803`。場景複用草稿預覽過期時拒絕套用，隔離 Chromium 驗證重新預覽後可複用；手繪 Model／UI 20/20 通過。輸出真圖限制於畫幅內，隔離 Chromium 真照片與 Drawing 的 A4 橫直、純圖／細項四份 PDF 各 3 頁已視覺檢查；缺圖在 16:9／2.35:1、細項 4 鏡與純圖 12 鏡案例未見裁切，相關測試 12/12。歷史處理去除同次重複複製後，500 鏡／29.29 MB 六筆排序 p95 400.6→377.3 ms，仍高於 200 ms；靜態複核未發現公開 API 或 history schema／replay 防護弱化。Edge 線上既有專案 revision 2 的輸出預覽已目視；真 iPad、Pencil、原生列印與紙本仍未驗，工作包及 release gates 不升級。

## v42 Local Asset integrity and performance evidence (2026-10-29)
The local repository implementation now rehashes candidate-referenced existing Asset Blob bytes inside the same native IndexedDB transaction; new assetWrites remain pre-transaction verified. The change is local and undeployed. Native Chromium IndexedDB integrity QA passed 6/6, and the targeted Node repository/import/save-retry suite passed 17/17. The 8-store transaction uses repeated locks.get keepalive requests and a fixed 10-second total deadline. It can block lease renewal; lease expiry or timeout safely rejects the save. The timeout test injects 25 ms rather than waiting ten seconds. WP-02/WP-04 short-transaction conflict and true Safari behavior remain open.
A single 262,144,000-byte Blob hash+commitTransaction measured 1,104.5 ms in a fresh isolated Playwright BrowserContext with HeadlessChrome 156.0.8078.4. The different distributed-image app fixture contained 500 shots, 50 scenes, 10 days and 500 generated 1146x764 JPEGs totaling 252,074,895 bytes. Full-selection-refresh UI measured reorder p95 2,208.9 ms over 6 samples and healthy edit commit p95 2,503.7 ms over 4 samples. The temporary status-only UI variant measured 2,271 ms reorder p95 over 6 samples and 2,667.5 ms edit p95 over 4 samples, showed no improvement, and was reverted. The filtered reorder used Shot 00, about 99 visible shots, and the stale-image callback was skipped. Frozen runs use the older keepalive snapshot that still included same-transaction hashing but predated the later locks.get simplification; headless Chromium on a 31.87 GiB host. The one-Blob repository and full-app distributed-photo workloads are not directly comparable.
The readonly guard-separation prototype at tmp/asset-guard-prototype-results-20261029.json failed in both Chromium headless 156 and Edge-labelled HeadlessChrome 155. Lease renewal, competing Asset writes and final commit were pending while the guard remained live, and mismatch handling reported guardAborted=false; disjoint guard scheduling is not proven.
AT10 remains unchanged at reorder p95 <= 200 ms and healthy commit <= 2 seconds; the 500-Asset app fixture missed both. No WP, MVP, performance gate or G0-G8 release gate is upgraded. No deployment or true iPadOS Safari acceptance was performed.

### v42 detached-guard queue-order recheck (2026-10-29 00:17:29.832Z)

This addendum supersedes the earlier prototype summary in this v42 note. The latest artifact is tmp/asset-guard-prototype-results-20261029.json. In the controlled ordering where lease renew and final commit are queued before the Asset writer, the base scenario completes while the guard is live; the writer remains pending. That one ordering does not establish a safe general schedule.

Both browser runs report passedAllQueueOrders=false and passedAllWriterOrders=false. When the Asset writer is queued before lease renewal, the renew waits behind the earlier writer until the guard is released. When the writer is queued before the final Project commit, both wait; after release, the Asset writer commits before the Project commit, and assetHashMatchesExpectedAfterRace is false. This reproduces a TOCTOU in the separated-guard prototype.

The corrected mismatch case now reports guardAborted=true and canonicalStateUnchanged=true, superseding the earlier run that reported guardAborted=false. Hash duration including guard hold was 456.7 ms in Chromium headless 156 and 454.1 ms in Edge-labelled HeadlessChrome 155; these are not standalone digest timings. The prototype remains failed as an all-order solution and is not validated for Safari or production use.

### v43 A08 empty Shot title display follow-up (2026-10-29)

A08 display handling now treats empty and whitespace-only Shot titles as absent for interface labels. The fallback identifies the current resolved Scene/Shot number, including locked Shot numbering, without changing the stored title or schedule text. Reorder fast-path accessibility labels, delete confirmation, and schedule-removal confirmation use the same display helper. Callsheet/PDF output retains an empty title without placeholder text.

Verification passed: the targeted Node suite passed 30/30 across empty-title, locked-number, and reorder tests. The isolated Chromium browser QA passed for empty, whitespace-only, and named titles; locked numbering after keyboard reorder; pool, schedule, VO, and output labels; and canceled confirmation dialogs without writes (pageErrors=0). Syntax and diff checks passed. The private v43 deployment is associated with source commit 55a25531ba93faa53b6250fc1a9002a4903b7307. Edge received a read-only screen review. True iPadOS Safari acceptance and formal release remain incomplete; no MVP or release gate is closed by this follow-up.

### 2026-10-29 optimistic reorder isolation prototype limits

Prototype evidence: `tmp/optimistic-reorder-prototype/optimistic-reorder-prototype-results.json`. This was an isolated, runtime-patched app run and was not deployed. Its fixture contains 500 shots, 50 scenes, 10 shooting days, and 500 unique generated synthetic PNGs. The PNG bytes total 29,290,493 bytes (29.29 decimal MB); deterministic trailing padding raises the fixture to exactly 252,000,000 bytes (252 decimal MB). Therefore the 252 MB figure is not 252 MB of encoded image content, and the fixture is not made of real photos. The evidence applies only to the runtime-patched source snapshot hashes recorded in the artifact; it is not a measurement of deployed v43 or a release build.

Across six exploratory desktop-isolated readings (one pending-save probe plus five reorder interactions), input-to-UI-feedback p95 was 212.3 ms, 12.3 ms above the 200 ms target. Input-to-durable p95 was 1,659.5 ms (n=6). These prototype measurements do not establish AT10 or device acceptance. The interactions did not validate actual drag gestures, hand drawing, typed draft input, multi-select, or undo.

The separate revision-fence negative control is recorded in `tmp/asset-hash-revision-fence-prototype-results-20261029.json`: a raw assets-only IndexedDB write bypassed the Project revision fence, left the Project revision unchanged, and was followed by a successful final commit whose Asset hash no longer matched metadata. The fence evidence therefore applies only to writers using the repository transaction and atomic Project revision update; raw IndexedDB writers bypass that boundary. The prototype was not deployed. AT10, MVP, and release-gate status are unchanged.

### 2026-10-29 optimistic reorder 29MB extension supplement

This addendum supplements the preceding padded 252 MB prototype note; it does not replace it. Evidence: `tmp/optimistic-reorder-prototype/optimistic-reorder-29mb-extension-results.json`. This extension used an unpadded fixture of 500 generated synthetic PNGs across 500 shots, 50 scenes, and 10 shooting days, totaling 29,290,493 bytes (29.29 decimal MB). It ran in an isolated runtime-patched app and was not deployed; the artifact records its source snapshot hashes.

For six exploratory measurements, input-to-UI-feedback p95 was 168.5 ms and input-to-durable p95 was 754.3 ms. An automated pointer drag from Shot 2 to Shot 1 succeeded and persisted the expected order, but that single full-interaction measurement was 325.8 ms. These results do not upgrade AT10. A project-title draft combined with multi-select was preserved through a quota failure: the reorder rolled back, the unsaved status and retry remained available, and retry committed the order while preserving selection and the still-unsaved title draft, which was restored on reopen.

Shot-inline draft input, hand drawing, a true interactive GUI, and iPad were not verified. The prototype remains undeployed; AT10, MVP, and release-gate status remain unchanged.

### 2026-10-29 Asset fence/permit and preview interaction follow-up

The revision-fence experiment in `tmp/asset-hash-revision-fence-prototype-results-20261029.json` hashes all 500 synthetic Asset Blobs (252,074,895 bytes) outside IndexedDB, then uses a short Project revision/lease-fenced commit. In isolated Edge runs, repository writers that update Asset rows and Project revision atomically serialize correctly in both write orders; the measured hash and commit stayed within the 2-second repository-only budget. The deliberate raw assets-only write remains a negative control: it leaves Project revision unchanged, bypasses the fence, and permits a final commit whose Asset bytes no longer match metadata. This prototype therefore does not meet the raw-IDB integrity requirement.

The follow-up Project fence/commit-permit experiment is recorded in `tmp/asset-fence-heartbeat-prototype-results-20261029.json` and `tmp/asset-fence-heartbeat-race-only-results-20261029.json`. Its single native readwrite transaction hashes and commits all 500 synthetic Assets while scoping `projects` and `assets` but excluding `locks`. Edge HeadlessChrome 155 completed two repository-only 500-Asset hash+commit samples in 1,015.2 ms and 995.2 ms. However, lock-only heartbeats did not actually run concurrently: 24 and 23 renewal attempts completed only after commit, with maximum delays of 936 ms and 911 ms. A handoff queued from the hash-start callback waited for the 382.2 ms transaction; the handoff completed after commit, and two heartbeat attempts queued behind it failed after the owner changed. A 100 ms permit expired during a 64 MiB hash (188.7 ms); the commit aborted with `PERMIT_EXPIRED`, leaving Project revision/title and receipts unchanged. Same-size raw Asset corruption committed before hashing was rejected as `ASSET_HASH_MISMATCH`; a raw write queued during hashing ran only after the commit, then changed the bytes, which a later hash detected. The transaction protects the bytes at commit time but cannot prevent arbitrary later same-origin IndexedDB writes. The configured Chromium headless-shell binary was unavailable; no Safari or specified target-device acceptance was performed. These are isolated synthetic repository tests, not full-app AT10 measurements. No tested option currently satisfies full raw-IDB protection and unblocked lease renewal together; AT10, WP, MVP, and release-gate status remain unchanged.

The preview-agent interaction follow-up uses the isolated runtime-patched app fixture in `tmp/optimistic-reorder-prototype/optimistic-reorder-prototype-results.json` (500 shots, 50 scenes, 10 shooting days, 500 generated PNGs totaling 29,290,493 bytes; no user photos). This supersedes the earlier not-verified statement only for these narrow interactions: it exercised text-draft composition with synthetic `CompositionEvent`/`InputEvent`, a seven-point browser pointer stroke that remained attached to its Shot and reopened after retry, and a `QUOTA_EXCEEDED` reorder failure that rolled the preview back to canonical order while retaining unsaved status, retry, draft, and Drawing association/stroke. One direct pointer-drag sample reached UI feedback in 361.2 ms, 161.2 ms over the 200 ms target; this is a single sample, not an AT10 p95 result. The prototype is undeployed and records its source snapshots. Native Chinese IME, real iPadOS Safari, Apple Pencil/pressure, and target hardware remain not_checked; no AT10 or release gate is upgraded.

### v44 通告觸控、容器響應與待排池 markup 追補（2026-10-29）

本輪沿用 R10 的 44×44 CSS px 觸控目標。`dist/styles.css` 在粗指標環境提高通告新增、刪除、列操作、on-call 控制與欄位命中區；`.day-callsheet-panel` 依實際側欄寬度使用 container query，窄面板時改為兩欄或單欄，使操作列留在表單內。

待排池字幕修正使用 `shotLabel()` 產生可供樣式化的場次／鏡次標記，並分別 escape 使用者標題與秒數文字，避免標記原始碼被當文字顯示。`tests/shot-title-empty-ui-browser-qa.cjs` 的隔離瀏覽器案例涵蓋空白／空格／具名與 markup-shaped hostile 標題、待排池、安排、VO、輸出及確認對話框；preview 代理回報完整腳本 pass、pageErrors=[]、定向 Node 2/2。該腳本沒有保存完整機器可讀 run summary，故此狀態標為代理回報。修復後實際 app 截圖為 `tmp/shot-pool-markup-fix-kveQv0/actual-app-ipad-landscape.png`；測試中的 `<img ...>` 標題以字面文字顯示，沒有建立 image element 或執行 event handler。

通告觸控隔離 E2E `tests/callsheet-touch-app-browser-qa.cjs` 使用新 BrowserContext、隨機 localhost origin 與單一生成示範專案。結果 `tmp/callsheet-touch-app-20261029-08/result.json` 記錄 768×1024 portrait 與 1024×768 landscape：兩者文件寬度等於 viewport，最小互動目標 44×44、textarea 54px、overlap=0、clippedTargetCount=0，page／console errors 為 0。測試以觸控新增四種通告列、輸入聯絡人文字、切換 on-call（初值 true，預期及保存值 false，reload 後 DOM／IndexedDB 仍為 false），經唯讀頁面明確 reclaim 後再分別以觸控刪除聯絡人；刪除列在 DOM 與 IndexedDB 均消失。

通告觸控截圖 `tmp/callsheet-touch-app-20261029-08/actual-app-ipad-portrait.png` 與 `actual-app-ipad-landscape.png` 是待排池 markup 修正前的本機 app 截圖；它們保留通告操作與幾何證據，左側待排池仍可見舊字幕 markup，不能作為修正後待排池的視覺證據。修正後待排池另以 `tmp/shot-pool-markup-fix-kveQv0/actual-app-ipad-landscape.png` 驗視。

主代理回報 v44 私有部署來源 commit `ea0038de329ca6957e28a8815215a2c8ca502ae2`；Edge 上線後以唯讀模式開啟拍攝安排，目視未見 raw HTML，且沒有修改既有資料。此項是主代理回報的線上視覺檢查，互動與資料寫入驗收未執行。以上 Chromium iPad 尺寸是模擬 viewport／synthetic touch，不是 iPadOS Safari 或真機驗收；MVP、各 WP 與 G0–G8 release gates 均維持未完成／未升級。

### v45 手繪來源鏡次、空標題與輸出摘要追補（2026-10-29）

Drawing 場景複用預覽沿用共用鏡次 resolver：同場鎖定鏡次與略過自動鏡次均顯示各自場次／鏡次；不同場可重用相同鎖定鏡次，來源標籤保留場次資訊。空字串與純空白標題不產生替代名稱，非空標題保留原文；惡意 markup-shaped 標題仍以純文字顯示。`tests/wp06-drawing-scene-reuse-browser-qa.json` 記錄隔離 Chromium／原生 IndexedDB 場景複用 QA 通過，涵蓋來源與目標、取消零寫入、鎖號來源、空標題、resolver 失敗時停用及恢復後可再次預覽，`pageErrors=[]`。定向 Node suite 19/19 為代理回報；此為生成專案與桌面隔離瀏覽器證據，不是 iPadOS Safari 或 Apple Pencil 驗收。

輸出頁面摘要修正把全部未估的片長顯示為「全部未估」，部分未估時保留已知秒數並標為「已估片長」，完整估值仍顯示「預估片長」；零鏡時不顯示 0 秒。指定 Node 命令 `node --test tests/output-summary.test.cjs tests/output-layout.test.cjs tests/output-preferences.test.cjs tests/storyboard-output-real-art.test.cjs` 通過 43/43。`node tests/output-summary-browser-qa.cjs` 在隔離 Chromium 生成專案中驗證全部未估、部分未估與全已估三種預覽，並產生三份實際 A4 橫式 PDF；DOM、print handler 與 pypdf 解析摘要一致，每份 1 頁、841.92 × 594.96 pt，`pageErrors=0`。三張 PDF raster 已目視檢查。測試攔截 `window.print`；這不代表原生 Edge 列印對話框、印表機／實紙或 iPad 列印分享通過。

Astra low 對先前 Drawing 場景複用 QA selector timeout 的唯讀診斷指出：resolver 失敗時按鈕確實停用並更換 accessible name，舊 `getByRole` 名稱選擇器因此逾時，且發生在 disabled assertion 前；這是測試選擇器與 disabled-state 名稱不同步，不是已證實的產品功能失敗。現行 QA 直接檢查狀態文字旁的按鈕停用狀態，該 resolver-failure case 已包含在通過的隔離 Chromium 結果中。

主代理回報 Site v45 私有部署成功，來源 commit `367dbfaf1654f1081971676572a5907580b8cd43`；部署後主代理在 Edge 對線上輸出頁做唯讀視覺確認，未修改既有專案資料。此為主代理回報的上線畫面目視，不代表互動、原生列印、實紙或真機驗收。Site 部署與桌面隔離證據不升級 R03／R08／R10／R11、WP、MVP 或 G0–G8；真 iPadOS Safari、Apple Pencil／壓感、原生 Edge 列印與紙本仍 `not_checked`。

### v46 封裝另存副本欄位／ID 修復與效能 profiler 追補（2026-10-29）

封裝另存副本修復完整保留已知 schema 欄位，並 remap 已知 canonical ID 與相應 references；主代理回報定向 Node suite **53/53 passed**。`tmp/wp07-package-ui-qa.json` 記錄 fresh isolated Chromium、Worker UI、原生 IndexedDB 存檔／重開與乾淨 BrowserContext ZIP 再匯入／匯出：23 個 canonical ID remap，`23:50–00:20` 跨午夜排程仍保留 `startNextDay`／`endNextDay`，通告欄位、production timeline／tasks、Drawing 與來源 references 完整，來源 Project／Asset／Drawing／history fingerprint 未變。兩個 fixture PNG（`photoOriginal`、`drawingPreview`）各 74 bytes，複製後 bytes／SHA-256 與來源一致；這是小型生成資產，不代表真實媒體或 iPad Files 往返。另有低優先追溯限制：不同拍攝日的通告列可重複同一 `kind/from`，其 ID 唯一性依日／collection 範圍判定，因此 `idRemap` 的這組鍵不能唯一反查跨日來源列；複製後列 ID 仍各自唯一且目標 references 有效，未見資料損失。此追溯缺口不改本輪驗收結論。

主代理回報 Site v46 私有部署成功，來源 commit `1e63d7bf683d293dc04192a1799855d7a094dce9`。部署後主代理僅在 Edge 開啟專案選擇畫面做目視確認；沒有進入專案，沒有修改資料。這不是專案內容、互動、儲存或 iPad 驗收。

效能追補見 `tmp/perf-gap-profiler-diagnostics-20261029.json` 與 `tmp/perf-gap-current-stage-profile-20261029.json`。舊 temporary profiler 兩次因 instrumentation anchor 過時而在取樣前中止：先缺 history `makePatch` anchor，繞過後再缺 repository `writeCommit` anchor。主代理回報 Astra `gpt-6-astra`／low 診斷認為是 profiler 與目前 source anchor 漂移；以只改 temporary profiler 的唯一 anchor 檢查及 raw／served source hash pin 重跑。新結果為 500 鏡、50 場、10 拍攝日、500 張生成 PNG、29,290,493 bytes 的 isolated Chromium 小型合成 fixture，8 次 reorder 的 `keyToDataSubscriber` 約 578–694 ms；`sourceFilesUnchanged=true`、`pageErrors=[]`。該測量不是目標 iPad／真實大型素材測量，排序互動仍未達 AT10 ≤200 ms；不升 AT10、WP、MVP 或 G0–G8 gate，真 iPadOS Safari 仍 `not_checked`。

### 2026-10-29 optimistic 排序本機整合與隔離 QA 追補

本機 `dist/app.js` 包含 optimistic 排序實驗整合；私有 Site v46 使用來源 commit `1e63d7bf683d293dc04192a1799855d7a094dce9`，不含本輪本機實驗，本輪沒有部署。獨立唯讀 review 為主代理回報：review 指出 Model event 可能在組字期間搬移輸入節點；實作者加入 focused/composing 時 no-reparent/defer 後，以下隔離 Chromium QA 通過。review 未留下獨立 artifact；此 source-level 風險未在原生作業系統 IME 或 iPad 實機重現。

`tmp/optimistic-reorder-prototype/integrated-reorder-browser-qa-results.json` 記錄 500 鏡、50 場、10 拍攝日、500 張生成 PNG、29,290,493 bytes 的隔離桌面 Chromium fixture，沒有使用者照片。合成 `CompositionEvent`／`InputEvent` 驗證組字中阻擋排序、組字期間 canonical model 不變、提交草稿後再排序；失敗重試時比較 Model、DOM 與 IndexedDB。排序提交時欄位保持 focus 的 DOM 會依設計暫緩重排，blur 至場次搜尋欄後再等待並核對 DOM、Model、IndexedDB 一致。亦通過 pending 狀態切頁阻擋、切案 `PENDING_CHANGES` 拒絕、切至隔離空專案再返回、鍵盤／搜尋排序、瀏覽器 pointer drag、多選排序 rollback/retry，以及 `QUOTA_EXCEEDED`、`REVISION_CONFLICT`、`LEASE_LOST` 回復；`pageErrors=[]`。定向 focus/IME 結果另見 `tmp/optimistic-reorder-prototype/integrated-reorder-browser-qa-focus-ime-passed.json`。這些是合成事件與生成資料的桌面隔離驗證，不是原生 IME 或 iPadOS Safari 驗收。

六個互動樣本的 input-to-UI-feedback p95 為 346.1 ms，超過 200 ms 目標 146.1 ms；一筆直接拖曳回饋為 1,152.2 ms，超過 200 ms 目標 952.2 ms。此拖曳為單一探索性樣本，非 AT10 p95；正式目標硬體 AT10 未驗，不能升級 AT10。真實 iPadOS Safari、原生中文 IME、Apple Pencil／壓感與真實照片素材仍未驗。工作樹的 `dist/app.js` 保留本機實驗；私有 v46 不包含該整合，本輪未部署。不得因此升級 WP、MVP 或 G0–G8 release gates。

同輪輸出限定檢查中，`node --test tests/output-layout.test.cjs tests/output-preferences.test.cjs` 為 26/26。`node tests/output-print-preparation-browser-qa.cjs` 在新隔離 Chromium demo Project 產生 A4 橫式與直式各 12 頁 PDF，頁面沒有 overflow，72 個文字 markers 順序正確且 emoji 保留；圖片解碼、快照捕獲及版本變更取消路徑均未錯誤呼叫列印，`pageErrors=[]`。實際 PDF 與頁面 raster 見 `tmp/print-preparation-qa/`。測試攔截 `window.print`，只驗 Chromium CSS/PDF 輸出，不代表 Edge 原生列印對話框、印表機／實紙或 iPad 驗收；本輪未發現可重現的輸出 P0。

### 2026-10-29 公開 GitHub source repository 推送紀錄

主代理回報已將乾淨候選推送至公開 repository [kinostudio/kino-storyboard-editor](https://github.com/kinostudio/kino-storyboard-editor)，`main` commit 為 `9bcc41731326ae834e5c3575a84464a3de79199d`。回報範圍為 v46 穩定 runtime 與 tooling；`git ls-remote` 的遠端 `main` 與候選 HEAD 相同，並已目視檢查 GitHub UI。這筆紀錄只代表 source repository 公開。

GitHub Pages workflow `.github/workflows/deploy-pages.yml` 未觸發；沒有公開 Pages 部署、公開產品站 URL 或線上核心流程驗收結果。不得將公開原始碼 repository 描述為公開網站已部署。MVP 仍 `incomplete`，Pages 發布仍未開始，真實 iPadOS Safari 驗收仍 `not_checked`；既有 G0–G8／WP 狀態不因 source 推送而升級。

### 2026-10-29 本機拍攝安排跨日整組移動、IME 防護與平板時間列追補

本機 `dist/app.js` 為多選拍攝項目新增清楚的「目標拍攝日／移動 N 個項目」批次入口；排程列群組拖到拍攝日頁籤也呼叫同一個 `model.moveEntriesToDay(entryIds, targetDayId)`。兩條路徑保留來源日順序並追加至目標日，固定時間欄位保持不變，作為單一可復原命令；點選拍攝日頁籤仍只切換日期，水平觸控捲動仍可用。失敗時保留原日與選取，保存失敗可由重試流程恢復。UI/手勢證據見 `tests/schedule-batch-cross-day-ui-browser-qa.cjs` 及 `docs/blocker-events.json` 的 `schedule_batch_cross_day_ui_scope_and_drop_cue_20261029`。

IME 防護會在排序手勢進入 `gestureSelection()` 之前檢查目前 Project 的 entry `fieldDrafts.composing` 與仍連接的 composing 欄位，避免選取另一列重繪 inspector、卸載正在組字的 textarea 後才檢查。組字中停用批次按鈕、不顯示跨日拖放 cue，並提示「請先完成目前的中文輸入，再拖曳或跨日移動拍攝項目。」組字草稿不寫入已保存 notes；compositionend 後，批次按鈕與觸控拖放可成功移動。隔離 Chromium QA 亦人為卸載欄位，確認 Project 內的 composing draft fallback 仍阻擋移動。驗證使用 synthetic CompositionEvent/InputEvent，不等同原生中文 IME。

`dist/styles.css` 修正排程列在 tablet 寬度的時間欄過窄與逐字折行：834px viewport 使用 180px 時間欄，`23:50–00:20 · 翌日 2026-11-04` 實測高 12.14px、line-height 12.15px，維持單行。390px 窄手機使用至少 92px 的時間 track，並保留自然換行，不逐字斷行。實際 app 隔離瀏覽器截圖：`tmp/schedule-batch-cross-day-ipad-portrait-full.png` 與 `tmp/schedule-batch-cross-day-ipad-portrait-controls.png`；前者已目視確認批次控制、選取與狀態文字仍可見，跨日時間列沒有逐字斷行。

測試與恢復證據：`node tests/schedule-batch-cross-day-ui-browser-qa.cjs` 的最後一次完整隔離 Chromium touch/IME QA 通過；機器可讀 IME 證據為 `tmp/schedule-batch-cross-day-touch-ime-browser-qa.json`。live composition 阻擋時原 textarea 保持同一 DOM identity 且 connected、選取／來源順序／拍攝日／revision 31／undo depth 27 不變，saved notes 仍空並顯示提示；detached-field 情境也未移動。compositionend 後批次移動使 event count 增一，觸控拖放再使其增一，草稿文字已保存；QA 無 page errors。最終 run 前曾有一次 test selector/fixture 失敗：切換頁籤後查詢了錯誤日期的列；修正為先切回 fixture 目標日後，完整 QA 通過。前兩次 guard 初版 run 的原始 stdout/stderr 未保留，根因與 Astra 唯讀診斷及症狀依 parent-agent report 記入 blocker ledger，不宣稱原始 log 可獨立複核。

以上是 generated blank Project、pinned desktop Chromium 的 834×1194 DPR 2 mobile-touch emulation 與 synthetic composition 測試，不是實際 iPadOS Safari／原生 IME 驗收。此輪 source 變更未部署或推送；公開 GitHub `main` 仍是 v46 commit `9bcc41731326ae834e5c3575a84464a3de79199d`，GitHub Pages 亦未部署。MVP、WP 與 G0–G8 release gates 均不因本輪證據升級，真 iPad 仍 `not_checked`。

## 15. v1.7 定案：連續分鏡與運鏡預設（2026-11-14）

本節覆寫舊版對單鏡單畫面、圖層與工具限制的衝突描述；既有資料不可因升級遺失。產品最高優先目標仍為：把「分鏡創作、拍攝安排、文件交付」的主要操作做清楚，讓每個畫面有明確的下一步。

### 15.1 同鏡多畫面

- 1-1A／1-1B／1-1C 表示同一主鏡的連續構圖／動作，不是 Take、A/B 機位或獨立切鏡。只存在一個主 Shot、主鏡次與現場拍攝安排。
- 首次由鏡頭卡片的「⋯ → 新增連續分鏡」展開 B 草稿。原畫面為 A；僅一張有效畫面時顯示 1-1，不單獨顯示 A。
- 輸入畫面描述、VO、SUPER，或完成照片裁切／手繪儲存後，子畫面才成立。成立後自動補下一張半透明佔位卡；空白佔位卡不保存、不計數、不輸出。中文組字中不可提前成立。
- 主鏡共用標題、鏡次、影片秒數、聲音設計與景別／運鏡；各畫面獨立保存畫面描述、VO、SUPER、單張照片、裁切與 Drawing。禁止將一個畫面的照片匯入誤作其他畫面的替換。
- 同鏡畫面依序以 A–Z、AA…標記；畫面可由空白處直接拖曳排序，不需長按，並保留上下移動控制；主鏡整組排序仍沿用既有操作。字母反映顯示次序，不作永久資產識別碼。
- 刪除／重排第一畫面時提升新的第一畫面，不改主鏡 ID、鎖定鏡次或排程引用；每筆操作可復原。刪掉剩餘子畫面後恢復單鏡顯示。
- 尾端草稿、未確認檔案候選不進 ZIP；已保存畫面、照片原圖與可編輯筆跡須隨 JSON／ZIP 保存、另存副本重新配置識別碼並保留關聯。

### 15.2 計數、安排與輸出

- 統計分開呈現「鏡頭數」與「分鏡張數」。例如主鏡1-1含A/B/C、主鏡1-2單張：2鏡、4張；影片秒數為兩個主鏡秒數之和。
- 拍攝安排／Rundown 仍只引用主鏡一次；拍攝分鐘與影片秒數分開。分鏡圖區可展開A/B/C，不產生額外拍攝時段。
- 分鏡輸出的每頁張數以實際畫面計算；每張可辨識1-1A/B/C，整鏡秒數僅於第一畫面顯示，頁首統計只加總主鏡。跨頁仍保留完整鏡號。
- 只輸出VO、全片台詞稿、複製與TXT匯出依畫面順序串接各畫面的原文，保留換行，跳過空白；不複製第一畫面的VO到B/C。
- 直／橫式A4都維持專案畫幅，不拉伸、不因末頁未滿放大。1:1、4:3、16:9、2.35:1遵守相同規則；紙張方向不改變分鏡畫幅。

### 15.3 運鏡預設庫

- 工具列用小型SVG圖示開啟縮圖預設庫，不常駐大段說明；名稱與圖示共同辨識，鍵盤及觸控可操作。
- 預設含ZOOM IN/OUT、DOLLY IN/OUT、PAN L/R、TILT UP/DOWN、TRUCK L/R、BOOM UP/DOWN、ARC L/R、FOLLOW、DOLLY ZOOM及A/B構圖框。Zoom與Dolly保留不同名稱，避免只靠箭頭造成歧義。
- 套用前可預覽位置／大小／方向；選取既有運鏡圖層後可再次調整整層筆跡。套用到獨立透明自訂圖層，以現有向量筆跡保存。使用者可隱藏、鎖定、重排或刪除該圖層；原照片及繪圖不被覆蓋。
- 預設依目前畫布尺寸配置，保留筆色與不透明度；不得只在編輯器疊SVG而在重新開啟、ZIP或文件輸出時消失。既有12圖層上限仍有效，達上限須明確提示。
- 支援套用前預覽與套用後整層調整；不承諾Photoshop等級的向量節點編輯、動畫或攝影機3D模擬。

### 15.4 本輪其他已核定修復

- 連續快速筆跡立即顯示並依序保存，不以等待上一筆保存阻擋下一筆；失敗保留候選可重試，避免重複提交。
- 圖層以縮圖／名稱／可見性／鎖定呈現，選取狀態清楚，操作次序與畫面堆疊一致。
- 全片旁白提供複製全文與UTF-8 TXT；清單與鏡頭細節各自捲動；多選提供明確勾選狀態及數量。
- 秒數支援桌面直接輸入與捲輪快捷選擇；空白表示未估0秒，無效值不覆蓋已保存資料。

### 15.5 驗收與發布門檻

| 案例 | 必須驗證 |
|---|---|
| SEQ-01 | A/B/C輸入成立、尾端空白不落盤、不輸出；一張時取消字母 |
| SEQ-02 | 影片8秒的1-1加入B/C後仍8秒；主鏡數1、圖數3、拍攝安排1筆 |
| SEQ-03 | 各畫面只一張照片、裁切與手繪隔離；重排／刪除／復原無遺失 |
| SEQ-04 | IndexedDB重開、JSON／ZIP及副本還原保留畫面與資產關聯；舊無子畫面專案仍可開啟 |
| SEQ-05 | VO原文依A/B/C順序，輸出每頁張數、直橫式比例、末頁尺寸一致 |
| CAM-01 | 預設新增獨立圖層，可見／鎖定／排序、保存重開與ZIP及輸出一致 |
| REL-01 | 本地必要測試、GitHub PR／main CI成功、同SHA的Cloudflare自動部署成功、正式站資產核對 |

開發順序：資料模型與相容性 → 圖層預設／連續畫面介面並行 → 輸出與VO整合 → 隔離瀏覽器回歸及截圖 → PR／main CI → Cloudflare與正式站核對。以上為依賴順序，不以估計時間代替驗收結果。

真實iPadOS Safari、Apple Pencil筆壓與原生列印／紙本另列待驗；隔離桌面測試不冒充實機驗收。
