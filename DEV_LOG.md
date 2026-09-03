# NUWA V2 開發日誌

---

## 2026-04-07（Day 1）— Phase 0: 專案初始化 & 環境建置

### ✅ 已完成

#### 1. Next.js 專案建立
- 在 `v2/` 目錄建立 Next.js 14 App Router + TypeScript + Tailwind CSS v4 專案
- 選擇同 repo 子目錄方案（V1 與 V2 互不干擾）

#### 2. 核心依賴安裝
- `@supabase/supabase-js` + `@supabase/ssr` — Supabase 客戶端
- `ai` + `@ai-sdk/openai` — Vercel AI SDK
- `react-hook-form` + `@hookform/resolvers` + `zod` — 表單 & 驗證
- `framer-motion` — 動效
- `lucide-react` — 圖示
- `next-themes` — 深色模式

#### 3. Shadcn UI 初始化
- 已安裝元件：button, card, input, dialog, dropdown-menu, tabs, avatar, badge, separator, accordion

#### 4. Tailwind 設計 Token
- 品牌色：brand-purple `#9B7496`, brand-orange `#EC9566`, brand-rose `#E9B4A6`, brand-teal `#AFC5C1`
- Surface / Foreground / Accent 色系
- 深色模式色彩：dark-bg `#1A1816`, dark-surface `#2D2926`, dark-elevated `#3A3632`
- 字型：Playfair Display（heading）、Inter + Noto Sans TC（body）

#### 5. 目錄結構建立
```
src/
├── app/
│   ├── (public)/        — 公開頁面（首頁、登入、註冊、課程）
│   ├── (dashboard)/     — 會員頁面（需 auth）
│   ├── (manage)/        — 管理後台
│   └── api/             — API Routes（auth, chat, payment, subscription）
├── components/          — auth, course, chat, dashboard, payment, layout, ui
├── lib/                 — supabase, esafe, email, queries
└── types/
```

#### 6. Supabase 專案建立 & 連結
- 專案名稱：`nuwa-v2`
- Region：Northeast Asia (Tokyo)
- Reference ID：`jjnmkhpqrmnnaqxhyfcy`
- Dashboard：https://supabase.com/dashboard/project/jjnmkhpqrmnnaqxhyfcy
- `.env.local` 已設定 URL + anon key + service_role key

#### 7. 資料庫 Schema（17 張表）
- Migration 檔：`supabase/migrations/001_create_tables.sql`
- 已推送到遠端 Supabase DB，確認所有表建立成功
- 包含 `updated_at` 自動更新 trigger

| 表名 | 用途 |
|------|------|
| users | 使用者 |
| services | 服務/課程設定 |
| teachers | 教師/AI 家教 |
| courses | 線上課程 |
| subjects | 課程章節 |
| units | 課程單元 |
| physical_courses | 實體課程 |
| registrations | 實體課程報名 |
| subscriptions | 訂閱記錄 |
| payments | 付款記錄 |
| chat_topics | AI 對話主題 |
| chat_messages | AI 對話訊息 |
| ai_token_usage | Token 使用量 |
| sms_verifications | SMS 驗證碼 |
| system_params | 系統參數 |
| user_unit_progress | 影片觀看進度 |
| notifications | 站內通知 |

#### 8. Auth Middleware
- `src/lib/supabase/client.ts` — 瀏覽器端 Supabase client
- `src/lib/supabase/server.ts` — Server Component 用 Supabase client
- `src/lib/supabase/middleware.ts` — Session 管理 + 路由保護
- `src/middleware.ts` — 攔截 `/dashboard` 和 `/manage` 需登入

### 🐛 Bug 狀態
- **無已知 Bug** — `npm run build` 通過，專案乾淨

### ⚠️ 注意事項
- IPv6 不通，Supabase CLI 操作需加 `--dns-resolver https`
- Node.js v23.5.0 有 engine warning（eslint-visitor-keys 要求 ^20.19 或 ^22.13），不影響功能

---

---

## 2026-04-07（Day 1 續）— Phase 1: 身份驗證系統

### ✅ 已完成

#### 1. 登入頁 `/login`（設計稿 04）
- 左右分欄 layout（左：品牌視覺 brand-purple / 右：表單）
- React Hook Form + Zod 驗證（手機格式 + 密碼長度）
- Supabase `signInWithPassword({ phone, password })`
- 手機號碼自動轉 E.164（`0912345678` → `+886912345678`）
- 密碼 show/hide toggle（Eye icon）
- 錯誤訊息中文化
- 響應式：手機版隱藏左側品牌區
- 檔案：
  - `src/app/(public)/login/page.tsx`
  - `src/app/(public)/login/actions.ts`
  - `src/components/auth/login-form.tsx`

#### 2. 註冊頁 `/register`（設計稿 05）
- 四步驟進度條表單：
  1. 手機驗證（手機號碼 + 發送驗證碼 + 4 碼 OTP + 同意條款）
  2. 設定密碼（密碼 + 確認密碼）
  3. 個人資料（暱稱必填 + 性別/生日/Email 選填）
  4. 完成頁（開始使用按鈕）
- SMS 發送 API（milkidea）— 60 秒 cooldown
- OTP 驗證 API — 5 分鐘過期
- Supabase signUp + 寫入 users 表
- 推薦人追蹤（`?ref=xxx` → `affiliate_id`）
- 手機號碼重複檢查
- 檔案：
  - `src/app/(public)/register/page.tsx`
  - `src/app/(public)/register/actions.ts`
  - `src/components/auth/register-form.tsx`
  - `src/app/api/auth/sms/send/route.ts`
  - `src/app/api/auth/sms/verify/route.ts`
  - `src/lib/sms/milkidea.ts`

#### 3. 密碼重設
- **會員中心密碼變更** `/dashboard/password`（設計稿 09）
  - 舊密碼 + 新密碼 + 確認新密碼
  - 驗證舊密碼正確後才允許更新
  - 檔案：
    - `src/app/(dashboard)/dashboard/password/page.tsx`
    - `src/app/(dashboard)/dashboard/password/actions.ts`
    - `src/components/auth/change-password-form.tsx`
- **忘記密碼** `/forgot-password`
  - 兩步驟：手機 OTP 驗證 → 設定新密碼
  - 使用 Supabase admin API 重設密碼（service_role key）
  - 成功後導向登入頁
  - 檔案：
    - `src/app/(public)/forgot-password/page.tsx`
    - `src/app/(public)/forgot-password/actions.ts`
    - `src/components/auth/forgot-password-form.tsx`

### 🐛 Bug 狀態
- **無已知 Bug** — `npm run build` 通過

### ⚠️ 注意事項
- milkidea SMS token 暫時硬編碼在 `src/lib/sms/milkidea.ts`，正式環境需改用 `SMS_API_KEY` 環境變數
- 忘記密碼使用 `SUPABASE_SERVICE_ROLE_KEY`（admin API），確保此 key 不暴露給前端

#### 4. Supabase RLS（Row Level Security）
- Migration 檔：`supabase/migrations/002_add_rls_policies.sql`
- 已推送到遠端 Supabase DB
- 17 張表全部啟用 RLS
- 策略摘要：
  - `users` — 用戶只能讀寫自己的 row
  - `services/teachers/courses/subjects/units/physical_courses/system_params` — 公開可讀
  - `subscriptions/payments/ai_token_usage` — 用戶只能讀自己的（寫入由 service_role 處理）
  - `chat_topics` — 用戶 CRUD 自己的對話主題
  - `chat_messages` — 透過 topic.user_id 間接判斷所有權
  - `registrations/user_unit_progress` — 用戶讀寫自己的
  - `notifications` — 用戶讀 + 更新自己的
  - `sms_verifications` — 無 policy（僅 service_role 可存取）

---

## 2026-04-07（Day 1 續）— Phase 2: 核心頁面

### ✅ 已完成

#### 1. 共用 Layout
- **Header** `src/components/layout/header.tsx`
  - Logo + 導航（課程總覽/訂閱方案/關於我們/會員中心）
  - 搜尋欄（桌面版）
  - 登入/通知+頭像（依登入狀態切換）
  - 手機版 Hamburger Menu
- **Footer** `src/components/layout/footer.tsx`
  - 品牌區 + 產品/支援/法律 四欄連結 + 版權
  - 深色背景（surface-inverse）
- **DashboardSidebar** `src/components/layout/dashboard-sidebar.tsx`
  - 個人資訊 / 密碼重置 / 訂閱管理
  - Active 狀態高亮（brand-purple）
- **Dashboard Layout** `src/app/(dashboard)/layout.tsx`
  - Header + Sidebar + Content area

#### 2. 首頁 `/`（設計稿 01）
- Root Layout 更新（zh-Hant、品牌 metadata、font-body）
- Hero Section：標語 + CTA 按鈕（免費體驗/瀏覽課程）+ 數據（500+/98%/24hr）
- 課程 Grid：3 張 CourseCard（mock 資料，待接 Supabase）
- CourseCard 元件（封面圖 + Tag + 講師 + 評分 + 價格 + Hover 動效 `-4px + shadow`）
- 檔案：
  - `src/app/page.tsx`
  - `src/components/course/course-card.tsx`

#### 3. 課程詳情 `/courses/[code]`（設計稿 02）
- 左右佈局：左側內容（課程 Hero + 講師 + 大綱 + 評價 + FAQ）/ 右側方案卡片（sticky）
- CourseAccordion：可展開章節 → 小節列表
- PlanSelector：基本/進階/Premium 三方案 + 推薦標籤
- 手機版底部固定 CTA 按鈕
- `generateMetadata()` SEO
- 檔案：
  - `src/app/(public)/courses/[code]/page.tsx`
  - `src/components/course/course-accordion.tsx`
  - `src/components/course/plan-selector.tsx`

#### 4. 會員中心 `/dashboard/profile`（設計稿 06）
- 頭像 + 暱稱 + 手機 + 更換頭像按鈕
- 學習統計 4 格卡片（學習時數/連續天數/完成小節/AI 對話餘額）
- 個人資料表單（暱稱/性別/Email/生日 + 手機唯讀）
- 近期學習活動列表
- Profile API `PATCH /api/auth/profile`
- 檔案：
  - `src/app/(dashboard)/dashboard/profile/page.tsx`
  - `src/components/dashboard/stats-card.tsx`
  - `src/components/dashboard/profile-form.tsx`
  - `src/app/api/auth/profile/route.ts`

#### 5. Auth Context & 真實資料整合
- **AuthProvider** `src/components/providers/auth-provider.tsx`
  - `useAuth()` hook 提供 `{ user, loading }`
  - `onAuthStateChange` 監聽登入/登出即時更新
  - 加入 Root Layout（`src/app/layout.tsx`）
- **Header 接 Auth Context**
  - 登入前：顯示「登入」按鈕
  - 登入後：顯示通知鈴鐺 + 頭像 + 登出按鈕
  - Loading 時：skeleton placeholder
- **Supabase Admin Client** `src/lib/supabase/admin.ts`
  - 使用 service_role key，繞過 RLS
  - SMS send/verify、register、forgot-password 全部改用 admin client
  - 修復 RLS 導致 sms_verifications 讀寫失敗的 bug
- **Seed Data** `supabase/seed.sql`
  - 3 個服務（happy / diamond / qimen）
  - 3 位教師
  - 1 門完整課程（3 章 12 節 units）
  - 已推送到遠端 Supabase
- **Query 函式** `src/lib/queries/services.ts`
  - `getActiveServices()` — 首頁課程列表（含教師名稱）
  - `getServiceByCode(code)` — 課程詳情（含教師 + 章節大綱）
- **首頁** — 改用 `getActiveServices()` 即時查詢 Supabase
- **課程詳情** — 改用 `getServiceByCode()` + `notFound()` 處理不存在的 code

#### 6. 靜態頁面
- `/privacy` 隱私政策
- `/terms` 服務條款
- `/refund` 退費政策
- `/about/payment` 付費說明

### 🐛 Bug 修復
- **SMS 驗證碼無法寫入 DB** — 原因：RLS 啟用後 sms_verifications 無 policy，anon client 被擋。修復：改用 admin client（service_role）
- **註冊表單「發送驗證碼」按鈕重複** — submit 按鈕文字改為「驗證並繼續」
- **手機號碼紅字提示不消失** — handleSendSms 加 `clearErrors('phone')`

### ⚠️ 注意事項
- 會員中心的統計數字和近期活動仍為 mock，待 Phase 3 AI 對話功能完成後才有真實數據
- 課程詳情頁的評價和 FAQ 為靜態 mock（DB 尚無此表）

---

## 2026-04-07（Day 1 續）— Phase 3: AI 對話 & 上課系統

### ✅ 已完成

#### 1. AI 串流對話 API
- `src/app/api/chat/route.ts`
  - OpenAI GPT-4o-mini + Vercel AI SDK `streamText()`
  - 教師 system_prompt 從 DB 載入
  - 對話點數檢查（`dialog_limit <= 0` → 403）
  - `onFinish`: 存 assistant message + 扣點數 + 記 token 用量
  - 回應格式：`toUIMessageStreamResponse()`

#### 2. 對話管理 API（Topic CRUD）
- `src/app/api/chat/topics/route.ts` — GET 列出 / POST 建立
- `src/app/api/chat/topics/[id]/route.ts` — GET 歷史訊息 / PATCH 改名+釘選 / DELETE 刪除
- 所有操作驗證 user 所有權

#### 3. 對話記憶（完整流程）
- 進入課程 → 自動載入該服務的 topic 列表
- 選擇 topic → 從 DB 撈歷史 messages → 餵進 `useChat` initialMessages
- 新訊息即時存入 `chat_messages`（user + assistant）
- 下次進來歷史完整保留，AI 有完整上下文
- Topic 切換時自動重新載入歷史

#### 4. 三欄學習 Dashboard `/dashboard/service/[code]`（設計稿 03）
- 左欄：進度環（SVG）+ 課程架構樹（展開/收合 + active 狀態）
- 中欄：影片播放區（placeholder）+ 進度條 + 上/下一課導航
- 右欄：AI 對話面板 + 話題列表切換
- 檔案：
  - `src/app/(dashboard)/dashboard/service/[code]/page.tsx`
  - `src/components/dashboard/learning-dashboard.tsx`
  - `src/components/course/progress-ring.tsx`
  - `src/components/course/unit-list.tsx`
  - `src/components/chat/chat-panel.tsx`
  - `src/components/chat/message.tsx`
  - `src/components/chat/topic-list.tsx`

#### 5. DB 函式
- `supabase/migrations/003_add_rpc_functions.sql` — `decrement_dialog_limit(uid)` 已推送

### 🐛 Bug 狀態
- **無已知 Bug** — `npm run build` 通過

### ⚠️ 注意事項
- 深色模式（設計稿 13）尚未實作，待後續補
- 影片播放器為 placeholder，待整合 YouTube/Vimeo embed
- `OPENAI_API_KEY` 環境變數需設定才能使用 AI 對話

---

## 2026-04-07（Day 1 續）— Phase 5: 課程報名 & 通知

### ✅ 已完成

#### 1. 實體課程詳情 `/courses/[code]/physical/[id]`
- 課程名稱 + 狀態 badge（即將開課/報名中/報名截止/已結束）
- 日期/地點/價格 + 注意事項
- 報名按鈕（含 `reg_start`/`reg_end` 報名期間控制）

#### 2. 報名確認頁 `/dashboard/physical/[id]/confirm`（設計稿 11）
- 開課通知確認卡片（課程名稱 + 狀態 + 開課日期）
- Email input + 確認訂閱按鈕
- 成功畫面（CheckCircle + 回到首頁）
- 檔案：
  - `src/app/(dashboard)/dashboard/physical/[id]/confirm/page.tsx`
  - `src/components/course/registration-confirm-form.tsx`

#### 3. 報名 API `POST /api/courses/register`
- 報名期間檢查（reg_start / reg_end）
- 重複報名防護
- 寫入 `registrations` 表
- 非同步發送報名確認信（Resend）

#### 4. 課前提醒 Cron `GET /api/courses/remind`
- 每日 09:00 UTC 掃描明天開課的課程
- 發送提醒 Email（Resend）給已報名且尚未提醒的用戶
- 標記 `reminder_sent = true`
- Vercel Cron 設定：`vercel.json`

### 🐛 Bug 狀態
- **無已知 Bug** — `npm run build` 通過

### ⚠️ 注意事項
- `RESEND_API_KEY` 環境變數需設定才會真的寄出 Email
- `CRON_SECRET` 環境變數需設定以保護 Cron endpoint
- 付款確認信屬 Phase 4 範圍

---

## 2026-04-07（Day 1 續）— 跨 Phase 改進

### 國碼下拉選單 + 手機號碼驗證
- 新增 `src/lib/phone.ts` — `formatPhoneE164()` + `isValidPhone()` + `COUNTRY_CODES`
- 新增 `src/components/ui/country-code-select.tsx` — 13 國/地區下拉選單
- 支援：台灣、美加、英國、德國、馬來西亞、澳洲、印尼、菲律賓、新加坡、日本、香港、澳門、大陸
- `0936923912` 和 `936923912` 都有效（自動去前導 0）
- 登入 / 註冊 / 忘記密碼 三個表單全部更新
- Server action 改用 `formatPhoneE164(phone, countryCode)`

### 註冊表單修復
- `email` schema 簡化避免 Zod v4 union 靜默失敗
- `onStep3Submit` 加 try-catch（讓 redirect 正常傳播）
- `form3.handleSubmit` 加 `onError` callback 顯示隱藏的驗證錯誤

---

## 2026-04-07（Day 1 續）— Phase 4: 金流 & 訂閱系統

### ✅ 已完成

#### 1. esafe 金流整合
- `src/lib/esafe/chkvalue.ts` — ChkValue 計算（SHA1 大寫 / SHA256 小寫）
- `src/lib/esafe/crypto.ts` — AES-256-CBC 加解密
- `src/lib/esafe/binding.ts` — 綁卡表單參數產生（Etopm.aspx）
- `src/lib/esafe/payment.ts` — Token Payment 兩步驟（Passcode → 扣款）
- 公式從 V1 完整移植：binding SHA1 / callback SHA1 / passcode SHA256 / payment SHA256

#### 2. AI 方案管理 `/dashboard/subscribe/[code]`（設計稿 10）
- 月繳/年繳 Toggle（年繳省 20%）
- 3 張方案卡片（基本/進階/Premium）+ 目前方案 badge + 推薦升級 badge
- 功能列表（✓/✗）
- 檔案：`src/components/payment/subscribe-plans.tsx`

#### 3. 付款成功頁 `/dashboard/subscribe/success`（設計稿 07）
- 訂單明細（課程/方案/金額/到期日/信箱）
- 開始上課 + 回到首頁 CTA

#### 4. 訂閱管理 `/dashboard/subscribe`（設計稿 08）
- 訂閱卡片（服務名稱 + 狀態 + 到期日 + 開始使用按鈕）
- AI 對話點數卡 + 更改方案連結

#### 5. Payment API
- `POST /api/payment/initiate` — 建立付款記錄 + 產生 esafe 表單參數
- `POST /api/payment/callback` — esafe 回調：驗證 ChkValue → 更新付款/訂閱/用戶
- 重複回調防護（已付款直接 return）

#### 6. 自動扣款 Cron
- `GET /api/subscription/auto-charge` — 每日 00:00 UTC
- 掃描到期訂閱 → Token Payment 自動續約
- 失敗重試（3 次後標記 expired）
- `vercel.json` 設定兩個 Cron（課前提醒 + 自動扣款）

---

## 2026-04-07（Day 1 續）— Phase 6: 管理後台

### ✅ 已完成

#### 1. 管理 Layout + 權限
- `src/app/(manage)/layout.tsx` — admin role 檢查（非 admin redirect 到 /dashboard）
- `src/components/manage/manage-sidebar.tsx` — 品牌色側邊欄（總覽/用戶/課程/實體課程/師資/方案/付款/設定）

#### 2. 統計總覽 `/manage`（設計稿 14）
- 4 格統計卡片（用戶數/營收/活躍用戶/本月報名）— 從 DB 即時查詢
- 營收柱狀圖
- 近期活動列表

#### 3. 用戶管理 `/manage/users`（設計稿 15）
- DataTable（暱稱/手機/方案 badge/點數/到期日/註冊時間）
- 搜尋（姓名/手機/Email）
- CSV 匯出

#### 4. 線上課程管理 `/manage/courses`（設計稿 16）
- 服務 dropdown 切換
- 左側樹狀架構（章節 + 單元）
- 新增/刪除章節、新增/刪除單元
- 單元編輯（標題 + 影片連結）
- 拖拽排序（@dnd-kit）+ 即時存 DB
- API: `GET/POST/PATCH/DELETE /api/manage/courses` + `POST /api/manage/courses/reorder`

#### 5. 實體課程管理 `/manage/physical`（設計稿 17）
- Kanban 看板（規劃中/報名中/進行中/已結束）
- 新增/編輯/刪除課程（Modal 表單：名稱/說明/費用/地點/時間/狀態/注意事項）
- 狀態改為「報名中」時：自動詢問是否 Email 通知有留信箱的會員
- API: `POST/PATCH/DELETE /api/manage/physical`

#### 6. 師資管理 `/manage/teachers`（設計稿 18）
- 左側教師列表（搜尋 + 啟用/停用 badge）
- 右側編輯器（名稱/服務/開場白/狀態/System Prompt）
- API: `PATCH /api/manage/teachers`

#### 7. 服務方案 `/manage/services`
- 方案卡片（名稱/code/描述/plans JSONB 價格）

#### 8. 付款記錄 `/manage/payments`
- DataTable（用戶/方案/金額/狀態 badge/訂單編號/時間）

#### 9. 系統設定 `/manage/settings`
- key-value 編輯器 + 儲存
- API: `PUT /api/manage/settings`

---

## 2026-04-08（Day 2）— Phase 7: 資料遷移 & 部署

### ✅ 已完成

#### 1. Vercel 部署
- V2 部署到 Vercel production
- 自訂域名 `next.nuwa.chg2asc.com`（需在 GoDaddy 加 A record → 76.76.21.21）
- 環境變數設定（Supabase URL/keys + SITE_URL）
- Vercel URL: `https://v2-eta-dusky.vercel.app`

#### 2. V1 → V2 資料遷移
- SSM Port Forwarding 隧道連線 RDS（`milk.cfsqqbum5wf2.ap-northeast-1.rds.amazonaws.com`）
- Migration script: `job/migrate_v1_to_v2.mjs`
  - 支援 `--dry-run` / `--skip-auth` / `--table=<name>`
  - UUID Mapping 自動建立
  - Gender 轉換（男性/女性 → 1/2）
  - Plan 對照（專業版→advanced / 基本版→basic）
  - Auth user 電話格式比對修復
- Verification script: `job/verify_migration.mjs`
- 遷移結果：

| 表 | V1 | V2 | 狀態 |
|---|---|---|------|
| users | 18 | 18 | ✅ |
| auth.users 一致性 | 18 | 18 | ✅ |
| services | 4 | 4 | ✅ |
| teachers | 3 | 3 | ✅ |
| chat_topics | 140 | 34 | ✅（106 trash skip） |
| chat_messages | 189 | 178 | ✅（11 屬 skip topic） |
| payments | 30 | 30 | ✅ |
| subscriptions | 18 | 17 | ✅（1 trash user） |
| physical_courses | 7 | 7 | ✅ |
| registrations | 17 | 17 | ✅ |
| system_params | 3 | 3 | ✅ |

#### 3. 遷移後修復
- Services code 改為 URL-safe（`happy` / `diamond` / `satir`）
- Services plans JSONB 補齊
- Teachers 關聯 service_id
- `next.config.ts` 加 Supabase Storage remote pattern

#### 4. AI 長期記憶系統
- `supabase/migrations/004_add_user_memory.sql` — `user_memory` 表 + RLS
- `src/lib/memory.ts`:
  - `loadUserMemory(userId)` — 載入記憶注入 system prompt
  - `extractMemories()` — 用 GPT-4o-mini 從對話提取記憶（personality/preference/relationship/goal/event）
  - 去重邏輯：相似內容更新而非重複插入
- Chat API 整合：每次對話自動載入記憶 + 非同步提取新記憶

#### 5. 頭像上傳修復
- Supabase Storage `avatars` bucket 建立 + 公開讀取 policy
- `POST /api/auth/avatar` — File → Buffer 轉換修復
- `AvatarUpload` 元件（選檔 + loading spinner + 錯誤提示）
- Profile 頁改用真實 user data

#### 6. 品牌更新
- Logo 全站更換為「羽升幸福養成學苑」鳳凰 Logo
  - 建立 `src/components/ui/logo.tsx` 共用元件（default / white 兩種 variant）
  - Header / Footer / Login / Register / Forgot Password / Manage Sidebar 全部更新
- Favicon 從 V1 複製
- 網站名稱「女媧 NUWA」→「羽升幸福養成學苑」（全站 24 檔案）
- Email 發信人改為 `羽升幸福養成學苑 <noreply@chg2asc.com>`
- 所有 `nuwa.com.tw` 域名改為 `chg2asc.com`

#### 7. 法律條款搬遷
- `/terms` 使用條款 — V1 完整法律文本搬入（用戶交易條款/付款/權利/授權/實體課程/AI訂閱/第三方規範）
- `/privacy` 隱私政策 — V1 完整法律文本搬入（隱私聲明/Cookie/個資授權/蒐集目的/會員權利）
- `/refund` 退款政策 — V1 完整法律文本搬入（實體課程退款/AI訂閱退款/退款方式/申請流程）
- 註冊頁「服務條款」「隱私政策」「退費政策」加 hyperlink（target=_blank 開新分頁）

### 🐛 Bug 修復
- **首頁 500 Server Error** — V1 遷移後 services code 含中文 + plans 空字串 + teachers 無 service_id
- **Avatar 上傳失敗** — File object 在 server 環境需轉 Buffer
- **外部圖片 400** — next.config 需設定 Supabase Storage remote pattern
- **gender 驗證失敗** — V1 存「男性/女性」字串，V2 需 SMALLINT，migration 加轉換
- **auth user 比對失敗** — listUsers phone 格式不含 `+`，改用 digits 比對
- **註冊 gender 欄位** — schema 改 `z.string().optional()`，submit 時才轉 Number
- **register action 用 signUp 失敗** — 改用 `admin.createUser` + `phone_confirm: true`

---

## 📋 下次開始時的優先清單（2026-04-09 更新）

### 待處理
1. ~~DNS 設定~~ ✅（已用 CNAME 指向 Vercel，HTTPS 已取得）
2. **環境變數補齊** — OPENAI_API_KEY / ESAFE 正式金鑰 / RESEND_API_KEY / CRON_SECRET
3. **esafe callback URL 更新** — 在 esafe 後台改為 Vercel domain
4. **測試計畫執行** — `docs/TEST_PLAN.md`（141 個測試項目）
5. ~~Vercel Git 自動部署~~ ✅ 已連結 GitHub `jeff5242/nuwa`，Root Directory = `v2`，Production Branch = `master`，push 自動部署

### 已完成功能（2026-04-08 session）
- ~~深色模式~~ ✅ ThemeProvider + Header 切換按鈕，CSS light/dark 雙主題
- ~~影片播放器~~ ✅ VideoPlayer 元件，已整合學習 Dashboard
- ~~章節拖拽排序~~ ✅ dnd-kit SortableChapterList + API reorder
- ~~Logo 反白修復~~ ✅ 移除白底改透明
- ~~/manage/services 500~~ ✅ plans 字串型別 JSON.parse fallback
- ~~/courses 列表頁~~ ✅ 新建課程總覽頁
- ~~FAQ 常見問題~~ ✅ 4 大類 15 題 + Footer 連結
- ~~師資重複~~ ✅ dedup 刪除 3 筆
- ~~實體課程重複~~ ✅ 刪除 7 筆 + 17 筆重複 registrations
- ~~實體課程狀態~~ ✅ V1 狀態值修正 + 自動 class_end 判斷
- ~~管理後台入口~~ ✅ AdminBanner 首頁 + Header 手機版
- ~~/about/payment~~ ✅ redirect 到 /refund
- ~~課程封面圖~~ ✅ 從 V1 S3 補回 + 後台上傳功能
- ~~services.ts .single()~~ ✅ 改 .maybeSingle()

### 接續指令
```bash
cd /Users/jef/CodeRepository/nuwa/v2
npm run dev
# 部署：git push github master（V2 Vercel 自動部署；V1 EB paths-ignore 不受影響）
```

---

## 🔄 新對話 Context 快照（2026-04-09）

> 開新 session 時貼給 Claude，可快速銜接進度。

```
## NUWA V2 — Context 快照（2026-04-09）

### 專案狀態
- 分支：master（github remote，Vercel Git 自動部署）
- 技術棧：Next.js 16 + Supabase + Tailwind v4 + Shadcn UI
- 線上：https://next.nuwa.chg2asc.com
- 進度紀錄：v2/DEV_LOG.md

### 上次 session 完成（2026-04-08，共 6 commits）
1. 深色模式（ThemeProvider + toggle）
2. Bug 修復：Logo 反白、/manage/services 500、/courses 404、.single() crash
3. FAQ 常見問題頁（/faq，4 類 15 題）
4. 首頁 AdminBanner + Header 手機版管理入口
5. /about/payment → redirect /refund
6. DB 清理：teachers 3 筆重複、physical_courses 7 筆 + 17 筆 registrations 重複
7. 實體課程狀態：V1 值修正 + class_end 自動判斷 completed
8. 課程封面圖：從 V1 S3 補回 + 後台上傳功能（/manage/services）

### 下次優先
1. 環境變數補齊 — OPENAI_API_KEY / ESAFE 正式金鑰 / RESEND_API_KEY / CRON_SECRET
2. esafe callback URL 更新 — 後台改為 Vercel domain
3. 測試計畫執行 — docs/TEST_PLAN.md（141 項）
4. ~~Vercel Git 自動部署~~ ✅ 已設定完成

### 重要提醒
- 部署只動 V2，V1 EB 有 paths-ignore 保護
- V2 Vercel 自動部署：push master 自動觸發（Root Directory = v2）
- 讀 v2/DEV_LOG.md 可取得完整歷程
- 讀 v2/AGENTS.md — Next.js 16 有 breaking changes，寫碼前先讀 node_modules/next/dist/docs/
```

---

## 全部路由總覽（45+ 個）

### 公開頁面
| 路由 | 用途 |
|------|------|
| `/` | 首頁（Supabase 即時查詢 + V1 品牌素材） |
| `/login` | 登入（國碼下拉） |
| `/register` | 註冊（四步驟 + 條款 hyperlink） |
| `/forgot-password` | 忘記密碼 |
| `/about` | 關於我們（師資/願景/歷程） |
| `/courses/[code]` | 課程詳情 |
| `/courses/[code]/physical/[id]` | 實體課程詳情 |
| `/privacy` | 隱私政策（V1 法律文本） |
| `/terms` | 使用條款（V1 法律文本） |
| `/refund` | 退款政策（V1 法律文本） |
| `/faq` | 常見問題（4 類 15 題） |
| `/courses` | 課程總覽列表 |
| `/about/payment` | redirect → /refund |

### Dashboard（需登入）
| 路由 | 用途 |
|------|------|
| `/dashboard` | 首頁（快捷入口） |
| `/dashboard/profile` | 個人資料（頭像上傳 + 真實資料） |
| `/dashboard/password` | 密碼變更 |
| `/dashboard/service/[code]` | 三欄學習 Dashboard + AI 對話 + 長期記憶 |
| `/dashboard/physical/[id]/confirm` | 報名確認 |
| `/dashboard/subscribe` | 訂閱管理 |
| `/dashboard/subscribe/[code]` | 方案選擇（月繳/年繳） |
| `/dashboard/subscribe/success` | 付款成功 |

### 管理後台（需 admin）
| 路由 | 用途 |
|------|------|
| `/manage` | 統計總覽 |
| `/manage/users` | 用戶管理（DataTable + CSV 匯出） |
| `/manage/courses` | 線上課程（樹狀架構 + 拖拽排序） |
| `/manage/physical` | 實體課程（Kanban + Email 通知） |
| `/manage/teachers` | 師資管理（System Prompt 編輯） |
| `/manage/services` | 服務方案 |
| `/manage/payments` | 付款記錄 |
| `/manage/settings` | 系統設定 |

### API（19 個）
| 路由 | 用途 |
|------|------|
| `POST /api/auth/sms/send` | SMS 發送 |
| `POST /api/auth/sms/verify` | OTP 驗證 |
| `PATCH /api/auth/profile` | 個人資料更新 |
| `POST /api/auth/avatar` | 頭像上傳 |
| `POST /api/chat` | AI 串流對話（含長期記憶） |
| `GET/POST /api/chat/topics` | 話題列表/建立 |
| `GET/PATCH/DELETE /api/chat/topics/[id]` | 話題 CRUD |
| `POST /api/courses/register` | 報名 |
| `GET /api/courses/remind` | 課前提醒 Cron |
| `POST /api/payment/initiate` | 發起付款 |
| `POST /api/payment/callback` | esafe 回調 |
| `GET /api/subscription/auto-charge` | 自動扣款 Cron |
| `GET/POST/PATCH/DELETE /api/manage/courses` | 課程 CRUD |
| `POST /api/manage/courses/reorder` | 單元排序 |
| `POST/PATCH/DELETE /api/manage/physical` | 實體課程 CRUD |
| `PATCH /api/manage/teachers` | 教師更新 |
| `PUT /api/manage/settings` | 系統設定更新 |
| `POST /api/manage/services/banner` | 服務方案封面圖上傳 |

---

## DB 表總覽（18 張）
| 表 | 用途 | RLS |
|---|------|-----|
| users | 用戶 | 自己讀寫 |
| services | 服務/課程 | 公開讀 |
| teachers | 教師 | 公開讀 |
| courses | 線上課程 | 公開讀 |
| subjects | 章節 | 公開讀 |
| units | 單元 | 公開讀 |
| physical_courses | 實體課程 | 公開讀 |
| registrations | 報名 | 自己讀寫 |
| subscriptions | 訂閱 | 自己讀 |
| payments | 付款 | 自己讀 |
| chat_topics | 對話主題 | 自己 CRUD |
| chat_messages | 對話訊息 | 透過 topic 間接 |
| ai_token_usage | Token 用量 | 自己讀 |
| sms_verifications | SMS 驗證 | 僅 service_role |
| system_params | 系統參數 | 公開讀 |
| user_unit_progress | 觀看進度 | 自己讀寫 |
| notifications | 通知 | 自己讀+更新 |
| user_memory | AI 長期記憶 | 自己讀 |

---

## 參考文件
- V2 規格書：`docs/NUWA_V2_SPEC.md`
- 開發計畫：`docs/NUWA_V2_DEV_PLAN.md`
- 測試計畫：`docs/TEST_PLAN.md`（141 個測試項目）
- UI 設計稿：`docs/design/`
- Migration script：`job/migrate_v1_to_v2.mjs`
- Verification script：`job/verify_migration.mjs`
