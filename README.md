# Nuwa V2 — 羽升幸福養成學苑

> Next.js 16 + Supabase + Tailwind CSS v4 + Vercel

線上網址：https://next.nuwa.chg2asc.com

---

## 技術棧

| 層級 | 技術 |
|------|------|
| 框架 | Next.js 16（App Router + Turbopack） |
| 語言 | TypeScript |
| 資料庫 | Supabase（PostgreSQL + Auth + Storage + RLS） |
| 樣式 | Tailwind CSS v4 + Shadcn UI |
| AI | OpenAI GPT-4o-mini + Vercel AI SDK |
| 表單 | react-hook-form + zod |
| 金流 | 紅陽 esafe（綁卡 + Token Payment） |
| 動效 | framer-motion |
| 拖拽 | @dnd-kit |
| 部署 | Vercel（Git 自動部署） |

---

## 本機開發

```bash
cd v2
cp .env.example .env.local   # 填入 Supabase URL / keys
npm install
npm run dev                   # http://localhost:3000
```

---

## 部署

`git push github master` → Vercel 自動部署（Root Directory = `v2`）

V1 的 GitHub Actions 有 `paths-ignore: v2/**`，互不干擾。

---

## 目錄結構

```
src/
├── app/
│   ├── (public)/          公開頁面（登入、註冊、課程、FAQ、法律條款）
│   ├── (dashboard)/       會員中心（需登入）
│   ├── (manage)/          管理後台（需 admin 角色）
│   └── api/               API Routes（auth, chat, payment, manage）
├── components/
│   ├── ui/                通用 UI（Button, Card, Dialog, Input...）
│   ├── layout/            Header, DashboardSidebar
│   ├── course/            CourseCard, VideoPlayer, UnitList...
│   ├── dashboard/         ProfileForm, AvatarUpload, StatsCard...
│   ├── manage/            CourseEditor, UserTable, PhysicalKanban...
│   └── providers/         AuthProvider, ThemeProvider
├── lib/
│   ├── supabase/          client / server / admin / middleware
│   ├── esafe/             金流（binding, payment, crypto, chkvalue）
│   ├── sms/               簡訊（milkidea）
│   ├── roles.ts           角色判斷
│   ├── phone.ts           電話格式轉換
│   └── memory.ts          AI 長期記憶
└── middleware.ts           路由保護（/dashboard, /manage）
```

---

## Supabase

- 專案：`nuwa-v2`（Tokyo）
- Reference ID：`jjnmkhpqrmnnaqxhyfcy`
- 18 張資料表，全部啟用 RLS
- 三種 Client：Browser（anon key）、Server（cookie）、Admin（service_role，繞過 RLS）
- Migration 檔：`supabase/migrations/`

---

## 相關文件

| 文件 | 說明 |
|------|------|
| [DEV_LOG.md](DEV_LOG.md) | 詳細開發日誌（路由表、DB 表、API 清單） |
| [docs/TEST_PLAN.md](docs/TEST_PLAN.md) | 測試計畫（141 項） |
| [AGENTS.md](AGENTS.md) | AI 輔助開發注意事項 |
| [../DEVELOPER.md](../DEVELOPER.md) | V1 + V2 合併開發歷史 |
| [../DEPLOY.md](../DEPLOY.md) | V1 AWS EB 部署指南 |
