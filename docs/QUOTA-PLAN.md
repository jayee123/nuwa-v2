# AI 對話額度統一 —— 實作計畫（草案）

> 2026-09-25・狀態：**階段 1 已上線（09-25）**
> 依據：Jeff 拍板的三個決定（1A 存已用／2A 全平台一池／3A 免費方案補一列）
> 與 Steve〈給 Jeff — 2026-09-23〉§03。現況分析見 nuwa-docs `BILLING-QUOTA.md`。
>
> **2026-09-26 改寫決定 2A**：公版不再自己提供 AI（Steve 決定、Jeff 電話確認，
> `decision-remove-legacy-ai.md`）。「一池」現在只有**各 App** 在用，
> `source='nuwa'` 這個分項不會再有數字；跨來源競態只剩「兩支 App 同時扣」。
> 影子比對也只比 App 端。以下條文已依此修訂，畫線處為改動。

---

## 目標

一個使用者、一個週期、**一份**額度，所有 AI 入口共用：

```
本期 AI 對話   15 / 50   ・10/20 重置
  幸福關係       10
  （第二支 App）   5
```

- 存**已用**，上限在顯示與檢查時才讀方案（改方案上限不必回頭重算）
- 週期從**訂閱起算日**算，不是每月 1 號
- 「檢查 + 扣次」在資料庫裡**一步完成**（原子性），不再 read-then-write

## 現況（2026-09-25 查證）

| | 公版 | 私版 |
|---|---|---|
| AI 入口 | ~~`/api/chat`、`/api/unpack`~~ **09-26 已移除，公版無 AI** | 幸福關係 `/api/ai/chat` 等 |
| 存什麼 | **剩餘** `users.dialog_limit` | **已用** `happy.usage_quotas` |
| 何時重置 | 付款成功／續扣時灌回上限（≈ 訂閱起算日 ✅） | 寫死每月 1 號 ❌ |
| 有沒有擋 | ✅ 有 | ❌ `BILLING_ENFORCEMENT` 未設定 |
| 原子性 | ❌ 先查再扣，兩次呼叫 | ❌ read-modify-write，註明「可接受小 race」 |
| 碰到的地方 | **15 處**，含 `payment/callback`、`auto-charge`（金流主線） | `quotas.ts`、admin subscriptions |

已有可沿用的：私版每次呼叫都會回寫 `public.ai_token_usage`（帶 `app_id`）——跨 App 歸戶的帳本已經有一半，缺的是能擋人的計數器。

---

## 資料設計

### 1. `plans` 補 `free` 一列（決定 3A）

| code | name | price | monthly_dialog_count |
|---|---|---|---|
| `free` | 免費 | 0 | **與 basic 相同**（目前 50） |

另加 `is_system BOOLEAN`：`free` 為 true → 後台不可刪、訂閱頁不列出。

### 2. 新表 `public.ai_dialog_usage`（決定 1A + 2A）

```sql
user_id       UUID  NOT NULL
period_start  DATE  NOT NULL   -- 該使用者本期起算日
source        TEXT  NOT NULL   -- App slug（'happy'）；'nuwa' 已無人寫入（09-26 公版 AI 移除）
used          INT   NOT NULL DEFAULT 0
PRIMARY KEY (user_id, period_start, source)
```

用 `source` 而不是 `app_id`：以 slug 為 key，App 換 id 或搬 schema 都不用改帳。
總額度 = 同一 `(user_id, period_start)` 所有 source 的 `used` 加總；分項顯示就是逐列列出。

### 3. 週期起算日 `dialog_period_start(uid)`

- **錨點**：有效訂閱的 `subscriptions.starts_at`；沒有訂閱 → `users.created_at`（§4.4：免費以註冊日起算）
- **本期起點**：錨點「日」在當月或上月的最近一次，且 ≤ 現在
- **月底夾擠**：錨點是 31 號、當月只有 30 天 → 取當月最後一天

這是整個設計最容易錯的地方，SQL 版與 TS 版（顯示用）各寫一份，**TS 版先用單元測試釘死**
（1/31 → 2/28、閏年 2/29、跨年、錨點就是今天）。

### 4. 原子 RPC `consume_dialog(p_user, p_source)`

一個 SQL 函式、一個交易內完成：

1. 算 `period_start`
2. 讀使用者方案上限
3. 若本期加總 `< 上限` → `INSERT … ON CONFLICT DO UPDATE SET used = used + 1`
4. 回傳 `{ allowed, used, limit, resets_at }`

同時解掉兩個洞：**race**（兩個請求同時通過檢查）與**私版的 fail-open**
（呼叫端拿不到回應 → 一律視為不允許，並回明確錯誤，不再偷偷放行）。

---

## 分四階段上線

每階段都可以單獨部署、單獨回滾。**金流主線只在第 3 階段碰，而且只做「刪掉一個欄位的寫入」。**

### 階段 1：建表 + 影子雙寫（使用者無感）

- migration 030：`plans` 補 free、`ai_dialog_usage`、`dialog_period_start`、`consume_dialog`
- ~~公版 chat／unpack：舊邏輯照舊擋人，另外呼叫新計數器記一筆~~ **09-26 公版 AI 已移除，無此項**
- 私版 `recordUsage`：多記一筆到公版新表（`source='happy'`）
- 比對：私版 `happy.ai_usage_logs` 筆數 vs 新表 `source='happy'` 加總，**要有真實數字才算數**
  （封測流量太少，等 Steve 從公版點進幸福關係對話 3～5 次後跑 `scripts/_quota-shadow-compare.ts`）

### 階段 2：切換讀取（使用者開始看到新介面）

- ~~公版 chat／unpack 改用 `consume_dialog` 擋人~~ 無此項
- ✅ 09-29 私版 `checkQuotaAvailable` 改呼叫公版 `consume_dialog`（比對 3 = 3 通過後切換）：
  判斷邏輯抽成純函式 `quotaDecision.ts`（12 條測試）；開閘後 RPC 失敗**擋**、不再 fail-open；
  未綁定公版的人開閘後擋（沒有額度可查）；`recordUsage` 不再記次數，只記成本
- 顯示文案全面改（Steve 補充的那條）：
  - 「本月已用」→ **「本期已用 N / 上限・10/20 重置」**
  - ✅ 公版 profile、訂閱管理頁、方案頁三處已於 09-26 改讀新表（隨 AI 移除一起做）
  - 私版 billing 頁、`UsageChip` 兩處待階段 2
  - 公版定價頁「每月對話次數」**不改**（那是方案規格）

### 階段 3：停止寫舊欄位（碰金流主線）

- `payment/callback`、`auto-charge` 各刪掉 `dialog_limit: …` 那一行寫入
- `decrement_dialog_limit` 不再被呼叫
- `users.dialog_limit` 欄位**保留不刪**（不跑 destructive SQL），標記廢棄，之後另案處理

### 階段 4：打開閘門

- 私版正式站設 `BILLING_ENFORCEMENT=true`
- 上線當天看 `ai_dialog_usage` 與錯誤 log

---

## 使用者會感受到的變化（要 Jeff 確認）

| 誰 | 現在 | 之後 |
|---|---|---|
| 公版**免費**會員 | 公版 AI 用不了（`dialog_limit=0`） | 每期 50 次（=基本），但**只在門檻「不限」的 App 花得掉**（09-26：公版無 AI） |
| 幸福關係**試用**者 | 寫死 100 次 | 讀基本方案 = 50 次（§4.5） |
| 付費會員 | 公版、私版各一份額度 | **合併成一份**（各 App 共用） |
| 所有人 | 「本月」、每月 1 號 | 「本期」、各自的起算日 |

**切換當期的公平性**：階段 2 切換時，把每人當期已用初始化為 `上限 − 目前 dialog_limit`，
不讓已經用掉的人突然滿血、也不讓還沒用的人被多扣。

---

## 要 Jeff 回答的三題

1. **免費 = 基本 50 次，確認嗎？** 這代表每個註冊者每期最多約 NT$76 的持續成本、無收入。
   §4.7 說這是刻意的（差別在「能不能進 App」），但這是燒錢承諾，要你簽字。
2. **後台「手動調整次數」要保留嗎？** 現在客服可以直接改 `dialog_limit`。
   新模型下對應的是「本期補發 N 次」（負的 used 或另一欄 bonus）。建議保留，當客服補償工具。
3. ~~**公版自己的 chat／unpack 算進同一池嗎？**~~ 09-26 起公版沒有 AI，此題消失。

---

## 不在這次範圍

- `auto-charge` errcode 未檢查（等 Steve 金流規格書）
- `users.dialog_limit` 欄位實際刪除（之後另案）
- 超額加購（§4.6：不自動扣款、不自動加購）

## 測試

- `dialogPeriodStart` 純函式：月底夾擠、閏年、跨年、錨點當天 —— **先寫測試**
- `consume_dialog`：寫 migration 附驗證 SQL，Jeff 在 Supabase 跑（含「上限邊界」「兩筆同時」的交易內驗證，最後 ROLLBACK）
- 階段 1 的新舊比對腳本：只比 App 端（`happy.ai_usage_logs` vs `source='happy'`），對不上就停在階段 1
