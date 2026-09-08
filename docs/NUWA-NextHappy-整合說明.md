# 羽升幸福養成學苑 — NUWA × NextHappy 技術白皮書

> **分析對象**：`jayee123/nuwa-v2`（公版 / NUWA Market）與 `jayee123/nexthappy-v2`（私版 / 幸福關係 App）
> **分析方式**：兩個 repo clone 後直接讀原始碼（route handler、middleware、SQL migration、`src/lib/*`、`docs/`、`public/roadmap/`）。**未**啟動兩站做 live 整合測試（缺 env / 金鑰 / DB）。流程與欄位以程式碼與 migration 為準；Roadmap 段落以 repo 內提案文件為準。
> **視覺版**：見同名 HTML Artifact（含架構圖、SSO 流程、兩個 schema 的 ERD、資料流圖、Roadmap 時間軸）。
> **產出**：2026-09-08（v2）

## 三種讀法

| 你是 | 想知道 | 讀 |
|---|---|---|
| 客戶 / 業務 | 這是什麼、使用者體驗、怎麼收費 | Part Ⅰ 產品視角 |
| 營運 / PM | 四個介面怎麼分工、三種工作流程、誰能改什麼 | Part Ⅱ 系統視角 |
| 工程師 | SSO 細節、ERD、資料流、部署與坑 | Part Ⅲ 技術視角 |
| 決策者 / 產品 | 還沒動工的規劃 | Part Ⅳ Roadmap |

---

# Part Ⅰ — 產品視角

## 1.1 一頁看懂

| 項目 | 內容 |
|---|---|
| 產品名 | 羽升幸福養成學苑 |
| 定位 | 21 天 AI 陪伴的高情商溝通（NVC）養成課程，給卡在伴侶 / 親子 / 職場關係的人 |
| 對象 | 25–45 歲、有溝通困擾、願意自我成長、看重「心法 > 話術」 |
| AI 教練 | 「小羽老師」，對話核心 **LEAD（引導）→ PROBE（探問）→ HOOK（鉤引）** 三段式 |
| 技術護城河 | 三層記憶架構——小羽記得整整 21 天，但 token 不隨天數膨脹（Day 3 與 Day 21 用量幾乎一樣） |
| 商業模式 | 訂閱制（trial / basic / advanced / premium）＋ 邀請碼制入門 |
| 金流 | 紅陽 esafe（綁卡 + Token Payment），卡號永不入庫（PCI-DSS） |

**為什麼是兩套系統、一個產品**：NUWA 這一層做「帳號、付費、把多支 App 收在一起的商城」，未來可掛第 2、第 3 支 App（不同老師、不同主題）。NextHappy 是第一支 App，只專心把「幸福關係」這門課教好。使用者只在 NUWA 登入一次，進 App 不用再登入。

## 1.2 使用者會碰到的四個介面

| 介面 | 屬於 | 使用者在這裡做什麼 |
|---|---|---|
| ① 登入 / 會員中心 | NUWA | 用邀請碼註冊、手機或 Email 登入、看自己的資料、**訂閱付費 / 升級方案**、從「App 服務」進入課程 App |
| ③ 課程介面 | NextHappy | 看導覽 → 填 MBTI 做 onboarding → **每天跟小羽老師對話** → 看進度 / 積分 / 徽章 |
| ② 平台後台 | NUWA | （內部）管會員、方案定價、金流對帳、跨 App 用量、上架 / 設定每一支 App |
| ④ 課程後台 | NextHappy | （內部）編 21 天課程內容、看學員對話與進度、調 AI prompt、發邀請碼 |

①③ 是使用者端，②④ 是內部人員端。**②和④是兩套完全獨立的後台、兩套獨立的權限**——平台管理員不等於課程管理員。

## 1.3 使用者旅程

```
邀請碼 → NUWA 註冊/登入 → 進入 App(SSO，不用再登入) → Onboarding(MBTI/對象/目標)
      → Week 1 · Day 1–7  對外覺察：看見他人
      → Week 2 · Day 8–14 對內覺察：看見自己（= 高情商溝通 NVC 4 步）
      → Week 3 · Day 15–21 真實困擾應用 → Day 21「認知升維」畢業儀式
```

每一天的循環：早上讀今日心法 + 任務 → 白天實際去做 → 晚上跟小羽對話覆盤（多回合探問）。小羽萃取當天「記憶摘要」餵進隔天脈絡；完成任務得積分 / 里程碑徽章。隨時可用「我卡住了，幫我拆」走另一條諮詢對話（Mode B，有自己的主題列表）。

## 1.4 方案與收費（現況）

| 方案 | 代碼 | 每月對話次數 | 月費（NT$） |
|---|---|---|---|
| 免費體驗 | `trial` / `free` | 體驗額度 | 0 |
| Basic 啟動練習 | `basic` | 50 | 100 |
| Advanced 深化練習 | `advanced` | 100 | 200 |
| Premium 整合與達成 | `premium` | 200 | 300 |

全平台共用同一套方案（`plans` 表），所有課程 / App 共用。**付費一律在 NUWA**：App 內點「升級」→ 帶到 NUWA 訂閱頁 → 紅陽金流 → 方案寫回 NUWA 帳號 → 下一次在 App 對話吃到新額度，中間沒有人工同步。內測期間 `BILLING_ENFORCEMENT=false`，額度不會真的擋人。差異化定價見 Part Ⅳ。

---

# Part Ⅱ — 系統視角

## 2.1 四個元件的職責

| # | 元件 | 路徑 / 技術 | 負責什麼 |
|---|---|---|---|
| ① | NUWA 登入 + 會員中心 | `(public)` + `(dashboard)`；Next.js 16 + Supabase Auth | 註冊（需邀請碼）· 手機/Email + 密碼登入 · superadmin 手機 OTP · 忘記密碼 · 免費體驗 `/guest` · 會員資料 · **訂閱付費** · **App 商城** `/dashboard/apps` · 實體課程報名 · 站內通知 |
| ② | NUWA 管理後台 | `/manage/*`；gate `role ∈ {admin, superadmin}` | 會員 · 服務/老師/線上課程/課程日 · 實體課程 + 報名 · **訂閱/金流/AI 用量（可按 App 過濾）** · 方案 `plans` · 對話與長期記憶檢視 · 邀請碼 · **App 註冊表** `/manage/apps` + per-App 管理員 · 稽核 · 系統參數/密鑰 |
| ③ | NextHappy 使用者介面 | `/welcome /onboarding /chat /progress /settings`；Next.js 14 + 自簽 JWT `happy_session` + OpenAI GPT-4o | SSO 接收 `/sso` · 6 頁導覽 · onboarding 設 MBTI · **每日 AI 對話**（Mode A 練習 / Mode B「我卡住了」多主題諮詢）· 進度/積分/徽章 · 額度顯示 · 語音對話（已接 OpenAI Realtime，按鈕隱藏中）· `/settings/billing` 連到 NUWA |
| ④ | NextHappy 課程後台 | `/admin/*`，獨立登入 `/admin-login`；gate `happy.users.is_admin` | Dashboard · 學員管理（疊公版帳號欄位）· Journey 管理 · 對話歷史/諮詢主題 · **課程內容逐日編輯** · 邀請碼 · 訂閱管理 · 用量/成本 · 規格文件 · **未來規劃** · AI Prompt 檢視 · 系統設定 · 所有異動寫稽核 log |

## 2.2 兩層平台架構（Market / App）與兩條串接線

| 串接線 | 方向 | 用途 | 關鍵物件 |
|---|---|---|---|
| **A · SSO token 交接** | NUWA → NextHappy 單向簽發 | 身分：登入一次帶著進 App；App 不做自己的會員登入 | `apps.sso_secret` · `/api/apps/:slug/launch` · `/sso` |
| **B · 跨 schema 讀寫** | NextHappy → `public`（service-role client） | 方案真值、帳號欄位、AI 用量歸戶 | `happy.users.nuwa_user_id` ↔ `public.users.id`（**刻意不加 FK**）· `src/lib/market/*` |

兩版跑在**同一個 Supabase Postgres**；`public` schema 是帳號 + 付費 + 訂閱的**唯一真值來源**，`happy` schema 放課程 / 旅程 / 對話。

## 2.3 權限模型 — 誰能改什麼

| 角色 | 認定於 | 能做什麼 | 怎麼取得 |
|---|---|---|---|
| `user` | `public.users.role` | 一般會員：登入、付費、進 App | 註冊即是 |
| `admin` | `public.users.role` | NUWA `/manage`；若列在 `app_admins` 則只看得到指定 App 的資料 | superadmin 指派 |
| `superadmin` | `public.users.role` | NUWA 全後台；**登入需手機 OTP**（目前固定 `1234`，未接簡訊） | `/api/setup/superadmin` 一次性建立 |
| 課程管理員 | `happy.users.is_admin` | NextHappy `/admin` 全部 | 由現有課程管理員在 `/admin` 授權 |

**`admin`（公版）≠ `is_admin`（私版）**。即使 NUWA 後台以 `to=admin` 深連進私版 `/admin`，私版 layout 仍會再檢查一次 `is_admin`；沒有的話顯示「無權限」說明頁，不靜默轉址。

## 2.4 工作流程一 — 使用者

**第一次：註冊 → 進 App → 開始 21 天**

1. NUWA `/register`（需邀請碼）→ 寫 `public.users`（`role='user'`、`current_plan='free'`）+ Supabase `auth.users`（同 id 手動對應，非 FK）
2. NUWA `/login` → Supabase Auth session（`sb-*` cookie）
3. NUWA `/dashboard/apps` → 「幸福關係」→ 進入 → `GET /api/apps/happy/launch?to=app`：驗 session · 讀 `apps` · 查 `deleted_at` · 比 `required_plan` · `upsert user_apps` · 簽 120 秒 HS256 JWT
4. 302 到 `{app_url}/sso?token=…`
5. NextHappy `/sso` 驗 token → 找/建 `happy.users`（by `nuwa_user_id` → by `email` 補綁 → `INSERT`，`current_plan='trial'`、`password_hash` 亂數）；命中 `suspended_at` 擋
6. 發 `happy_session`（30 天）→ 無 `mbti_self` → `/onboarding`
7. onboarding 寫 `happy.users.mbti_self` + 建 `journeys` → `/chat`

**每天：對話一次的資料流（Mode A，`POST /api/ai/chat`）**

```
前端 /chat 送一句話
 → 驗 happy_session + isSuspended(查 happy.users.suspended_at)
 → checkRateLimit（記憶體 Map，50/日）
 → checkQuotaAvailable → getMarketPlan(nuwa_user_id)  【跨 schema 讀 public.users.current_plan】
    （BILLING_ENFORCEMENT=false → 永遠 allow）
 → 讀 journeys(is_active) 取 current_day
 → 讀/建 conversations(journey_id + day_number，messages JSONB)
 → buildContextData 組三層記憶：
     ① course_content[day]（靜態課程）
     ② daily_memories（前幾天 AI 萃取摘要）
     ③ conversations.messages 最近 20 則
     → buildSystemPrompt（LEAD→PROBE→HOOK，寫死在 buildContext.ts）
 → OpenAI GPT-4o streaming（SSE 回前端）
 → 串流結束落地：
     append assistant 回覆進 conversations.messages
     addPoints → journeys.total_points
     recordUsage → 寫 happy.ai_usage_logs + 更新 happy.usage_quotas
     reportUsageToMarket → 寫 public.ai_token_usage(app_id='happy')  【跨 schema 寫】
```

Mode B「我卡住了」（`/api/ai/consultant`）不需要 `journeys`；多主題、自動命名，對話存在 `conversations`（`user_id` 為 owner、`journey_id` 可 NULL、`context_type='consultant'`）。

## 2.5 工作流程二 — 管理者（兩套後台）

**NUWA 平台後台 `/manage`**
- 登入：NUWA `/login`；superadmin 密碼對了先登出、發手機 OTP → 驗證才建 session
- Gate：middleware 擋未登入；頁面層 `getAdminCtx()` 驗 role、`getAccessibleAppIds()` 依 `app_admins` 收斂
- 會員 / 服務 / 老師 / 線上課程 / 課程日 / 實體課 + 報名
- 方案 `plans`（全平台共用的 basic/advanced/premium）
- 訂閱 / 金流 / AI 用量 — `ai_token_usage` 含私版回寫的列，用 `app_id` 過濾，per-App 管理員只看自己 App
- App 管理 `/manage/apps` — 設 `app_url` / `admin_url` / `sso_secret`（遮罩顯示）/ `required_plan` / `status`；指派 per-App 管理員
- 邀請碼 / 稽核 `admin_audit_logs` / 系統參數 + 密鑰 `secret_params`（OpenAI、esafe、簡訊、CRON…）

**NextHappy 課程後台 `/admin`**
- 登入：`/admin-login`（`email` + `password_hash` = SHA-256(pw + JWT_SECRET)、`is_admin=true`）→ 同一個 `happy_session`
- Gate：layout `getSession()` → 查 `is_admin`；每個 `/api/admin/*` 過 `requireAdmin()`（401 / 403 / 通過）
- Dashboard · 學員管理（疊上公版帳號欄位 email / phone / plan，唯讀、底色標示，來自 `getMarketUsers()`）
- Journey 管理 · 對話歷史 / 諮詢主題（trade secret，一般用戶看不到）
- 課程內容 `/admin/course/[day]` — 逐日編 `course_content`（主題 / 知識點 / 今日任務 / 晚間提問）
- 用量 / 成本 — `ai_usage_logs` / `usage_quotas`
- 邀請碼 · 訂閱 · 規格文件 · 未來規劃 · AI Prompt · 系統設定；所有異動寫 `admin_audit_logs`

## 2.6 工作流程三 — 系統（付費迴圈，跨兩系統）

1. NextHappy `/settings/billing` ——連結——> NUWA `/dashboard/subscribe`
2. NUWA `/dashboard/subscribe/[code]/checkout` → `POST /api/payment/initiate`：建 `public.payments`（`status='pending'`）· 升級只扣差額（`amount − 現方案 monthly_charge`）· 產生紅陽 esafe 綁卡表單參數
3. 前端把表單 POST 給紅陽支付頁
4. 紅陽 ——POST——> NUWA `/api/payment/callback`：驗 `ChkValue`（不符 → 400）· `errcode` `00`/`00000` 才算成功 · `UPDATE payments`（`paid` / `token_data` / `paid_at`）· 收掉舊 active `subscriptions` → `INSERT` 新的一筆（+1 月）· `UPDATE public.users`（`current_plan` / `dialog_limit` / `plan_deadline` / `next_plan=NULL`）
5. NextHappy 下一次 `/api/ai/chat`：`getMarketPlan()` 讀到新的 `current_plan` → 額度上限跟著變高。**無同步 job。**

PCI-DSS：卡號永遠不進 DB / log；紅陽走 token 化，`payments.token_data` 只存 token。定期扣款有 3 支 cron（`/api/subscription/auto-charge` 每月 1 號、`notify-expiring` 每日、`courses/remind` 每日）。

---

# Part Ⅲ — 技術視角

## 3.1 串接 A — SSO token 交接（逐步）

前提（`public.apps`，migration 011 / 015）：

```
apps (slug='happy')
  app_url    = https://nexthappy.sakilu-dev.uk          ← 使用者端 App
  admin_url  = https://nexthappy.sakilu-dev.uk/admin    ← 課程後台
  sso_secret = <與私版 SSO_SECRET 逐字相同的共用金鑰>
  db_schema='happy'   required_plan=NULL   status='active'
```

私版 env：`SSO_SECRET`（＝上面的 `sso_secret`）· `JWT_SECRET`（簽自己的 `happy_session`，與 NUWA 無關）。

1. **NUWA** `/login` → Supabase Auth（`sb-*` cookie）
2. **NUWA** `/dashboard/apps` → 卡片連到 `/api/apps/happy/launch`（只列 `status='active'`）
3. **NUWA** `GET /api/apps/happy/launch?to=app`：驗 session（無 → `/login?next=…`）· 讀 `apps` · `users.deleted_at` 擋 · `to=admin` 檢查 `role∈admin/super`，否則以 `PLAN_LEVEL` 等級表比 `required_plan`（值不合法 fail-closed）· `upsert user_apps` · 簽 JWT：
   `HS256(secret = apps.sso_secret) { sub:<nuwa_user_id>, email, name, app:'happy', to:'app', iat, exp: now+120 }`
4. **NUWA → HAPPY** 302 `{app_url}/sso?token=<jwt>`（`to=admin` 時基底改用 `admin_url` origin；本機用 `DEV_APP_URL_HAPPY` 覆寫，`NODE_ENV=production` 一律忽略）
5. **HAPPY** `GET /sso` 驗簽：HMAC-SHA256 + `timingSafeEqual` · 檢 `exp`、`app==='happy'`
6. **HAPPY** 解析 `happy.users`：① `nuwa_user_id` → ② `email`（補寫 `nuwa_user_id`）→ ③ `INSERT`（`current_plan='trial'`、`password_hash` 亂數）。命中 `suspended_at` → 導回登入
7. **HAPPY** `Set-Cookie: happy_session`（jose HS256 · 30 天 · production `SameSite=None; Secure`）
8. **HAPPY** 依 `to` 導向：`welcome→/welcome?next=…` · `admin→/admin` · `app→`（有 `mbti_self`）`/chat` 或 `/onboarding` · 未帶 `→/`

**停權雙防線**：`happy_session` 是無狀態 JWT、30 天收不回。`/sso` 每次進來檢 `suspended_at`（主防線）、`getSession()` 每次額外查一次 DB。公版對應的是 `deleted_at` 擋在 launch route。
**私版沒有會員登入頁**：`/auth/login`、`/auth/register` 只是 `307` 到公版的轉接點（`?error=sso_*` 例外）。middleware 對任何非公開路徑、無 `happy_session` → `307` 到 `MARKET_LOGIN_URL`。
**私版管理員登入（旁路）**：`/admin-login` server action 驗 `happy.users.password_hash` + `is_admin`，發同一個 `happy_session`。

## 3.2 串接 B — 跨 schema 讀寫

```js
// src/lib/market/client.ts — 另開一個指向 public 的 service-role client
createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { db:{ schema:'public' }, auth:{ persistSession:false } })
```

| 函式 | 檔案 | 動作 | 呼叫端 | 失敗時 |
|---|---|---|---|---|
| `getMarketPlan(nuwaUserId)` | `lib/market/plan.ts` | **讀** `public.users.current_plan` + `plan_deadline`；`free→trial`，其餘 1:1 | `lib/billing/quotas.ts` | fallback 到 `happy.users.current_plan` |
| `getMarketUsers(ids[])` | `lib/market/users.ts` | **讀** `public.users` email/nickname/phone/plan（批次 `.in()`） | `/api/admin/users(/[id])` | 回空 Map，改顯示私版本地值 |
| `reportUsageToMarket({…})` | `lib/market/usage.ts` | **寫** `public.ai_token_usage`（`app_id='happy'` + `cost_twd`） | AI 對話結束（fire-and-forget） | 只 `console.error` |

方案真值單一化（`#3a`）：帳號與付費統一在公版，私版不自行訂閱、不維護第二份狀態，每次判斷額度即時去公版讀。
NUWA 端 App 切分（migration 013）：`payments` / `subscriptions` / `ai_token_usage` / `chat_topics` 都加 `app_id`，trigger 從 `service.code == apps.slug` 自動帶入。

## 3.3 ERD — `public` schema（NUWA，23 支 migration）

**核心表 `users`**（`id` PK = `auth.users.id` 手動同 id、非 FK）：`phone` · `email` · `nickname` · `role`(user/admin/superadmin) · `current_plan` · `dialog_limit` · `plan_deadline` · `next_plan` · `affiliate_id` · `deleted_at`（軟刪除）

| 群組 | 表 | 關係 / 重點 |
|---|---|---|
| 多 App 平台 | `apps` | `id` PK · `slug` uniq · `app_url` · `admin_url` · `db_schema` · `sso_secret` · `entitlement_key` · `required_plan` · `status` |
| | `user_apps` | `user_id` FK→users · `app_id` FK→apps · `app_user_id` · `status` · uniq(user_id,app_id) |
| | `app_admins` | `user_id` FK→users · `app_id` FK→apps · `role` manager/viewer · uniq(user_id,app_id) |
| 金流 | `plans` | `code` uniq (basic/advanced/premium) · `price` · `renewal_price` · `monthly_dialog_count` · `monthly_charge` |
| | `subscriptions` | `user_id` FK · `service_id` FK · **`app_id` FK→apps** · `plan_name` · `starts_at`/`ends_at` · `status` |
| | `payments` | `user_id` FK · `service_id` FK · **`app_id` FK→apps** · `amount` · `plan_name` · `payment_uid` · `token_data`(只存 token) · `status` · `paid_at` |
| AI | `chat_topics` | `user_id` FK · `teacher_id` FK · `course_id` FK · **`app_id` FK** · `title` · `is_pinned` |
| | `chat_messages` | `topic_id` FK→chat_topics · `role` · `content` · `token_count` |
| | `ai_token_usage` | `user_id` FK · **`app_id` FK** · `service_id` · `teacher_id` · `tokens_used` · `cost_twd` · `date` |
| | `user_memory` | `user_id` FK · `category` · `content` · `source_topic_id` FK→chat_topics |
| 課程 | `services` (`code` uniq · `plans` JSONB legacy) → `teachers` (`service_id` FK · `system_prompt`) | |
| | `courses` → `subjects` → `units`；`course_templates` → `course_days`(`day_number` · `knowledge_point` · `today_task` · JSONB) | |
| | `physical_courses` → `registrations`(`user_id` FK · `physical_course_id` FK · `status` · `reminder_sent`)；`user_unit_progress`(`user_id` · `unit_id` · `progress_pct`) | |
| 帳號 / 其他 | `sms_verifications` · `invite_codes`(`code` PK · `used_by` FK→users · `expires_at`) · `notifications`(`user_id` FK · `type` · `read_at`) · `system_params` · `secret_params` · `admin_audit_logs`(`actor_id` FK · `action` · `detail` JSONB) · `mbti_profiles` · `journeys`/`daily_records`/`daily_memories` | |

- **多數 FK 沒有 `ON DELETE CASCADE`**（migration 020）→ 會員採軟刪除 `deleted_at`，後台列表 / 通知一律過濾 `deleted_at IS NULL`。
- **schema drift**：公版曾是 monolith，同時存在 `services.plans`(JSONB, legacy) 與 `plans` 表、`courses/subjects/units` 與 `course_templates/course_days`、以及一套 `journeys`。實際生效以較新的 migration 為準（`plans` 表、`course_days`）。

## 3.4 ERD — `happy` schema（NextHappy，17 支 migration）

**核心表 `users`**：`id` PK · **`nuwa_user_id`**(UUID, uniq partial index, **無 FK**) · `email` uniq · `name` · `password_hash` · `is_admin` · `suspended_at` · `mbti_self` / `mbti_confidence` / `mbti_set_at` · `current_plan`(enum `plan_tier`) · `trial_started_at` / `subscription_started_at` / `subscription_renews_at` / `payment_method_token` / `auto_renewal` / `cancelled_at`

| 表 | 關係 / 重點 |
|---|---|
| `journeys` | `id` PK · `user_id` FK **uniq**（每人一筆）· `mbti_self`(nullable override) · `mbti_partner` · `partner_nickname` · `relationship_type`(couple/parent_child/workplace) · `goal_statement` · `initial_problem` · `start_date` · `current_day` · `is_active` · `total_points` |
| `daily_records` | `journey_id` FK · `day_number` · `task_completed` · `completion_type`(success/partial/failed) · `emotion_score` · `journal_text` · `points_earned` · uniq(journey_id, day_number) |
| `daily_memories` | `journey_id` FK · `day_number` · `emotion_note` / `task_result` / `partner_obs` / `key_insight` / `follow_up` · uniq(journey_id, day_number) — **三層記憶的中間層** |
| `conversations` | `id` PK · **`user_id` FK NOT NULL（canonical owner）** · `journey_id` FK **nullable**（Mode B trier 可空）· `day_number` · `context_type`(morning/realtime/evening/onboarding/consultant) · `source`(text/voice) · `messages` JSONB [] |
| `achievements` | `journey_id` FK · `badge_id` · `badge_name` · `points` |
| `course_content` | `day_number` uniq（靠此對應 `journeys.current_day`，**無硬 FK**）· `theme` · `subtitle` · `course_unit` · `knowledge_point` · `today_task` · `evening_questions` JSONB · `special_content` JSONB |
| `usage_quotas` | PK(`user_id`, `period_start` 月) · `messages_count` · `tokens_input`/`tokens_output` · `cost_twd_estimated` |
| `ai_usage_logs` | `user_id` FK · `conversation_id` · `context_type` · `model` · `input_tokens` · `output_tokens` · `cost_twd` |
| `admin_audit_logs` | `admin_user_id` FK · `action`(`entity.action`) · `target_type`/`target_id` · `changes` JSONB · `ip_address` |
| `system_params` | `key` PK(`區塊.項目`) · `value` · `updated_by` FK→users |
| `invite_codes` · `mbti_profiles` · `blindspot_taxonomy` · `blindspot_records` | 邀請碼、16 型資料、盲點分類 |

`users.nuwa_user_id` 是與公版的**唯一連結**（→ `public.users.id`）。本機開發另有 `supabase/00_public_stub_schema.sql`：`public` 的最小骨架（只建 `users`/`apps`/`ai_token_usage` 三張），讓跨 schema 查詢不報錯。

## 3.5 資料流總表（誰寫、誰讀）

| 資料 | 產生者 | 儲存位置 | 讀取者 |
|---|---|---|---|
| 帳號 · role · 方案 | NUWA 註冊 / 付費 callback | `public.users` | NUWA 全站；NextHappy 經 `getMarketPlan` / `getMarketUsers` 跨界讀 |
| Supabase Auth session | NUWA 登入 | `sb-*` cookie | NUWA middleware / server client |
| App 註冊 · SSO 金鑰 | NUWA `/manage/apps` | `public.apps` | NUWA launch route；NextHappy `getHappyAppId()` |
| 會員↔App 綁定 | NUWA launch route (upsert) | `public.user_apps` | NUWA `/manage/apps`（綁定數） |
| SSO token | NUWA launch route（簽） | URL query（120 秒，不落地） | NextHappy `/sso`（驗） |
| `happy_session` | NextHappy `/sso` 或 `/admin-login` | `happy_session` cookie | NextHappy middleware / `getSession` |
| MBTI · 旅程 · 每日記錄 | NextHappy `/onboarding` `/progress` | `happy.users.mbti_self` · `journeys` · `daily_records` | NextHappy `/chat` context · `/admin/journeys` |
| AI 對話內容 | NextHappy `/api/ai/*` | `happy.conversations.messages` (JSONB) | NextHappy `/chat` · `/admin/conversations` |
| 每日記憶摘要 | NextHappy（AI 萃取） | `happy.daily_memories` | `buildContext` 隔天脈絡 |
| AI 用量（私版精準） | NextHappy `recordUsage` | `happy.ai_usage_logs` + `usage_quotas` | NextHappy `/admin/usage` · 額度檢查 |
| AI 用量（歸戶公版） | NextHappy `reportUsageToMarket` | `public.ai_token_usage`（`app_id='happy'`） | NUWA `/manage/ai-usage` |
| 訂閱 / 付款 | NUWA `/api/payment/*` + 紅陽 callback | `public.payments` · `subscriptions` | NUWA `/manage`；間接改 `users.current_plan` → NextHappy 額度 |
| 後台稽核 | 兩邊各自 mutation | `public.admin_audit_logs` / `happy.admin_audit_logs` | 各自後台 |

## 3.6 部署、環境與已知邊界

**NUWA**：Vercel（Git 自動部署），線上 `next.nuwa.chg2asc.com`。3 支 cron。Supabase 三種 client：Browser(anon) / Server(cookie) / Admin(service_role 繞 RLS)。密鑰存 DB `secret_params`（`getSecretParam()` 讀）。
**NextHappy**：Docker standalone（自架 "berth"），`nexthappy.sakilu-dev.uk`；另有 Vercel preview。`next.config.js`：`images.unoptimized`、安全標頭自送、`serverActions.allowedOrigins` 放行紅陽（否則導回頁 500）。本機整合：`DEV_APP_URL_HAPPY`（公版側）· `NEXT_PUBLIC_MARKET_BASE_URL`（私版側，build 時寫死進 bundle）。

**程式碼註解點出的坑**
- 停權即時性：JWT 30 天收不回 → `/sso` 每次檢 `suspended_at` + `getSession()` 每次查 DB；公版側是 `deleted_at` 擋 launch。
- `nuwa_user_id` 型別：舊 schema 是 `TEXT`，migration 017 對齊 `UUID` + 唯一 partial index。髒值會讓 `getMarketUsers` 的 `.in()` 整包查詢拋錯、後台公版欄位靜默 fallback。
- `required_plan` 比對：舊寫法拿私版方案值比公版方案值 → 免費用戶永遠通過。現用 `lib/plans.PLAN_LEVEL` 等級表，非法值 fail-closed。
- 跨網域 cookie：`happy_session` production 用 `SameSite=None; Secure`，否則 SSO 302 過來第一個請求帶不到。
- `conversations.source`：程式一直讀寫但沒 migration 建欄位，曾造成後台「對話歷史」全部 404 + 語音對話 100% 儲存失敗（migration 015 補上）。
- 反向代理 host：容器內 `request.url` 是 `0.0.0.0:3000`，重導一律取 `x-forwarded-host`（`publicUrl()`）。

---

# Part Ⅳ — 未來 Roadmap

> 來源：NextHappy repo 的 `/admin/roadmap`（`public/roadmap/*.html` 提案文件）、`docs/proposals/`、以及 migration 註解裡的架構意圖。狀態沿用提案文件自己的標記。

## 4.1 規劃全景

| 項目 | 狀態 | 一句話 | 對系統的影響面 |
|---|---|---|---|
| 多語言處理 | 待決策 | 公版預設字典 + 私版覆寫字典的混合架構；介面文字走 i18n key-value，課程教材走多欄位 | 兩邊後台各加一頁 `/admin/i18n`；`course_content` 加語言欄位 |
| 差異化定價 | 待決策 | 基礎定價 + 成本權重（語音/圖片）+ 特殊功能加值，外加統一/個別調價 | 新 `/admin/pricing`（與通知設定分開）；`plans` 模型擴充為多維度 |
| 課程架構 v1.0（觀感想行） | 已拍板 | 6 技能 → 4+4 對稱（Week 1 對外、Week 2 對內），心智模型簡化、執行顆粒不合併 | 只動課程內容與 AI prompt；spec v1.0 拍板前不碰 schema / production code |
| 多 App 平台化 | 進行中 | NUWA 從單一 App 變成 Market；`apps`/`user_apps`/`app_admins`/per-App `app_id` 已就緒 | 骨架已在 DB；缺第 2 支 App 實測、`entitlement_key` 尚未使用 |
| 私版獨立 Supabase | 預留 | 外部夥伴的 App 不會與我們同庫；`nuwa_user_id` 刻意不設跨 schema FK 就是為此 | 屆時 `src/lib/market/*` 從「跨 schema 查詢」改為「HTTP API」 |
| 語音對話（Realtime） | 已接未開 | OpenAI Realtime session 已串（`/api/realtime/session`），前端按鈕隱藏中 | `conversations.source='voice'` 已支援；等成本與體驗評估 |

## 4.2 多語言處理（待決策）

起因：之後可能找其他國家的老師開課，公版 / 私版後台都要支援多語系，且翻好的專有名詞 / 教材要能讓管理者自己編輯。

**三個架構選項**

| 方案 | 做法 | 取捨 |
|---|---|---|
| 一 · 公版統一 API | 私版即時呼叫公版翻譯 API | 集中管理；但每次切換 / 渲染都要打 API 有延遲，公版掛掉全部私版一起壞 |
| 二 · 私版自帶字典檔 | 各私版前端內建字典 | 切換瞬間完成、可高度客製；但每加一個私版就要重設一次翻譯，維護隨私版數線性成長 |
| **三 · 混合（建議）** | 公版提供**預設字典** + 私版**覆寫字典**；渲染時「私版覆寫 → 找不到 → 退回公版預設」 | 直接對應「翻譯完要能給管理者編輯」；切換瞬間完成（字典預載）；架構多一層 |

**資料流（關鍵：即時切換靠預建字典，不是即時叫 AI）**
1. 建立公版預設字典（AI 初翻或人工建立 `"day1_title": "..."`，存公版 DB，全部私版共用）
2. 私版管理者在 `/admin/i18n` 覆寫任一個詞（只存差異）
3. 使用者瀏覽器：頁面載入時合併一次（覆寫優先、找不到退回預設）→ 點語言＝本機瞬間換字，**不再打 API、不累積 AI 費用**

| 範圍 | 機制 | 初稿誰寫 |
|---|---|---|
| 介面文字（按鈕 / 標籤 / 提示） | key-value i18n 字典，全站幾百到千餘組 | AI 一次批次翻完 |
| 課程教材（21 天長文） | 每天內容各語言各存一份完整段落（`knowledge_point_en` / `_ja` 等欄位） | AI 先翻一版，外國老師本人校對後上線 |

**還沒決定**：(1) 優先支援幾種語言（先做 1 種最快上線 vs 一次做 3–5 種）；(2) 私版覆寫字典存哪（存私版自己 DB，符合「日後搬去獨立 Supabase」 vs 集中存公版一張表，方便稽核但搬家多一道遷移）。

## 4.3 差異化定價與調價機制（待決策）

起因：NUWA 上的 App 會愈來愈多，單一定價不夠用。

**先確定**：差異定價與「通知設定」分開兩頁（`/admin/pricing` / `/admin/notifications`）。理由是「改錯的代價」完全不同——通知改錯少收一封信，定價改錯是全站營收。

```
最終價格 = [ 基礎定價(每個 App 各設)
           + Σ(成本權重 × 用量)     ← 語音權重、圖片權重、對話輪數、模型等級
           + Σ(特殊功能加值)        ← 版面客製、優先支援、白牌網域（固定加購金額）
         ] × (1 + 調整%)            ← 統一全站 % 或 按 App / 按成本項 個別 %
```

- 維度一 基礎定價：App 本身月費，與使用行為無關
- 維度二 成本權重：依實際耗掉的成本動態疊加（語音要先轉文字、圖片辨識吃更多 token）
- 維度三 特殊加值：「有開通就加錢」的加購項，非用量計費
- 調整機制：統一（通膨 / 供應商全面漲）與 個別（單一供應商 / 單一功能漲）兩個開關並存於同一張調價表單

提案文件內建「勾選欄位 → 即時組出後台介面草稿與計價公式」互動模擬器（複選）。要開發哪些欄位由主管 / 老闆在模擬器上勾出共識組合後定案。

## 4.4 課程架構 v1.0 — 觀感想行 4 步（已拍板）

來源 `docs/proposals/architecture-v1.0-proposal.md`（Steve 拍板 v0.2）。把現行 6 技能（S1–S6）升級為 4+4 對稱架構。

- 核心：**觀**（觀察事實，不解讀）→ **感**（接住 / 識別情緒）→ **想**（翻譯 / 釐清需求，透過 MBTI）→ **行**（肯定同理回應 / 提出具體請求 = NVC 第 4 步），累積 21 天 →「認知升維」
- Week 1（D1–7）對外覺察：看見他人，觀→感→想→行各一天 + 整合日
- Week 2（D8–14）對內覺察：看見自己 = 高情商溝通（NVC）4 步 + 整合 + 中期總檢（8 維度盲點地圖）
- Week 3（D15–21）：真實困擾 × 8 維度診斷 → D21「認知升維儀式」畢業日
- 紀律：「學術依據層」（spec，引 Rosenberg NVC、Ericsson 刻意練習、MBTI 認知功能）與「對話介面層」（AI 對學員只講「4 步覺察」白話）**不互相污染**
- 此提案**不動** production code 與 Supabase schema，等 spec v1.0 拍板後一次性更新

## 4.5 多 App 平台化 & 私版獨立 Supabase（進行中 / 預留）

- **已就緒（migration 011–013）**：`apps` 註冊表、`user_apps` 綁定、`app_admins` per-App 權限、`payments/subscriptions/ai_token_usage/chat_topics` 帶 `app_id` + 自動帶入 trigger。NUWA 後台已能「每個 App 只看自己學員」。
- **待補**：第 2 支 App 的真實接入與驗證；`apps.entitlement_key`（App 查詢訂閱權益的 API key）目前定義了但還沒用到。
- **刻意的架構取捨（migration 017）**：`happy.users.nuwa_user_id` 指向 `public.users.id` 但**不設 FK**——一旦設了，私版就再也搬不去獨立的 Supabase 專案，而外部夥伴的 App 遲早要走這條路。屆時 `src/lib/market/*` 會從「跨 schema 直接查」改成「打公版的 HTTP API」，SSO 那條線不變。
