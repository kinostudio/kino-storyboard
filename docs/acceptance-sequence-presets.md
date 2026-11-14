# 連續分鏡與運鏡預設驗收（2026-11-14）

本機隔離 Edge／Chromium 驗收，測試專案與 IndexedDB 均為一次性資料，不操作使用者正式專案或 Google 帳號。發布仍須通過 `.github/workflows/ci.yml`，Cloudflare 只部署同 SHA 已通過 push CI 的 main。

| 項目 | 結果與證據 |
|---|---|
| 連續畫面建立 | 通過 `sequence-ui-browser-qa.cjs`：文字先行、尾端空白不成立、照片／空白手繪取消不建立子畫面；首次筆跡與 Drawing 同筆提交 |
| 共用主鏡 | 通過 `continuous-frames-browser-qa.cjs`：主鏡、排程與秒數不增加；A 提升、重排、刪除、復原保留識別與所有權 |
| 照片與背景隔離 | 每畫面一張新照片；裁切保存、替換、B 的 Drawing 只接受 B 引用的背景圖。歷史多照片資料仍可讀取與替換收斂 |
| 保存／備份 | IndexedDB 重開、舊 ZIP 匯入、含子畫面的完整 ZIP 副本還原與 nested IDs remap 通過；Drawing、照片與裁切關聯保留 |
| 分鏡輸出 | `sequence-output-browser-qa.cjs` 通過 4 畫幅 × 2 紙張方向 × 3 密度（2/3/4 張）共 24 組；2 主鏡／4 張／13 秒，秒數僅於第一畫面顯示；Rundown 2 筆、分鏡 4 張 |
| 末頁與邊界 | 所有畫面比例、頁內邊界、同版型畫面尺寸均有斷言；不足頁不放大。已檢視橫直式首／末頁 PNG |
| VO | 全片、純 VO 輸出依 A/B/C 順序各讀取一次；複製／UTF-8 TXT 保留換行 |
| 運鏡圖層 | `camera-presets-browser-qa.cjs` 通過 17 預設、4 畫幅座標界限、向量標籤、所選筆色／不透明度、原子建立與復原、圖層狀態／排序、重開、ZIP、副本及再次調整 |
| 快速手繪與操作 | `drawing-rapid-browser-qa.cjs`、`storyboard-efficiency-browser-qa.cjs` 通過快速連續落筆、失敗重試、秒數捲輪、VO、可見多選及獨立捲動 |
| 裁切預檢 | `photo-crop-header-browser-qa.cjs` 確認超限像素／檔案與無效標頭不會觸發圖片解碼；既有裁切／佔位符測試亦通過 |

重現：Node.js 22、`npm ci`、`npx playwright install chromium`、`npm test`、`npm run test:browser`。特殊環境可指定 `PLAYWRIGHT_EXECUTABLE_PATH`；CI 使用鎖版 Playwright 容器。靜態依賴另執行 `node tools/check-static-dependencies.cjs --tracked`。

截圖由測試重建於 `tmp/sequence-ui-qa.png`、`tmp/camera-presets-qa/`、`tmp/sequence-qa/`。紙張元素截圖暫時解除預覽捲動容器裁切，只影響測試擷取，不改產品版面；幾何斷言仍驗證原預覽 DOM。

未驗收：真實 iPadOS Safari／Apple Pencil、原生印表機與紙本。本次 ZIP 驗收為本地完整封裝往返，不代表重新執行真實 Google Drive 帳號驗收。
