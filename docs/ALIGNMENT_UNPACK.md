# 「我卡住幫我拆」功能對齊說明

> 版本：v2.0（2026-05-28）
> 對應 SPEC：`v2/docs/SPEC_STUCK_UNPACK.md`
> 對應分支：`feature/stuck-unpack`
> 參考來源：`v2/reference/happy-relationship-app/docs/` (git submodule)

---

## 1. 與 Steven 原始產品架構的精確對齊

### 1.1 升維 Stack — 我們做的是 L1 入口

Steven 在 `positioning-v0.4-升維-stack.md` §2 定義了四層架構：

```
L4 — 自力 + 自我實現
L3 — 心智成長 7 階段
L2 — domain-specific 工具（4S 高情商溝通 / 觀感想行）
L1 — 入口：immediate pain solve ← 我們做的就是這一層
     「我卡住，幫我拆」（user 帶當下困擾來）
     → 一針見血診斷 + 一個今晚就能做的具體 action
```

**對齊：** 我們的 `/api/unpack` + `/dashboard/practice/unpack` = **L1 入口的技術實作**。
Steven 原文（§2）：「不可跳層——跳過 L1 直接給 L4 = 漂浮 spirituality」，所以 unpack 必須先存在，才能把 user 往 L2（21 天課程）帶。

### 1.2 雙模式設計 — 對應 v2.1-course-spec §6 + §13

Steven 在 `v2.1-course-spec.md` §6「互動模式設計（Dual Mode）」和 §13「Mode 2 與諮詢師對話」定義了：

| Steven 的定義 | 章節 | 我們的實作 |
|---|---|---|
| **Mode 1**：21 天刻意練習（Learner 姿態）| §6 | 既有 `/api/chat` + `/dashboard/service/happy` |
| **Mode 2**：與諮詢師對話（Consumer 姿態）| §13 | **新建 `/api/unpack`** + `/dashboard/practice/unpack` |

Steven 在 §13.1.2 明確指出：

> 「Mode 1 + Mode 2 = **同一個 User 的兩種使用姿態**，不是兩個產品。」

| 維度 | Mode 1（既有）| Mode 2（我們新做的）|
|---|---|---|
| 目的 | 養成肌肉記憶（學 + 練 + 回）| 解決急迫困擾（拆解 + 給建議）|
| 受眾姿態 | Learner | Consumer |
| 時間結構 | 21 天連續節奏 | 隨時觸發、按次計算 |
| 共用基礎 | **同一個 User、同一套 state 記憶、同一品牌 voice** |

### 1.3 三 State 流程 — 對應 §13.3

Steven 在 §13.3 定義了 Mode 2 的三個 State（A/B/C），根據 User 在 Mode 1 的進度決定行為：

| Steven §13.3 | 條件 | 諮詢師行為 | 我們的 stage 對應 |
|---|---|---|---|
| **State A** | Mode 1 還沒開始 | 案例分析 + 8 維度診斷 + **軟性導入 21 天** | → `plain` + `probe` stage |
| **State B** | Mode 1 進行中 | 用已學技能拆案 + 預告未學 | → 未來擴充（需讀 journey 進度）|
| **State C** | Mode 1 已完成 | 跳過教學 + 盲點打地鼠 | → 未來擴充 |

**目前實作狀態：** 我們先做了 State A 的完整流程（最多 user 的情境），State B/C 待 Phase 3。

### 1.4 軟性導入 — 精確對齊 §13.3.A + §1.13

Steven 在 §13.3.A 給了軟性導入的範本：

> 「（觀）你帶來的這個案例，主要落在 W2.感 + W2.行 兩個盲點。
> （感）這種一個人扛、又得不到回應的感覺，確實很累。
> （想）你需要的可能不只是這一次的答案，而是把這套拆解變成自然反應。
> （行）**有興趣可以開始 21 天課程，沒興趣這次幫你解就好——你決定，沒有壓力。**」

我們的 `lead` stage 實作了這個邏輯：

```typescript
// lib/unpack/prompts.ts — lead stage
`本輪可以自然提到「如果你想長期練習，把這變成習慣，可以考慮 21 天的系統練習」。
但不要強迫，依然以解決當下問題為主。`
```

**對齊 §1.13 Brand Integrity**：不強推、不催促、給選擇權。

---

## 2. 引用的核心模式（精確來源）

### 2.1 三步心法 → 來自 §13.5 諮詢師 voice + positioning §5

| 心法步驟 | Steven spec 來源 | 實作位置 |
|---|---|---|
| 1. **接住情緒** | §13.5.4「接情緒前置」+ §5.2「可驗證的行為輸出」| `buildUnpackPrompt()` 的 base prompt |
| 2. **打破認知** | §13.5.4「反問引導」+ §1.2.5.4「建立元認知」| prompt 中的「從對方行為猜測內心需求」|
| 3. **行動建議** | positioning §2 L1「一個今晚就能做的具體 action」| prompt 中的「具體、今晚就能做到」|

### 2.2 漸進揭露 Stage → 來自 positioning §2「不可跳層」

| 我們的 stage | 對應升維 Stack | Steven 原則 |
|---|---|---|
| `plain`（第 1 輪）| L1 — 接住痛點 | 「funnel 由下往上，每個 user 從 L1 進來」|
| `probe`（第 2-3 輪）| L1 → L2 過渡 | 推測個性傾向（不講 MBTI 四字）|
| `lead`（第 4 輪起）| L2 導入 | 「軟性導入 21 天課程」（§13.3.A）|

**為什麼不直接講 MBTI：** Steven §5.3 deny list 明確規定，L1 對 user 層面不直白講修行/覺醒等術語。我們延伸這個原則——unpack 的 plain/probe stage 不講「MBTI」四字，改用「個性傾向」。

### 2.3 動態三選項 → 來自 positioning §9「Lead & Probe 3-Step funnel SOP」

Steven 在 positioning §9 描述了底層共用架構：

> 「Lead & Probe 3-Step funnel SOP（Step 1 一針見血 / Step 2 A/B / Step 3 ①②③ deep paths）」

我們的三選項就是 Step 2 的 A/B/C 分支：

| Stage | 選項 A | 選項 B | 選項 C |
|---|---|---|---|
| plain | 試了再回來 | 教我一句話 | 深入了解 |
| probe | 試了再回來 | 其他問題 | 看 MBTI 分析 |
| lead | 開始 21 天 | 再聊聊 | 先不用 |

### 2.4 諮詢師 voice → 來自 §13.5「Meet the Moment」

Steven 在 §13.5.3 拍板：

> 「**不鎖定任何金句模板**——不可以 prompt 諮詢師每次都講某種金句。諮詢師會看 User 當下需要什麼語氣動態調整。假深度 = 廉價感悟 = 傷品牌。」

我們的 prompt 設計遵守這點：
- 不放固定金句模板
- 用「像懂 MBTI 的閨蜜，不是諮詢師」的口吻指引
- 100-200 字，不用 markdown，純文字

### 2.5 Brand Voice → 來自 positioning §5 deny/allow list

| Steven 的規定 | 我們的遵守 |
|---|---|
| **Deny**：修行、業力、覺醒、高我、能量、頻率 | prompt 中完全不出現這些詞 |
| **Allow**：練習、覺察、反思、刻意練習、心智成長 | prompt 用「個性傾向」「一句話」描述 |
| **核心**：可驗證、可重複、接地氣、去神秘化 | 每輪回覆都有「今晚就能做」的具體 action |

### 2.6 Unpack → Journey 銜接 → 來自 §13.2 共用 User State

Steven §13.2.2：

> 「單一資料源：兩 Mode 共讀共寫同一份 user_state，不可分庫。」

我們的實作：
- 兩 Mode 共用 `chat_topics`（用 `mode` 欄位區分）
- `fromTopicId` 銜接：unpack 的 `unpack_context` → journey 的初始設定
- 同一個 `users` 表、同一個 `user_memory` 表

---

## 3. 設計哲學對齊 — §1.2.5 Critical Few + 慢就是快

### 3.1 Critical Few（關鍵且正確的少數）

Steven §1.2.5.1：「聚焦於 user 內心深層的渴望，用精準的少數帶來超出預期的體驗。」

| 原則 | 我們的遵守 |
|---|---|
| 每天 1 個 takeaway，不超載 | unpack 每輪只給一個行動建議 |
| 不堆 Advanced/Master 內容 | 先做 State A（未開始 Mode 1 的 user），不急著做 B/C |
| must-do vs nice-to-have | Phase 1 只做核心 API + 對話，不做遊戲化/徽章 |

### 3.2 慢就是快

Steven §1.2.5.2：「產品開發節奏 + 用戶刻意練習節奏，都不急。」

| 原則 | 我們的遵守 |
|---|---|
| spec → self-test → patch | 先寫 SPEC → Migration → API → E2E 測試 → 再做前端 |
| 不催促、不 FOMO | lead stage「不要強迫，依然以解決當下問題為主」|
| 寧可慢，不亂 | Phase 分 4 期，本期只做 Phase 1+2 |

### 3.3 對抗的人性弱點（§1.2.5.3）

Steven 列出的弱點 vs 我們的設計反制：

| 弱點 | 我們的反制 |
|---|---|
| **急於求成** | 漸進揭露 stage（不一開始就推課程）|
| **貪多貪快** | 每輪只一個核心建議 |
| **流於表面** | probe stage 追問細節，不停留在表面安慰 |

---

## 4. 資料庫與 API 設計邏輯

### 4.1 共用 chat_topics → 對齊 §13.2「單一資料源」

```
chat_topics (既有)
  + mode: 'free' | 'unpack' | 'journey'
  + unpack_context: JSONB
```

Steven §13.2.2 要求「不可分庫」，所以我們加 `mode` 欄位在同一張表，不新建表。

### 4.2 獨立 API endpoint → 對齊 §13.5「諮詢師 voice ≠ Tutor voice」

Steven §13.5.2 明確區分：

| 維度 | Mode 1 Tutor（/api/chat）| Mode 2 諮詢師（/api/unpack）|
|---|---|---|
| 教學風格 | 多 ✅❌ list、多檢核 | 少結構化、多反問、多傾聽 |
| 情緒處理 | 偏知識傳遞 | 偏接住情緒、共振、慢一拍 |
| 對話長度 | 較短（指令明確）| 較長（深度展開）|

兩個 Mode 的 prompt 邏輯差異大，所以分開 endpoint 是正確的。

---

## 5. 前端路徑設計

```
/dashboard                          ← 既有會員中心（加了「我卡住幫我拆」入口）
/dashboard/practice                 ← 新的練習專區（Mode 1 + Mode 2 入口）
/dashboard/practice/unpack          ← Mode 2：我卡住幫我拆
/dashboard/service/happy            ← Mode 1：21 天刻意練習（不動）
```

遵守 Steven 的開發規則：
- 不動 `/chat`、`/onboarding`、`/settings`
- 不動 `buildContext.ts`
- 在自己的範圍（`/dashboard/practice/*`）工作

---

## 6. 尚未實作 — 未來對齊項目

以下是 Steven spec 中定義但本期未實作的部分（標記為未來 Phase）：

| Steven spec | 內容 | 計畫 |
|---|---|---|
| §13.3.B State B | Mode 1 進行中的諮詢行為 | Phase 3：讀 journey 進度，用已學技能拆案 |
| §13.3.C State C | Mode 1 完成後的 reinforcement | Phase 3：跳過教學，盲點打地鼠 |
| §13.4 跨案例橋接 | 案例間的個人情境連結 | Phase 3：需 cross_mode_bridges 資料結構 |
| §13.6 Long-term memory | 跨 session 跨 Mode 記憶 | 既有 `user_memory` 已部分支援，需擴充 |
| §7 盲點偵測機制 | 8 維度盲點地圖 | Phase 3：需 identified_blindspots 欄位 |
| §13.1.3 三層定價 | 學費版 / 諮詢版 / 完整版 | 待 positioning v0.3 細化 |

---

## 7. 總結

### 做了什麼（對應 Steven spec 章節）：

| 實作項目 | 對應 Steven spec |
|---|---|
| Migration 008 | §13.2 共用 User State + §8 Schema Changes |
| POST /api/unpack | §13 Mode 2 + §6 Dual Mode |
| lib/unpack/prompts.ts | §13.5 諮詢師 voice + positioning §5 Brand Voice |
| lib/unpack/options.ts | positioning §9 Lead & Probe 3-Step SOP |
| POST /api/journey + fromTopicId | §13.3.A 軟性導入 + §13.2 共用記憶 |
| /dashboard/practice | positioning §2 L1 入口 |
| Dashboard 首頁入口 | positioning §3 產品 1 funnel |

### 沒動什麼（遵守開發規則）：
- `/api/chat` 既有 Mode 1 邏輯
- `buildContext.ts`（規則 3）
- `/chat`、`/onboarding`、`/settings`（規則 4）
- 任何 production 分支（規則 1）

---

*參考文件位置：`v2/reference/happy-relationship-app/docs/`（git submodule）*
*本文件可作為與客戶溝通的技術說明依據。*
