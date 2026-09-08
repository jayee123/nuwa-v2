# 金流與試用串接規格 v2 — 公版統一收款

> **v2（2026-09-07）**：依 Steve〈金流與試用架構定案〉（2026-09-06，claude.ai artifact `1d345175`）全面改寫。
> v1（2026-06-10）是「私版單獨收款」的舊架構，寫在九月雙版整合之前，**已作廢**；
> 其中仍有效的部分（ChkValue 公式、AES 加解密、回調邊界）已折進本文與 `PAYMENT_BOUNDARIES.md`。
>
> 決策鏈：Jeff 2026-09-06 拍板「收款只在公版」→ Steve 定案文件（三條定案）→ 本規格 → loop 實作。

---

## 0. 三條定案（Steve 2026-09-06）

| 題目 | 決定 |
|---|---|
| 收錢 | **一律公版，私版不收錢**。私版是租戶，不是店面。 |
| 邀請碼 | **一律公版發放**；私版 `/admin/invites` 下架或改唯讀。兌換時機在公版「點 App 時」。 |
| 訂閱粒度 | **平台通行證**：`users.current_plan` 單一，一份訂閱通行所有已開放 App。試用是 **App 層級**：每支 App 各自 `trial_days` 天、免綁卡。 |

邊界原則：**錢、身分、權限判定全在公版**；私版只收已驗證的 SSO token。
私版不知道試用天數、不存方案價格 —— 任何在私版多存一份的資料都會像方案標籤那樣分岔。

---

## 1. 名詞與現況更正

- 金流商是**紅陽**（esafe.com.tw，SunPay）。Steve 定案文件邊界圖誤植「綠界」，以本規格為準。
- 憑證取用走 `getSecretParam()`（`lib/secret-params.ts`）：先讀 DB `secret_params` 表、
  拿不到 fallback `process.env`、再拿不到回**空字串**（不 throw，見 BOUNDARIES §G.3）。
- env 命名是 `ESAFE_*`（v1 spec 的 `HONGYANG_*` 命名作廢）：
  `ESAFE_MERCHANT_ID / ESAFE_PASSWORD / ESAFE_ENC_KEY / ESAFE_ENC_IV / ESAFE_BIND_URL / ESAFE_PASSCODE_URL / ESAFE_TRANS_URL`

---

## 2. 已存在、不需要動的東西（公版金流主線）

| 元件 | 檔案 | 內容 |
|---|---|---|
| ChkValue | `src/lib/esafe/chkvalue.ts` | 綁卡/回調 SHA1 大寫、Passcode/Payment SHA256 小寫，共 5 個函式 |
| AES 加解密 | `src/lib/esafe/crypto.ts` | AES-256-CBC，key/iv base64；decrypt 先 `decodeURIComponent` + 空格還原 `+` |
| 綁卡表單 | `src/lib/esafe/binding.ts` | Etopm.aspx 表單參數 |
| Token 扣款 | `src/lib/esafe/payment.ts` | Passcode → Token Payment 兩段式 |
| 發起付款 | `api/payment/initiate` | 建 payments row + 產表單 |
| 回調 | `api/payment/callback` | ChkValue 驗證、重複回調防護（`status==='paid'` 早退）、訂閱建立/展延 |
| 月扣 cron | `api/subscription/auto-charge` | 每月 1 號；`next_plan` 排程變更在此生效；plan_name 一律存代碼 |
| 到期提醒 | `api/subscription/notify-expiring` | 每日 07:00 |
| 降級 | `api/subscription/downgrade` | 下期生效 |

ChkValue 公式（V1 已驗證、現行程式即此實作，unit test 以此為準）：

| 用途 | 演算法 | 輸入串接 | 大小寫 |
|---|---|---|---|
| 綁卡表單 | SHA1 | `merchantId + password + MN + Term` | 大寫 |
| 回調驗證 | SHA1 | `merchantId + password + MN + Td` | 大寫 |
| Passcode | SHA256 | `merchantId + password + rawJSON` | 小寫 |
| Token Payment | SHA256 | `merchantId + password + price + term + rawJSON` | 小寫 |

---

## 3. 要新做的東西

### 3.1 Migration 025 — App 生命週期與試用（`supabase/migrations/025_app_trials.sql`）

**`apps.status` 沿用現有欄位、增加一個值**（現有：`draft | active | archived`）：

| status | 定案文件用語 | 公版首頁 | 已付費會員 | 一般使用者 |
|---|---|---|---|---|
| `draft` | （草稿，定案文件未提） | 不顯示 | — | — |
| `internal` | internal 內測/封測 | 顯示「即將推出」不可點（或可點進邀請碼頁） | **不自動開放** | 只有持該 App 邀請碼者進得去 |
| `active` | open 正式開放 | 正常顯示 | 自動可用 | 免碼直接試用 `trial_days` 天 |
| `archived` | （下架） | 不顯示 | — | — |

- RLS：`apps_public_read_active` 改為 `status IN ('active','internal')`（internal 要能顯示「即將推出」）。
- `apps.trial_days INTEGER NOT NULL DEFAULT 14` — 每支 App 各自設定，後台可改，不寫死在程式。

**新表 `public.user_app_trials`**：

```sql
CREATE TABLE user_app_trials (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id      UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  source      TEXT NOT NULL CHECK (source IN ('invite', 'open')),
  invite_code TEXT REFERENCES invite_codes(code),
  UNIQUE (user_id, app_id)          -- 一個帳號對一支 App 只有一筆，防重複刷
);
```

到期**不改** `users.current_plan`（全程可以是 `free`）；trial 過期後 launch gate 自然擋住。
**沒有 expire cron**：到期判斷只在 launch 時做（挽回提醒 email 屬未定項，見 §4）。

### 3.2 Launch gate 改寫 — 唯一要動的既有程式

`api/apps/[slug]/launch` 現在只看「方案達標」。改成定案文件圖 2：

```
點 App
 ├ status = internal ──┬ 有效邀請碼(限定此 App 或不限)？ ─是→ 建 trial(source='invite') → 進入
 │                     └ 否 → 擋下「即將推出」/ 引導輸入邀請碼
 ├ status = active  ──┬ 方案達標(meetsRequiredPlan)？ ─是→ 進入（不建 trial）
 │                    ├ 否 → 該 App 試用未到期？ ─是→ 進入
 │                    │      └ 無 trial 紀錄 → 就地建立(source='open', trial_days 天) → 進入
 │                    └ trial 已到期 → 302 導向訂閱頁
 └ 其他 status → app_unavailable
```

實作要求：判斷邏輯抽成**純函式** `decideLaunch()`（`src/lib/launch-gate.ts`），
輸入（status、方案、trial 紀錄、邀請碼驗證結果）→ 輸出（enter / create_trial_and_enter /
need_invite / coming_soon / go_subscribe / unavailable），unit test 直接打純函式。

### 3.3 邀請碼兌換搬家

- 舊：註冊時輸入。新：**註冊後、點 App 時**輸入（只有 internal App 需要）。
- 兌換 = `invite_codes` 標記 `used_by/used_at` + 建 `user_app_trials(source='invite')`，同一交易內完成。
- `app_id` 限定已存在（migration 019）：碼限定 A app 就不能開 B app；`app_id IS NULL` = 不限。

### 3.4 公版後台「App 管理」

`apps-manager.tsx` 補：status 選單加 `internal`、新增 `trial_days` 欄位編輯。

### 3.5 私版 `/admin/invites` 唯讀

前置：先人工確認私版那 2 組「已使用」的碼背後是否真實用戶（Jeff/Steve）。
之後私版頁面改唯讀（保留查看、拿掉發碼），入口文案指向公版後台。

### 3.6 esafe unit tests（最先做，零風險）

v2 目前**零測試**。加 `vitest`（devDependency）＋ `npm run test`。
測試範圍見 `PAYMENT_BOUNDARIES.md` §G 與 §H Loop 1。

---

## 4. 順延與未定（不擋開工，規格書要追蹤）

| 項目 | 狀態 | 備註 |
|---|---|---|
| 失敗扣款階梯重試（+24/48/72hr、3 次降級） | **順延** | 免綁卡試用 → 「到期自動扣款」不存在；觸發點只剩付費續訂失敗，等 Steve 金流規格書 |
| 收據 / 扣款失敗 / 到期挽回 email | **未定** | 連動「挽回動線」（站內提示 vs email）決定 |
| 點數 vs 每月對話次數語意 | **未定** | 公版顯示「點數 136」、私版顯示「1 / 50」，要統一 |
| 防重複刷試用（一人多 email） | **未定** | 目前僅 email 唯一 + `UNIQUE(user_id, app_id)`；手機/裝置層防護待議 |
| 私版 PlanTier `trial` 值域退場 | **順延** | 舊架構殘留，這輪不動 |
| `getSecretParam` 缺憑證回空字串不 throw | **待議** | 見 BOUNDARIES §G.3，牽動全站，先鎖現行為 |

---

## 5. 實作順序（loop）

| Loop | 內容 | 產出 | 風險 |
|---|---|---|---|
| 1 | vitest 環境 + esafe unit tests | `vitest.config.ts`、`src/lib/esafe/__tests__/` | 零（純加測試） |
| 2 | Migration 025 | migration 檔（**Jeff/Steve 在 Supabase 跑**） | 零（AI 不碰 DB） |
| 3 | `decideLaunch()` 純函式 + tests + launch route 改寫 | `lib/launch-gate.ts` + route | 中（動既有 gate，migration 先跑才部署） |
| 4 | 邀請碼兌換流程 + 後台 App 管理 UI | 兌換頁/API + apps-manager 欄位 | 低 |
| 5 | 私版 invites 唯讀 | nexthappy 改動 | 低（先驗證 2 組已用碼） |

部署順序鐵律：**Loop 2 的 migration 先在 Supabase 跑完，Loop 3/4 的程式才能部署**
（`decideLaunch` 查不到新欄位/新表時要 fail closed 回 `unavailable`，不能 500）。
