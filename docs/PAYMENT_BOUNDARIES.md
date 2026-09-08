# 金流與試用 — 邊界條件定義 v2

> 對應 `PAYMENT_SPEC.md` v2（公版統一收款）。用 loop 逐一實作 + unit test 驗證。
> v1（2026-06-10 私版收款版）的 A/C/F 大段已隨架構作廢；仍有效的邊界折進本文並標註出處。

---

## A. Launch gate 決策表（SPEC §3.2 的完整枚舉）

`decideLaunch(input)` 的輸入輸出全枚舉。**fail closed**：任何認不得的狀態一律 `unavailable`。

| # | apps.status | 方案達標¹ | trial 紀錄 | 邀請碼 | → 輸出 |
|---|---|---|---|---|---|
| A1 | active | 是 | （不看） | （不看） | `enter`（不建 trial） |
| A2 | active | 否 | 無 | （不看） | `create_trial_and_enter`（source='open'） |
| A3 | active | 否 | 有、未到期 | （不看） | `enter` |
| A4 | active | 否 | 有、已到期 | （不看） | `go_subscribe`（302 訂閱頁） |
| A5 | internal | （不看）² | 有、未到期 | （不看） | `enter` |
| A6 | internal | （不看） | 無 或 已到期 | 有效、限定此 App 或不限 | `create_trial_and_enter`（source='invite'）³ |
| A7 | internal | （不看） | 無 或 已到期 | 無 / 無效 / 限定他 App | `need_invite`（顯示輸入邀請碼） |
| A8 | draft / archived / 其他 | — | — | — | `unavailable` |
| A9 | （任何） | user 已軟刪除 / 查無 user | — | — | `unavailable`（沿用現行 deleted_at 檢查） |

¹ `meetsRequiredPlan(current_plan, required_plan)`，沿用 `lib/plans.ts`，fail closed。
² **封測期間已付費會員也不自動開放**（定案文件 §03）——internal 不看方案，只看邀請碼/trial。
³ trial 已到期又拿到新邀請碼：**不重開** trial（`UNIQUE(user_id,app_id)` 擋 insert）→ 落到 A7 拒絕並顯示「試用已用過」。要重開需後台人工刪 trial 紀錄。

`to=admin`（進 App 課程後台）沿用現行管理者驗證，**不走本決策表**；
管理者用一般入口點 App 時和普通會員一樣走 A1–A9（現行行為，不改）。

trial_days = 0（後台關閉試用）：A2 不建 trial、直接 `go_subscribe`（見 §B.1）。

## B. 時間邊界

### B.1 試用到期

```
expires_at = started_at + trial_days * INTERVAL '1 day'   -- 建立當下用 App 當時的 trial_days
判斷：NOW() < expires_at → 未到期；NOW() >= expires_at → 到期
```

- 判斷**只在 launch 時做**，沒有 expire cron；到期不動 `users.current_plan`。
- `trial_days` 後台改動**不追溯**既有 trial（expires_at 建立時定死）。
- trial_days = 0：建立即到期 → active 下等於「無試用、直接導訂閱」；後台允許設 0（關閉某 App 的免費試用）。

### B.2 status 切換的影響

| 切換 | 既有 trial | 行為 |
|---|---|---|
| internal → active | 保留、繼續倒數 | 受邀者無縫變成 open 試用者 |
| active → archived | 保留但進不去（A8） | 不刪資料 |
| active → internal | 保留、未到期者仍可進（A5） | open 期建立的 trial 不撤銷 |

## C. 併發 / Race

### C.1 同帳號連點兩下 App（同時建 trial）

兩個 request 同時走到 A2/A6 的 insert → `UNIQUE(user_id, app_id)` 其中一個撞 `23505`。
處理：撞到 unique 時**重讀該筆 trial 再判斷一次**（另一 request 剛建好、必定未到期）→ `enter`。不回錯誤給使用者。

### C.2 兌換邀請碼的原子性

「標記 `used_by/used_at`」與「建 trial」要同一交易（RPC 或單一 SQL function）。
半套（碼被標用了、trial 沒建成）= 使用者的碼作廢又進不去 —— 不可接受。
搶碼：`UPDATE invite_codes SET used_by=$u, used_at=NOW() WHERE code=$c AND used_by IS NULL RETURNING code`
拿不到 row = 已被用 → `need_invite`（碼已使用）。

### C.3 （沿用）webhook 雙回調 / 重複到達

現行 `callback/route.ts` 以 `payment.status==='paid'` 早退防重複 —— v1 §D.1/E.3 的 idempotency_key 方案**不在本輪範圍**（列 Phase 2 候選）。

## D. 邀請碼邊界

| 情境 | 行為 |
|---|---|
| 碼不存在 | `need_invite`（碼無效）— 訊息不區分「不存在」與「已使用」以防列舉 |
| 碼已使用（used_by 非 NULL） | 同上 |
| 碼限定 A app、在 B app 輸入 | 拒絕（`app_id` 不符）|
| 碼 `app_id IS NULL` | 任何 App 可用 |
| 大小寫 | 碼一律大寫儲存；輸入先 `trim().toUpperCase()` 再查 |
| 使用者已軟刪除 | launch 前段已擋（A9），兌換流程不用重複判斷 |
| 私版那 2 組「已使用」碼 | **動私版頁面前**先人工確認是否真實用戶（SPEC §3.5 前置） |

## E. 金額邊界（沿用 v1 仍有效者）

- `amount <= 0` 絕不呼叫紅陽 API（v1 §C.4）。試用全程不碰金流。
- 升級/降級/取消金額規則維持現行公版實作；階梯重試順延（SPEC §4）。

## F. 資料完整性

- `user_app_trials.invite_code` 只在 `source='invite'` 時有值；`source='open'` 時 NULL。（CHECK 或程式保證，migration 用 CHECK。）
- 私版一律不寫公版任何表；trial 相關資料私版**連讀都不需要**（gate 在公版做完才簽 SSO token）。
- migration 未跑、程式先上：`decideLaunch` 查詢新表/新欄位失敗 → log error + `unavailable`（fail closed，不 500）。

## G. esafe unit test 邊界（Loop 1）

### G.1 ChkValue（5 函式，`chkvalue.ts`）

- 已知輸入 → 已知輸出（用固定測試憑證算出 expected，鎖住公式）：
  - SHA1 類輸出 = 40 hex **全大寫**；SHA256 類 = 64 hex **全小寫**
  - 串接順序敏感：調換 password/MN 順序輸出必須不同
  - `term` 預設空字串；amount 數字直接字串串接（`100` ≠ `100.0`）
- `chkValueCallbackRaw` 與 `chkValueCallback`：MN 為整數字串時兩者相等；MN 帶小數原樣（如 `'100.00'`）時只有 Raw 對得上

### G.2 crypto round-trip（`crypto.ts`）

- encrypt → decrypt 還原：ASCII、**中文**、特殊字元（`+ / = & % 空格`）、巢狀物件
- decrypt 對 URL-encoded 輸入：空格還原成 `+`、`decodeURIComponent` 先行（模擬紅陽 form POST）
- 壞輸入：非 base64 / 錯誤 key 長度 → throw（測試斷言 rejects，不吞錯）

### G.3 憑證缺失行為（**鎖現狀，不是背書**）

`getSecretParam` 拿不到值回 `''`（不 throw）→ ChkValue 仍會算出一個「用空憑證」的雜湊。
測試鎖定此現行為＋註解標記 v1 §H.1「缺 env 要 throw」為待議改進（SPEC §4）。

### G.4 測試環境

- vitest；`ESAFE_*` 測試值走 `process.env`（`secret_params` DB 查詢在測試中自然 fallback——
  `SUPABASE_*` 不設即會走進 catch）。測試憑證用假值，**不用真實商店代號**。

## H. Loop 對照表

```
Loop 1: vitest + esafe tests             ← 先做，零風險
  ├ [1.1] vitest devDependency + config + npm run test
  ├ [1.2] chkvalue 5 函式 (§G.1)
  ├ [1.3] crypto round-trip + URL-encode (§G.2)
  ├ [1.4] 憑證缺失現行為 (§G.3)
  └ [1.5] binding.ts 表單參數完整性
Loop 2: Migration 025（寫檔，Jeff/Steve 跑）
  ├ [2.1] apps.status 加 'internal'＋RLS 改 active|internal
  ├ [2.2] apps.trial_days DEFAULT 14
  ├ [2.3] user_app_trials（UNIQUE、CHECK source、invite_code 條件）
  └ [2.4] 兌換原子性 SQL function (§C.2)
Loop 3: launch gate
  ├ [3.1] decideLaunch() 純函式 + A1–A9 全枚舉 tests
  ├ [3.2] route 改寫（含 §C.1 unique 撞回重讀、§F fail closed）
  └ [3.3] 「即將推出」與訂閱頁導向的前台顯示
Loop 4: 邀請碼兌換 + 後台
  ├ [4.1] 兌換 UI（internal App 點入時）+ API
  ├ [4.2] apps-manager：internal 選項 + trial_days 編輯
  └ [4.3] 公版首頁 internal App 顯示「即將推出」
Loop 5: 私版 invites 唯讀（前置：2 組已用碼查證）
```
