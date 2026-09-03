# 開發說明：「智慧陪伴 — 我卡住幫我拆」擴充

> 版本：v0.1（2026-05-27）
> 目標：在 nuwa v2 既有架構上擴充「智慧陪伴 21 天刻意練習」服務說明會議所討論的功能。
> 沿用既有 `users` 會員系統、Supabase Auth、Vercel AI SDK chat 串流、`journeys` + `daily_records` 21 天框架。

---

## 1. 背景與目標

### 1.1 商業目標（來自服務說明會議）

設計兩階段使用者旅程：

1. **引流體驗** — 「我卡住幫我拆」chatbot：陌生訪客從 FB 廣告/影片進來，丟出親子或關係問題，AI 用 **接住情緒 → 打破認知 → 行動建議** 三步回應，並動態提供三個延伸選項把使用者引導到下一階段
2. **付費會員** — 「21 天刻意練習」課程旅程（既有 `journeys`）：建立穩定練習習慣，最終養成 4S 高情商溝通能力

兩者在資料層共享同一個會員、同一個對話訊息表，但**對話模式（mode）不同**。

### 1.2 與既有系統的關係

| 既有 | 新增/調整 |
|---|---|
| `chat_topics` + `chat_messages` 既有對話結構 | **沿用**，`chat_topics` 加 `mode` 與 `unpack_context` 欄位 |
| `journeys`（21 天）已支援 couple / parent_child / workplace | **沿用**，未來可加 `cycle_length`（7／14／21）支援多週期 |
| `daily_records`、`daily_memories` | **沿用**，無變更 |
| `user_memory`（personality/preference/relationship/goal/event）| **沿用**，`unpack` 模式也會觸發 `extractMemories` |
| `/api/chat`（已支援 journey context 注入）| **擴充**，新增 `unpack` 模式分支 |
| `(manage)/conversations` 後台 | **擴充**，依 mode 過濾、支援以「任務」為單位查看 |

---

## 2. 範圍與不在範圍

### In Scope（本期）
- 「我卡住幫我拆」對話模式（unpack mode）
- 動態三選項引導機制（plain / probe / lead）
- 任務分組（一個會員可有多個 unpack session，每個獨立 context）
- 後台依「會員 → 任務 → 對話」三層瀏覽
- 自肉性行銷的 system prompt 工程化（漸進揭露 MBTI / 4S）
- 6 月補課測試專用旗標（feature flag）

### Out of Scope（延後）
- 弘揚（esafe）金流改動：本期使用者一律以**測試帳號**進入，付款流程沿用既有 `/dashboard/subscribe`
- 課程影片、實體課程：先停用既有舊版引流影片入口
- Duolingo 級遊戲化機制（聲光、徽章系統）：本期只做 3／7／14／21 天里程碑加分（既有 `day/route.ts` 已實作 milestonePoints）
- 7 天 × 3 週期重構：本期只在 `journeys` 加 `cycle_length` 欄位，UI 仍走 21 天

---

## 3. 資料庫變更

### 3.1 新增 Migration `supabase/migrations/008_add_unpack_mode.sql`

```sql
-- chat_topics 擴充：支援多模式對話
ALTER TABLE chat_topics
  ADD COLUMN mode VARCHAR(20) DEFAULT 'free',
  -- free: 通用對話（既有）
  -- unpack: 我卡住幫我拆（引流體驗）
  -- journey: 21 天 journey 對應對話
  ADD COLUMN journey_id UUID REFERENCES journeys(id) ON DELETE SET NULL,
  ADD COLUMN day_number INTEGER,
  -- unpack 模式的結構化上下文
  ADD COLUMN unpack_context JSONB,
  -- 範例 unpack_context：
  -- {
  --   "relationship_type": "parent_child",
  --   "partner_role": "兒子",
  --   "partner_age": 14,
  --   "partner_mbti_guess": "ISTJ",
  --   "partner_mbti_confidence": "guess",
  --   "problem_summary": "兒子玩手機關門絕食",
  --   "stage": "plain"
  --   -- plain（已給接情緒+認知+行動）/ probe（追問中）/ lead（提供 MBTI 後深入）
  -- }
  ADD COLUMN ended_at TIMESTAMPTZ;
  -- unpack session 是否結束（使用者選了「完成」或 7 天未回）

CREATE INDEX idx_chat_topics_user_mode ON chat_topics(user_id, mode);
CREATE INDEX idx_chat_topics_journey ON chat_topics(journey_id) WHERE journey_id IS NOT NULL;

-- journeys 擴充：支援週期長度（為未來 7×3 預留）
ALTER TABLE journeys
  ADD COLUMN cycle_length INTEGER DEFAULT 21,
  -- 21 / 14 / 7
  ADD COLUMN total_cycles INTEGER DEFAULT 1;
  -- 1 / 2 / 3（例：cycle_length=7, total_cycles=3 即為 7 天 × 3 週期）

-- RLS：unpack mode 仍走 chat_topics 既有 policy（user_id 自有）
-- 無需新增 policy

-- 系統參數：feature flags
INSERT INTO system_params (key, value) VALUES
  ('unpack_mode_enabled', 'true'),
  ('unpack_mvp_relationship_types', 'parent_child'),  -- 第一階段只開親子
  ('unpack_max_turns_before_lead', '4')  -- 對話幾輪後開始推 21 天 journey
ON CONFLICT (key) DO NOTHING;
```

### 3.2 既有表異動小結

| 表 | 異動 | 風險 |
|---|---|---|
| `chat_topics` | +4 欄（mode, journey_id, day_number, unpack_context, ended_at）| 低，全部有 DEFAULT |
| `journeys` | +2 欄（cycle_length, total_cycles）| 低，全部有 DEFAULT |
| `system_params` | 新增 3 個 key | 低 |

無需 down migration（純加欄位）。

---

## 4. API 規格

### 4.1 新增：`POST /api/unpack`

啟動或繼續一個「我卡住幫我拆」對話。

```typescript
// src/app/api/unpack/route.ts

interface UnpackRequest {
  topicId?: string  // 若有 = 繼續，無 = 新開
  message: string   // 使用者輸入
  // 第一次呼叫時可選擇性提供
  relationshipType?: 'couple' | 'parent_child' | 'workplace'
  partnerNickname?: string
}

interface UnpackResponse {
  topicId: string
  reply: string         // AI 串流回覆（接情緒 + 認知 + 行動）
  options: UnpackOption[]  // 三個動態選項
  stage: 'plain' | 'probe' | 'lead'
  suggestJourney?: {    // 達到引導條件時
    relationshipType: string
    cta: string         // "想要 21 天系統練習嗎？"
  }
}

interface UnpackOption {
  id: 'try' | 'one_liner' | 'mbti' | 'continue'
  label: string         // 例："試了再回來告訴我結果"
  prompt?: string       // 若使用者選此，下次 message 預填值
}
```

**核心邏輯：**

1. 從 `chat_topics.unpack_context` 讀目前的 stage 與 partner 資訊
2. 根據 stage 與 message 內容，呼叫 OpenAI（gpt-4o-mini）產生回覆 + 下一個 stage 判斷
3. 串流回覆寫入 `chat_messages`，並更新 `unpack_context`
4. 達到 `unpack_max_turns_before_lead` 或 stage = 'lead'：回傳 `suggestJourney` 引導到 `/api/journey`

**為何不直接擴充 `/api/chat`：**
- `/api/chat` 已綁定 journey context 注入邏輯，混入 unpack 會讓 system prompt 構建變複雜
- unpack 需要回傳結構化 `options` 與 `suggestJourney`，與 chat 純文字串流的回傳介面不同
- 後續打磨時改 unpack prompt 不會影響既有 journey 對話

### 4.2 擴充：`GET /api/chat/topics`

新增 query：`?mode=unpack|journey|free`，預設為 `free`。

### 4.3 擴充：`POST /api/journey`（從 unpack 啟動）

加入可選 body 欄位 `fromTopicId`：若帶此值，會把該 unpack topic 的 `unpack_context` 拷貝為 journey 初始狀態（MBTI 猜測、關係類型、partner 暱稱、goal_statement = problem_summary）。

```typescript
{
  serviceId: string
  fromTopicId?: string  // 新增
  // 若 fromTopicId 提供，以下欄位可省略，由 unpack_context 帶入
  mbtiSelf?: string
  mbtiPartner?: string
  relationshipType?: 'couple' | 'parent_child' | 'workplace'
  // ...
}
```

### 4.4 後台擴充：`GET /api/manage/conversations`

加 query 參數：
- `?mode=unpack|journey|free` — 依模式過濾
- `?userId=xxx` — 看單一會員的所有 topics
- `?groupBy=task` — 把 topics 依 unpack_context.problem_summary 或 journey_id 分組

---

## 5. AI Prompt 工程

### 5.1 Unpack 模式 System Prompt 模板

放在 `src/lib/unpack/prompts.ts`：

```typescript
export function buildUnpackPrompt(ctx: {
  stage: 'plain' | 'probe' | 'lead'
  relationshipType?: string
  partnerNickname?: string
  partnerMbtiGuess?: string
  problemSummary?: string
  turnCount: number
}): string {
  const base = `你是「小羽」，羽升幸福養成學苑的 AI 關係教練。
使用者剛從 FB 廣告進來，正在卡住一段關係。

【你的三步心法】
1. 接住情緒（先同理，不下指導）
2. 打破認知（從對方行為猜測對方的內心需求，破除單一解讀）
3. 行動建議（具體、今晚就能做到、一句話夠用）

【口吻】
- 像懂 MBTI 的閨蜜，不是諮詢師
- 100-200 字一段，分段呈現，不要塞太多
- 不要直接丟「MBTI」「4S 高情商」這些術語，用「個性傾向」「一句話」描述
- 不用 markdown，純文字
`

  if (ctx.stage === 'plain') {
    return base + `
【本輪任務】
使用者剛提出問題：「${ctx.problemSummary ?? '（從訊息提取）'}」
請依三步心法回應，並在結尾**不要**主動講 MBTI 或 21 天課程。
讓使用者感覺被理解、被指引，留三個動態選項給呼叫端產生（不要寫在你的回覆裡）。
`
  }

  if (ctx.stage === 'probe') {
    return base + `
【本輪任務】
使用者已得到初步建議，回頭繼續對話。
追問細節：對方多大？平常個性？什麼時候開始這樣？
從這些資訊推敲對方可能的個性傾向（不講 MBTI 四字），給出更精準的建議。
這是第 ${ctx.turnCount} 輪。
`
  }

  // stage === 'lead'
  return base + `
【本輪任務】
使用者已對話 ${ctx.turnCount} 輪，明顯有興趣深入。
本輪可以自然提到「如果你想長期練習，把這變成習慣，可以考慮 21 天的系統練習」。
但不要強迫，依然以解決當下問題為主。
`
}
```

### 5.2 動態三選項規則

由 `/api/unpack` 根據 stage 決定回傳哪三個：

| stage | 選項 1 | 選項 2 | 選項 3 |
|---|---|---|---|
| plain | 試了再回來告訴我結果 | 教我一句話就能緩解的方法 | 我想更深入了解他為什麼這樣 |
| probe | 試了再回來告訴我結果 | 還有其他問題想問 | 我想看完整 MBTI 分析 |
| lead | 開始 21 天練習 | 再聊聊現在的狀況 | 暫時不用，我先試試 |

選項順序與文案會持續打磨，存在 `data/unpack_options.json` 方便不改程式碼即可調整。

---

## 6. 前端調整

### 6.1 新增頁面

```
src/app/(public)/stuck/page.tsx               # 引流入口，無需登入即可體驗（dialog_limit=3）
src/app/(dashboard)/dashboard/unpack/page.tsx # 會員的「我卡住」歷史清單
src/app/(dashboard)/dashboard/unpack/[id]/page.tsx  # 單一 task 對話頁
```

### 6.2 新增組件

```
src/components/unpack/
  ├── unpack-chat.tsx          # 主對話 UI（用 useChat hook from @ai-sdk/react）
  ├── option-buttons.tsx       # 三個動態選項按鈕
  ├── journey-cta.tsx          # 「開始 21 天練習」CTA 卡片
  └── task-list.tsx            # 任務清單（會員端）
```

### 6.3 後台調整

```
src/app/(manage)/manage/conversations/page.tsx
```

- 新增頂部 Tabs：全部 / 我卡住 / 21 天 / 自由聊
- 列表加「會員手機 + 任務摘要 + 模式 + 對話輪數 + 最後活動時間」
- 點入單一 task：左側對話歷史、右側 unpack_context（可編輯）

---

## 7. 引流 / 體驗權限設計

### 7.1 無登入體驗（推薦）

- `/stuck` 頁面提供 **3 次免費對話**，靠 cookie / IP 限流
- 第 4 次或選擇「開始 21 天」時引導註冊（沿用既有 `/register`）
- 註冊後，匿名 cookie 對應的 topic 寫回該使用者

### 7.2 6 月補課測試

新增 `users.test_cohort` 欄位（VARCHAR）標記補課學員（例：`'202606_pilot'`），後台可發站內通知召回。

---

## 8. 開發階段與里程碑

### Phase 1：資料層 + 後端 API（1 週）
- [ ] Migration 008 撰寫並上 Supabase
- [ ] `/api/unpack` POST 實作
- [ ] `/api/journey` 加 `fromTopicId` 銜接
- [ ] `/api/manage/conversations` 加 mode filter
- [ ] 單元測試（mock OpenAI 串流）

### Phase 2：前端 + UI（1 週）
- [ ] `/stuck` 引流頁
- [ ] `/dashboard/unpack` 會員任務頁
- [ ] 後台 conversations Tab
- [ ] 響應式 + 暗色模式

### Phase 3：Prompt 打磨（持續）
- [ ] 收集團隊提供的親子對話案例稿到 `data/unpack_cases/*.md`
- [ ] 每個案例分別在三個 stage 跑過，記錄問題
- [ ] 調整 `data/unpack_options.json` 與 prompts.ts

### Phase 4：6 月補課測試（指定週）
- [ ] 標記 `test_cohort = '202606_pilot'`
- [ ] 發送站內通知 + Email
- [ ] 收集對話數據（manage 後台匯出 CSV）
- [ ] 復盤迭代

---

## 9. 風險與注意事項

### 9.1 沿用會員資料的限制
- 既有 `users.dialog_limit` 是「總對話點數」，unpack 模式也會消耗（既有 `decrement_dialog_limit` RPC）
- 體驗用戶（無登入）不走 dialog_limit，由 `/api/unpack` 自行做匿名限流

### 9.2 OpenAI 成本
- unpack 對話比 journey 對話短但更頻繁（一個使用者可能開 3-5 個 task）
- 建議：unpack 模式用 gpt-4o-mini（既有），不要切到 gpt-4o
- `ai_token_usage` 既有表足夠追蹤

### 9.3 RLS 與測試帳號
- 6 月補課使用真實 user account，全部走既有 RLS
- 不需新增 admin / service_role 例外

### 9.4 對既有功能的影響
- `/api/chat` 既有 journey 對話**不受影響**（mode 預設 'free'，新欄位都有 default）
- `/api/manage/*` 既有報表**不受影響**（新增 filter 為可選）
- 未來想把 unpack 與 chat 合併，可以再做一次 prompt routing 重構

### 9.5 與會議決策的對齊
- 引流不主推 MBTI 四字 → 由 `buildUnpackPrompt` 的 plain stage 控制
- 多輪漸進揭露 → 由 stage 機制控制
- 7 天 × 3 結構 → `journeys.cycle_length` 預留，本期不啟用
- 媽媽視角親子內容 → `data/courseContent.json` 的 parent_child variation 已有，補強案例
- 親子優先 → `unpack_mvp_relationship_types` 系統參數控制

---

## 10. 附錄：對應會議要求的功能對照

| 會議要求 | nuwa v2 既有 | 本期新增 |
|---|---|---|
| 會員資料庫 | ✅ `users` | — |
| 對話記錄資料庫 | ✅ `chat_topics` + `chat_messages` | + mode/context 欄位 |
| 任務分組（會員 → 任務 → 第 N 天）| ✅ `journeys` + `daily_records` | 沿用 |
| 我卡住幫我拆 | ❌ | `/api/unpack` + 前端 |
| 動態三選項 | ❌ | `UnpackOption` |
| 自肉性行銷漸進揭露 MBTI | ❌ | `buildUnpackPrompt` stage 機制 |
| 後台老師端看會員任務 | 部分（`/manage/conversations`）| 擴充 mode filter |
| 6 月補課測試 | ❌ | `users.test_cohort` 旗標 |
| 弘揚金流 | ✅ `lib/esafe/` | 本期不改 |

---

## 11. 下一步

1. **與乃正對齊**：本文件 + 既有 `supabase/migrations/` 跑 walk-through
2. **與 Steven 對齊**：prompt stage 設計（plain/probe/lead）與三選項文案
3. **建立分支**：`feature/stuck-unpack`，在此分支落地 Phase 1
4. **打磨案例蒐集**：開 `data/unpack_cases/` 資料夾，團隊用 PR 提案例稿

---

*本文件由會議記錄與 nuwa v2 程式碼盤點交叉產出，可作為 PR 設計依據。修改本文件時請同步更新 `DEV_LOG.md`。*
