# KINO Storyboard

KINO Storyboard 是分鏡創作、拍攝安排與文件交付工具。程式碼保存在 GitHub，網站使用 Cloudflare Workers Static Assets 提供靜態前端。此版本仍未完成產品驗收；不能視為已完成 MVP。

網站：[KINO Storyboard](https://kino-storyboard.film-kinostudio.workers.dev/)

## 部署與 Google Drive 規劃

靜態網站的部署設定位於 `wrangler.jsonc`，網站資產位於 `dist/`；目前以 Wrangler 手動部署，GitHub 推送尚不會自動發布。完整專案 ZIP 的 Google Drive 匯入／匯出尚未實作；操作與驗收規劃見 [Google Drive ZIP 規劃](docs/google-drive-zip-plan.md)。

## 本機資料與備份

專案資料保存在目前瀏覽器來源、使用者設定檔與裝置的 IndexedDB。本機保存不會自動同步到其他瀏覽器或建立異地備份；清除網站資料、更換設定檔或裝置前，請先匯出並另存完整專案 ZIP。

從 GitHub Pages 切換到 Cloudflare 時，兩個網址的 IndexedDB 相互獨立。請先在原網站匯出完整 ZIP，在新網站匯入並確認後再清理原網站資料。變更 GitHub 儲存庫名稱可能改變 GitHub Pages 路徑；同一 `kinostudio.github.io` 網域下可用的新路徑仍屬相同瀏覽器來源，實際可用性需待部署驗證。

完整 ZIP 用於備份與交接，包含可重新編輯的專案、Drawing 資料、必要原始資產與完整性雜湊；不包含裝置本機 undo/redo 歷史、寫入租約、未提交草稿或記憶體中的檔案候選。匯出 ZIP 後，建議先在另一個乾淨瀏覽器環境匯入確認，再移除原本的瀏覽器資料。

## 驗收狀態

此候選版尚未完成 PRD 的 P0、工作包及發布門檻驗收。真實 iPadOS Safari 與 Files 流程、Apple Pencil、最大封裝限制、原生 Edge 列印及紙本輸出仍待驗證。隔離桌面瀏覽器測試不代表這些項目已通過。

fflate 第三方套件的 MIT 授權見 `dist/vendor/fflate/LICENSE`。本候選版未指定專案程式碼授權。
