# Google Drive 完整 ZIP 手動匯入／匯出規劃

狀態：規劃稿（尚未實作或驗收）  
日期：2026-10-31

## 目標與界線

讓使用者在一次明確操作中，把一個完整專案 ZIP 從 Google Drive 匯入目前裝置，或把目前專案 ZIP 上傳到 Google Drive。每次操作都由使用者開始、選擇檔案或目的資料夾，並收到完成或失敗結果。

此功能是手動備份與還原，不是同步：不背景讀取 Drive、不自動上傳、不監聽遠端變更、不在裝置間合併資料、不持續保存 Drive access token。Google Drive 和瀏覽器 IndexedDB 仍是兩個分開的保存位置。

原有「下載完整專案 ZIP」與「匯入完整專案 ZIP」保留為無 OAuth 的本機檔案流程；Drive 操作作為額外入口。若 OAuth、Picker 或網路不可用，使用者仍可透過瀏覽器／iPad Files 手動選取或下載 ZIP。

## 現有 ZIP 流程

候選版目前已具備可直接銜接的封裝流程：

- `dist/app.js` 的匯出會呼叫 `model.exportCompletePackage()`，建立 ZIP Blob 並交給瀏覽器下載；匯入使用原生檔案選擇器，再以既有完整預覽和確認流程匯入。
- `dist/model.js` 在匯出前確認保存佇列、未提交欄位、照片候選、目前專案編輯權及固定 revision；封裝後會核對回讀的 canonical Project。
- 匯入預覽會檢查 ZIP、路徑安全、CRC、Manifest entry 清單、byteLength、SHA-256、Project schema、Asset／Drawing／Shot 引用，以及原始照片的 MIME、hash 和解碼尺寸。只有使用者確認後才以本機交易寫入。
- 還原保留封包的 Project ID；若本機已存在該 ID，拒絕覆寫。另存副本會產生新 ID。匯入只新增本機專案，不切換目前工作專案。
- 封包包含可編輯專案、必要原始 Asset 和 Drawing；不包含本機 undo／redo 歷史、lease、未提交草稿或記憶體中的檔案候選。
- 目前封裝限制為 ZIP 516 MiB、未壓縮 500 MiB、最多 10,002 個 entries、單張圖片 20 MiB。程式碼將限制標記為 provisional precheck；README 也明示最大封裝與真實 iPadOS Safari／Files 流程仍未驗收。不能把這些數值當成已通過的 iPad 容量保證。

Drive 整合應把 Drive 回傳的原始 ZIP bytes 送進這個既有預覽／匯入流程；不要新增第二種專案封裝格式或略過既有驗證。

## 建議 UX

在「專案工具」加入兩個明確動作：

- **從 Google Drive 匯入 ZIP**：顯示說明後要求 Google 授權，開啟 Picker 選一個 ZIP，下載 bytes，接續現有封包驗證預覽。驗證完成前不寫入資料；使用者仍須選擇「確認還原」或「另存副本」。
- **匯出 ZIP 至 Google Drive**：先依目前已保存 revision 建立並完成本機封裝驗證，再讓使用者選擇 Drive 目的資料夾，最後上傳一個新檔案。完成後顯示檔名、資料夾、大小和上傳狀態，並提供開啟 Drive 檔案的連結。

按鈕附近說明：「只在你按下此動作並選取檔案／資料夾後，才會傳輸該 ZIP；不會自動同步。」第一次授權前，另清楚說明要求的 Google 權限和傳輸內容。未登入 Google 或取消授權時，Drive 動作停在未授權狀態，現有本機匯入／下載仍可用。

匯入時用 Picker 的 `DocsView` 選取單一檔案，提供 ZIP MIME 篩選以方便瀏覽；篩選只是 UX，不能取代副檔名、大小、ZIP 結構和 Manifest 驗證。`drive.file` 權限下依官方建議採清單檢視，避免依賴未授權的縮圖。Picker 支援 MIME filter 和檔案選取；[官方 Picker 指南](https://developers.google.com/workspace/drive/picker/guides/web-picker) 說明 Picker 用法及其檔案檢視限制。

匯出時在 Picker 以 `DocsView.setSelectFolderEnabled(true)` 讓使用者指定目的資料夾，再由 Drive API 在該資料夾建立新 ZIP。建議命名為 `{專案名稱}_{日期時間}_r{revision}.storyboard.zip`；一律建立新檔，不覆蓋既有檔案。若網路中斷後結果不確定，先查詢 resumable session 狀態，避免盲目重送造成重複檔案。Picker 可選資料夾，但不能代替 Drive API 執行移動或複製；[DocsView 官方參考](https://developers.google.com/workspace/drive/picker/reference/picker.docsview)。

## OAuth、API 與 Cloud Console 設定

### OAuth scope

只請求：

```text
https://www.googleapis.com/auth/drive.file
```

Google 將 `drive.file` 列為非敏感 scope，可建立檔案，並管理使用者透過 Google Picker 開啟／分享給應用的檔案；官方建議用它配合 Picker 取得逐檔授權。不要請求可讀取或管理整個 Drive 的 `drive.readonly`、`drive`，也不需要 `drive.metadata.readonly` 來列舉檔案。[Google Drive scope 說明](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)。

採 Google Identity Services Web token model，只在使用者按下匯入或匯出時要求 access token。Token 留在記憶體，只供該次 Picker／Drive API 請求使用；不要求 offline access、不保存 refresh token、不寫入 localStorage、IndexedDB、URL 或 log。Access token 過期時，保留可恢復的匯入／上傳狀態，提示使用者重新授權，再從 Drive resumable upload session 查詢已接收位置後續傳。GIS token model 支援由使用者手勢觸發授權，並以 token 呼叫 REST API。[GIS token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)。

### Google Cloud 設定清單

1. 建立或選定一個 Google Cloud project，啟用 **Google Drive API** 和 **Google Picker API**（[Google API 啟用說明](https://developers.google.com/workspace/guides/enable-apis)）。
2. 建立 Web application OAuth client；將正式 Cloudflare 網站的 HTTPS **origin** 加入 Authorized JavaScript origins，必要時另加入仍保留的 GitHub Pages origin。Origin 只含 scheme、hostname、必要的 port，不含 repo path；另加開發時實際使用的 localhost origins，不使用 wildcard。
3. 設定 OAuth consent branding、支援信箱、首頁、隱私政策（若對外發布則使用公開、可存取的 URL），以及使用者類型／測試者。Data Access 只登記 `drive.file`；正式發布前依目前 Google verification 狀態完成所需審查。OAuth client ID 可放在前端；Web client secret 不可放進靜態網站。
4. 建立 Google Picker Browser API key。若使用網站 referrer 限制，加入正式網站 origin pattern 和 `https://docs.google.com/*`；API restriction 限定 Google Picker API，並在 app 直接呼叫 Drive API 時一併允許 Google Drive API。
5. Picker 使用 Cloud project number 作為 App ID，配合 API key 和 OAuth access token。OAuth client ID、project number、API key 分別來自 Cloud Console，不互相替代。[Picker 憑證設定](https://developers.google.com/workspace/drive/picker/guides/web-picker)、[Google OAuth Web client 設定](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid)。

### API 流程

- **Drive 匯入：** 使用 Picker 回傳的 file ID 與使用者授予的 access token 呼叫 `files.get` 的 `alt=media` 下載二進位 ZIP；不要以 `files.list` 搜尋整個 Drive。比對 Picker／`files.get` metadata 的名稱、MIME、大小（可取得時）與實際讀取 bytes，再呼叫現有 `previewCompletePackage()`。Google Drive 對 blob 檔案以 `files.get?alt=media` 下載，並提供下載能力資訊供 app 檢查。[官方下載指南](https://developers.google.com/workspace/drive/api/guides/manage-downloads)。
- **Drive 匯出：** 呼叫現有 `exportCompletePackage()` 取得 ZIP bytes，使用 Drive API `files.create`，metadata 設定 `name`、`mimeType: application/zip` 和使用者選取的 `parents` folder ID。大於 5 MB 時使用 resumable upload；Google 將此方式推薦給大型檔案及容易中斷的行動網路。傳輸中顯示進度；遭遇中斷或 5xx 時先查詢 session 已接收的 byte range 再續傳；session 過期就由使用者明確選擇重試。[Drive 上傳指南](https://developers.google.com/workspace/drive/api/guides/manage-uploads)、[`files.create` API](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/create)。

## 檔案完整性與安全

1. **建立封包：** 保持目前「固定 revision＋完整原始 Asset＋本機回讀驗證」的 export contract。Drive 上傳不能在生成中讀取變動中的 Project，也不能略過目前的編輯權和待保存狀態檢查。
2. **傳輸完成：** resumable session 收到成功終態後，以 Drive 回傳的 file ID、檔名、MIME、size 確認所建立的是新 ZIP 且 bytes 數符合原始 `archiveBytes.byteLength`。若 Drive metadata 回傳 `sha256Checksum`，需新增在 Worker 計算整個 ZIP SHA-256 的能力並與之比對；目前 Manifest 只驗證 ZIP entries，沒有整份 archive 的 digest。需在 Phase 0 量測此檢查對大型封包的記憶體影響。若 Drive 未提供 checksum，就把狀態標為「上傳完成，尚未從 Drive 回讀驗證」，不要把 size 相同說成密碼學完整性已驗證。Drive File resource 把 SHA-256 checksum 定義為 binary content 可用的輸出欄位。[Drive File resource](https://developers.google.com/workspace/drive/api/reference/rest/v3/files)。
3. **匯入驗證：** 對下載 bytes 執行與本機 ZIP 完全相同的 CRC、路徑、Manifest、entry set、byteLength、SHA-256、schema、引用和照片解碼檢查；任何一項不合即拒絕寫入。Drive MIME 或副檔名不是信任依據。
4. **失敗不破壞資料：** OAuth 取消、Picker 取消、下載失敗、格式錯誤、超過限制、hash 不符或上傳失敗都不得部分新增／覆蓋本機專案。上傳若在遠端成功但本機未收到回應，要查詢 session／已建立 file ID，再決定顯示結果，不能直接宣告失敗後盲重送。
5. **權限與隱私：** 不使用伺服器中繼專案 bytes，不讀取 Drive 其他檔案，不在背景列舉、輪詢或同步，不記錄 OAuth token、Project JSON、照片或 Drawing bytes。成功後只短暫保存本次操作所需的 file ID／folder ID；操作結束或取消即清除 token 和暫存。Google Drive metadata 可回傳檔案 MD5／SHA-256 checksum，但 checksum 欄位可能不適用或未提供，需按上一項誠實呈現狀態。

## 失敗、取消與恢復情境

- **OAuth／設定：** 使用者拒絕或關閉帳號選擇器、token 過期、scope 未授予、origin mismatch、OAuth consent 尚在測試／未完成審查、API 或 API key 未啟用。保留無 OAuth 的本機檔案入口並提供具體錯誤和設定提示；拒絕 scope 後，只有使用者再次點擊 Drive 動作時才重試授權。
- **Picker／權限：** 使用者取消、選到資料夾而非 ZIP、檔案遭下載限制、沒有讀取權或檔案不存在。不得寫入本機；回到選檔步驟。
- **匯入／完整性：** MIME 不是 ZIP、ZIP 檔名不合、實際 size 與 metadata 不符、超過 516 MiB、ZIP 結構／CRC／Manifest/hash/schema/asset 不符、原圖解碼失敗、同 Project ID 已存在或本機資料庫唯讀。顯示錯誤碼和可重試動作，保留目前工作專案。
- **匯出／網路：** 本機 revision 變更、lease 遺失、尚有草稿、無法建立 ZIP、使用者取消 folder picker、上傳 token 過期、網路中斷、Drive 403 quota／空間限制、429／5xx、session 失效。可續傳則續傳；session 失效須建立新 session 並告知可能產生重複檔案；除非能確認原上傳不存在，否則不自動重新建立。
- **隱私操作：** 提供「取消本次操作」；下載可 abort；上傳可停止後保留「遠端結果待確認」狀態。不要在清理未確認 session 前聲稱遠端檔案已刪除。

## 分階段工作

### Phase 0：收斂設定與容量邊界

- 確認正式 Cloudflare 網站 origin、Cloud project、app 名稱、支援信箱、隱私政策 URL 和公開／Workspace 使用者範圍。
- 明確決定第一次 release 是否提供 Picker 匯入和直接 Drive 上傳；保留現有本機 ZIP 操作作為 fallback。
- 量測產生、讀取、解析 20 MiB、100 MiB 和接近目前上限的封包所需時間與峰值記憶體；目前 516 MiB 和 20 MiB 限制仍屬待驗收，不可直接承諾 iPad 支援。

### Phase 1：Google Cloud 與 OAuth 骨架

- 完成 Drive API、Picker API、OAuth Web client、origin、同意畫面、唯一 `drive.file` scope 和 referrer 限制 API key。
- 加入按需 GIS token 管理、記憶體內 token 壽命管理、錯誤與取消狀態；此階段不做背景 token 刷新或登入持久化。
- 保持新功能在設定缺漏時隱藏或停用，原有 ZIP 匯入／下載可繼續使用。

### Phase 2：Google Drive 匯入

- Picker 單檔選取、metadata／大小預檢、可取消的下載進度。
- 接入現有封包預覽、restore/copy 選擇與確認；Drive bytes 不直接寫 IndexedDB。
- 驗收取消、錯檔、超限、hash 不符、Project ID 衝突與重新授權流程。

### Phase 3：Google Drive 匯出

- 固定 revision 產 ZIP、選目的資料夾、建立唯一新檔、resumable upload 和進度 UI。
- 實作斷線查詢／續傳、token 過期續傳、模糊終態恢復，以及 size/checksum 狀態。
- 驗收同名專案重複備份不覆蓋既有檔；遠端結果未知時不盲目建立第二份。

### Phase 4：iPadOS Safari、隱私與發布驗收

- 真實 iPadOS Safari 和 Files 流程測 OAuth popup／帳號選擇、Picker、Drive 下載／上傳、重新授權、背景切換、檔案 app 交接、取消與返回 app。
- 測照片與 Drawing 均存在的專案；至少包含小檔、常用大小、100 MiB 和候選上限附近封包。記錄生成／讀取時間、峰值記憶體、是否 Safari reload、能否中斷續傳。若最大限制失敗，調降正式上限並同步更新 UI／README，不以桌面瀏覽器結果代替 iPad 驗收。
- 驗收 VoiceOver、鍵盤焦點、對比／狀態提示、進度和錯誤可讀性；確認 token／Project bytes 未進 log、URL、localStorage、IndexedDB 或其他伺服器。
- 先以 OAuth test users 做端到端測試，正式開放前確認 consent screen、Google app verification 和隱私政策狀態。完成前不得標成已發布或已支援 iPad。

## 驗收清單

- [ ] 未授權時，現有本機 ZIP 下載／匯入仍可用。
- [ ] 使用者只在點擊 Drive 匯入／匯出時看到 Google 授權；只請求 `drive.file`。
- [ ] 匯入 Drive ZIP 會先完整預覽驗證，使用者確認前本機專案數量和目前專案不變。
- [ ] 還原 ID 衝突拒絕覆寫；另存副本保留所有內部引用並使用新 ID；成功不切換目前專案。
- [ ] 匯出使用當下已保存固定 revision；本機原始照片和 Drawing 都完整在 ZIP；建立新 Drive 檔而不修改既有檔。
- [ ] 上傳中斷可恢復，遠端結果模糊時不盲重送；成功狀態只宣稱實際有證據支持的完整性等級。
- [ ] 損壞／截斷／竄改／超限 ZIP 均不寫入本機；未授權、取消、403、429、5xx、token 過期、Picker 不可用時有明確復原路徑。
- [ ] 真實 iPadOS Safari 與 Files 完成上述流程；大封包峰值記憶體和最大可用上限有記錄。未完成項目標 `not_checked`。
- [ ] 檢查 OAuth/token、照片／Drawing／Project metadata 日誌與持久化位置，不存在意外留存。

本文件只整理架構與驗收計畫；沒有修改 Drive/OAuth 產品程式碼，也沒有宣稱 Google Cloud 設定、iPad、上傳或匯入已通過驗收。
