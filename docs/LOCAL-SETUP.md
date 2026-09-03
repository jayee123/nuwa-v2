# 本機開發環境設定（公版 nuwa）

公版的本機設定比私版單純很多 —— 只有 4 個環境變數，
23 支 migration 在乾淨的 PostgreSQL 15 上實測全數通過。

要與私版一起做整合開發，見最後一節。

---

## 0. 需要準備的東西

| | 說明 |
|---|---|
| Node.js | 版本見 `package.json` |
| 一個 Supabase project | **用你自己的**，不要連公司正式站 |

---

## 1. 建立資料庫

在 Supabase SQL Editor 把 `supabase/migrations/` 的 23 支 SQL
**依編號順序**執行。這些會建立 `public` schema 的全部內容。

`supabase/seed.sql` 是基礎課程與教師的假資料，可選擇性執行。

---

## 2. 設定環境變數

複製 `.env.example` 成 `.env.local`。

> 📌 **程式實際會從環境變數讀的只有 4 個。**
>
> 金流（`ESAFE_*`）、簡訊（`SMS_API_KEY`）、Email（`RESEND_API_KEY`）、
> 排程金鑰（`CRON_SECRET`）**不是環境變數** —— 它們存在資料庫，
> 由後台 `/manage` 的系統參數頁管理，程式透過 `getSecretParam()` 讀取。
>
> 舊版的 `.env.example` 曾經列出這些，照著填只會白忙一場。現已修正。

| 變數 | 必要性 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 必填 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 必填 |
| `SUPABASE_SERVICE_ROLE_KEY` | 必填（🚨 繞過所有 RLS） |
| `NEXT_PUBLIC_SITE_URL` | 必填，本機設 `http://localhost:3000` |

`SETUP_SECRET` / `SUPERADMIN_PHONE` / `SUPERADMIN_PASSWORD` 只有在要用
`/api/setup/superadmin` 建立第一個超級管理員時才需要，建完可以拿掉。

---

## 3. 啟動

```bash
npm install
npm run dev
```

---

## 4. 測試

```bash
npx playwright test -c playwright.e2e.config.ts
```

> ⚠️ 測試預設打 `localhost:3000`。若該 port 被其他專案佔用，
> 用 `E2E_BASE_URL` 指到實際的 port，例如：
>
> ```bash
> E2E_BASE_URL=http://localhost:3100 npx playwright test -c playwright.e2e.config.ts
> ```
>
> 曾經有一次 15 支測試全紅，原因就是 port 3000 被另一個專案佔住、
> dev server 根本沒起來，測試全打到別的 app 上。先確認 port 再查測試。

---

## 5. 與私版一起跑（整合開發）

兩個都是 Next.js，預設都搶 3000，要分開：

```bash
# 終端機 A — 公版
cd nuwa/v2 && PORT=3000 npm run dev

# 終端機 B — 私版
cd nexthappy && PORT=3001 npm run dev
```

兩邊各自加上這組環境變數，讓 SSO 在本機互相找得到：

| repo | 變數 | 值 |
|---|---|---|
| 公版 | `DEV_APP_URL_HAPPY` | `http://localhost:3001` |
| 私版 | `NEXT_PUBLIC_MARKET_BASE_URL` | `http://localhost:3000` |

### 為什麼需要 `DEV_APP_URL_HAPPY`

SSO 的目標網址存在資料庫（`apps.app_url`），指向正式站的 App。
本機把兩邊都跑起來時，公版會把人送去正式站而不是你的 localhost。

> 🚨 **不要為了讓本機通而去改 `apps.app_url`。**
> 那一欄是正式站 SSO 的目標 —— 改了會讓所有真實用戶被導去你的 localhost。

因此 `src/app/api/apps/[slug]/launch/route.ts` 支援環境變數覆寫，
命名規則是 `DEV_APP_URL_<SLUG 大寫>`。

它有兩道鎖：

1. `NODE_ENV === 'production'` 時一律讀資料庫
   （Vercel 的 production 與 preview 都算 production，正式站沒有繞過的可能）
2. 沒設變數時落回資料庫原值

所以正式站的行為與加這段之前完全相同。

---

## 疑難排解

| 症狀 | 原因 |
|---|---|
| 測試大量失敗 | port 3000 被其他專案佔用，見第 4 節 |
| SSO 導向正式站而非本機私版 | 沒設 `DEV_APP_URL_HAPPY` |
| 照 `.env.example` 填了金流／簡訊卻無效 | 那些不是環境變數，在後台系統參數頁 |
