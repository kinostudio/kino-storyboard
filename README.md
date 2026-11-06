# KINO Storyboard

KINO Storyboard 是分鏡創作、拍攝安排與文件交付工具。程式碼保存在 GitHub，網站使用 Cloudflare Workers Static Assets 提供靜態前端。此版本仍未完成產品驗收；不能視為已完成 MVP。

網站：[KINO Storyboard](https://kino-storyboard.film-kinostudio.workers.dev/)

## 部署與 Google Drive 規劃

靜態網站的部署設定位於 `wrangler.jsonc`，網站資產位於 `dist/`；Cloudflare Workers Builds 連接 GitHub 的 `main` 分支，推送後執行 `npx wrangler deploy` 自動部署。Google Drive ZIP 匯入／匯出正在驗證；操作與驗收規劃見 [Google Drive ZIP 規劃](docs/google-drive-zip-plan.md)。

## 本機資料與備份

專案資料保存在目前瀏覽器來源、使用者設定檔與裝置的 IndexedDB。本機保存不會自動同步到其他瀏覽器或建立異地備份；清除網站資料、更換設定檔或裝置前，請先匯出並另存完整專案 ZIP。

從 GitHub Pages 切換到 Cloudflare 時，兩個網址的 IndexedDB 相互獨立。GitHub 儲存庫更名後，先前的 GitHub Pages 網址已失效；可在儲存資料的原裝置與瀏覽器開啟 [GitHub Pages 遷移入口](https://kinostudio.github.io/kino-storyboard/)，匯出完整 ZIP，再到 Cloudflare 網站匯入並確認。GitHub Pages 新舊路徑都屬 `kinostudio.github.io` 來源，不會因路徑更動而變成新的 IndexedDB。確認匯入成功前，請勿清理舊網站資料。

完整 ZIP 用於備份與交接，包含可重新編輯的專案、Drawing 資料、必要原始資產與完整性雜湊；不包含裝置本機 undo/redo 歷史、寫入租約、未提交草稿或記憶體中的檔案候選。匯出 ZIP 後，建議先在另一個乾淨瀏覽器環境匯入確認，再移除原本的瀏覽器資料。

## 驗收狀態

此候選版尚未完成 PRD 的 P0、工作包及發布門檻驗收。真實 iPadOS Safari 與 Files 流程、Apple Pencil、最大封裝限制、原生 Edge 列印及紙本輸出仍待驗證。隔離桌面瀏覽器測試不代表這些項目已通過。

fflate 第三方套件的 MIT 授權見 `dist/vendor/fflate/LICENSE`。本候選版未指定專案程式碼授權。

## 可重現檢查

使用 Node.js 22：`npm ci`、`npx playwright install chromium`、`npm test`、`npm run test:browser`。Playwright 與相依套件鎖定於 package-lock.json；瀏覽器由 Playwright 選擇，特殊環境可設定 PLAYWRIGHT_EXECUTABLE_PATH。測試使用隔離 IndexedDB 與合成照片，不存取正式專案或 Google 帳號。

PR 與 main push 會執行 `.github/workflows/ci.yml`。Cloudflare Workers Builds 部署命令為 `node tools/deploy-after-ci.cjs`：核對 checkout 與 WORKERS_CI_COMMIT_SHA，再等待該 commit 的 push CI 成功，才執行鎖版 Wrangler 部署。失敗、取消、查詢錯誤或 15 分鐘逾時均停止發布。

圖片匯入在解碼前檢查 JPEG／PNG／WebP 標頭，預設上限為 20 MiB、單邊 8192 像素、總像素 32 × 1024 × 1024；同時只處理一張。動態 PNG／WebP 不接受，須先轉為靜態圖片。這些限制降低解碼記憶體負擔，不能保證所有裝置均不會耗盡記憶體。

分鏡照片預覽使用最長邊 960px JPEG 縮圖，最多保留 24 張記憶體快取與 64 張可重建的 Cache Storage 快取；缺圖時逐張驗證原圖再產生縮圖。原圖與 ZIP 格式不變。清除網站資料也會移除縮圖。

靜態資產透過 dist/_headers 加入 nosniff、DENY、Referrer-Policy 與停用未使用的 camera、microphone、geolocation 權限。HSTS 先以單一主機 1 日期限觀察，不含 includeSubDomains 或 preload。CSP 維持 Report-Only，不阻擋 Google 授權；完成違規檢視及整合驗證前不切換為強制政策，目前尚無遠端回報端點。

分鏡畫面每個 Project revision 建立一次場次／鏡頭索引；搜尋計數、場次分組、鏡次與旁白畫面共用索引，避免對每個場次重複掃描整份鏡頭清單。
