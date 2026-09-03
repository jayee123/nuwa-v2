import type { Metadata } from 'next'

export const metadata: Metadata = { title: '開發者串接文件 — 羽升管理後台' }

// 公版（Market）↔ 私版（App）串接文件：給私版開發者定義 SSO / 權益扣款 / 付款導回 的介面。
// 狀態標記：✅ 已實作、🚧 待實作（規格已定義、尚未開發）。

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-gray-900 px-4 py-3 text-xs leading-relaxed text-gray-100">
      <code>{children}</code>
    </pre>
  )
}

function Section({ id, title, badge, children }: { id: string; title: string; badge?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4">
      <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-fg-primary">
        {title}
        {badge && <span className="rounded-full bg-brand-purple/10 px-2 py-0.5 text-[11px] font-medium text-brand-purple">{badge}</span>}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-fg-secondary">{children}</div>
    </section>
  )
}

export default function DevDocsPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="font-heading text-2xl font-bold text-fg-primary">開發者串接文件</h1>
      <p className="mt-1 text-sm text-fg-secondary">
        公版（Market）↔ 私版（App）串接介面定義，供私版（如「幸福關係」nexthappy）開發時使用。
      </p>

      {/* 目錄 */}
      <nav className="mt-4 flex flex-wrap gap-2 text-xs">
        {[
          ['overview', '架構總覽'],
          ['keys', 'App 金鑰'],
          ['data-design', '⓪ 資料設計'],
          ['sso', '① 登入 SSO'],
          ['entitlement-now', '② 權益 / 用量（實作）'],
          ['entitlement', '③ 權益 API（規劃）'],
          ['payment', '④ 付款導回'],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-full border border-surface-secondary px-3 py-1 text-fg-secondary hover:border-brand-purple/40 hover:text-brand-purple">
            {label}
          </a>
        ))}
      </nav>

      <div className="mt-6 space-y-8">
        <Section id="overview" title="架構總覽">
          <p>
            兩層架構：<b>Market（公版）</b>=平台（會員身分、金流、方案），<b>App（私版）</b>=各應用（自己的用戶資料與功能）。
            會員資料在 Market <code className="rounded bg-surface-secondary px-1">public.users</code>；App 用戶在各自 schema（如 <code className="rounded bg-surface-secondary px-1">happy.users</code>），靠
            <code className="rounded bg-surface-secondary px-1">app_user.nuwa_user_id → public.users.id</code> 對應。
          </p>
          <p>使用者流程：Market 首頁「進去使用 App」→ Market 簽 SSO token → 導向 App 的 <code>/sso</code> → App 驗證後建立/連結自己的用戶並發 session。</p>
        </Section>

        <Section id="keys" title="App 金鑰（在後台 App 管理開通時取得）">
          <p>superadmin 在「App 管理」新增 App 時，系統產生兩把一次性金鑰，請存進私版環境變數：</p>
          <ul className="ml-4 list-disc space-y-1">
            <li><code>sso_secret</code>（<code>sso_…</code>）：SSO token 的 HMAC 簽章金鑰，公私版共用。私版設為 <code>SSO_SECRET</code>。</li>
            <li><code>entitlement_key</code>（<code>ent_…</code>）：私版呼叫 Market 權益/用量 API 的驗證金鑰。</li>
          </ul>
          <p>另外每支 App 有 <code>app_url</code>（前台）與 <code>admin_url</code>（課程後台）欄位。</p>
        </Section>

        <Section id="data-design" title="⓪ 新 App 的資料設計（開工前先讀）" badge="⚠️ 決定後很難改">

          <h3 className="font-semibold text-fg-primary">主鍵直接用公版的 users.id</h3>
          <p>
            新 App 的用戶表，主鍵<b>直接採用</b> Market <code className="rounded bg-surface-secondary px-1">public.users.id</code> 的值，
            不要另外產生一組自己的 uuid。
          </p>
          <Code>{`-- ✅ 新 App 這樣做
CREATE TABLE myapp.users (
  id UUID PRIMARY KEY,        -- 直接放 public.users.id，不用 gen_random_uuid()
  ...
);

-- ❌ 不要這樣（這是既有私版的歷史包袱，見下）
CREATE TABLE myapp.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nuwa_user_id TEXT,          -- 另外一欄指回公版
  ...
);`}</Code>

          <h3 className="font-semibold text-fg-primary">為什麼「幸福關係」是雙 id —— 不要照抄</h3>
          <p>
            nexthappy 有 <code>happy.users.id</code> 與 <code>happy.users.nuwa_user_id</code> <b>兩組 id</b>，
            那是歷史因素：私版比公版早存在，接上來時若改用公版 id 當主鍵，就要改寫所有既有資料與外鍵，
            因此選了侵入性最低的「加一欄」。
          </p>
          <p>新 App 沒有這個包袱，照抄只會白白繼承三個麻煩：</p>
          <ul className="ml-4 list-disc space-y-1">
            <li><b>型別不一致</b>：<code>nuwa_user_id</code> 是 <code>TEXT</code>、公版 <code>id</code> 是 <code>UUID</code>，
              每次跨版 join 都要 <code>::uuid</code> 轉型，忘了就報 <code>operator does not exist: uuid = text</code>。</li>
            <li><b>兩組 id 容易搞混</b>：App 內部外鍵要用自己的 id、跨版查詢要用 <code>nuwa_user_id</code>，
              用錯不會報錯，只會安靜地查不到資料。</li>
            <li><b>需要對齊稽核</b>：<code>nuwa_user_id</code> 可能是 null（未綁定），這種斷鏈平常沒有症狀，
              要等使用者反應「我登不進去」才會發現。</li>
          </ul>
          <p className="text-xs text-fg-muted">
            單一主鍵就沒有以上任何一項 —— App 用戶必然來自公版（新 App 沒有自己的註冊入口），
            id 相同是自然的結果。
          </p>

          <h3 className="font-semibold text-fg-primary">schema 隔離</h3>
          <p>
            每支 App 用<b>自己的 schema</b>，不要把表建在 <code>public</code>（那是公版的）。
            schema 名稱寫進 <code>apps.db_schema</code>，與 <code>slug</code> 一樣建立後不可更改。
          </p>
          <Code>{`CREATE SCHEMA IF NOT EXISTS myapp;
SET search_path TO myapp;   -- ⚠️ 每個新的 SQL 連線都要重設`}</Code>
          <p className="text-xs text-fg-muted">
            ⚠️ migration 檔請一律<b>寫明 schema 前綴</b>（<code>myapp.users</code>），不要依賴 <code>search_path</code>。
            忘了設 search_path 會把表建到 <code>public</code>、與公版的 <code>users</code> 撞在一起，
            而且<b>不會報錯</b>，只會安靜地做出一個壞掉的資料庫。
          </p>

          <h3 className="font-semibold text-fg-primary">apps 表必填欄位</h3>
          <p>在「App 管理」開通新 App 時，這幾欄都要填，缺了會在不同地方出錯：</p>
          <ul className="ml-4 list-disc space-y-1">
            <li><code>slug</code> — 身分骨架，建立後不可改（token 的 <code>app</code> 欄位靠它比對）</li>
            <li><code>db_schema</code> — 同上，建立後不可改</li>
            <li><code>app_url</code> — 前台網址；缺了 SSO 無法導向</li>
            <li><code>admin_url</code> — 課程後台網址；缺了「🛠 課程後台」連結會導到錯誤頁</li>
            <li><code>sso_secret</code> — 缺了完全無法登入</li>
            <li><code>required_plan</code> — 進入門檻；留空 = 不限方案</li>
          </ul>
          <p className="text-xs text-fg-muted">
            ⚠️ <code>app_url</code> / <code>admin_url</code> 是<b>正式站</b>的網址。本機開發請用環境變數
            <code>DEV_APP_URL_&lt;SLUG 大寫&gt;</code> 覆寫，<b>不要改資料庫</b> ——
            改了會讓正式站的 SSO 把所有真實用戶導去你的 localhost。
          </p>
        </Section>

        <Section id="sso" title="① 登入 SSO（Market → App 身分交遞）" badge="✅ 已實作">
          <p>Market 端 <code>GET /api/apps/&#123;slug&#125;/launch</code>：確認 Market 已登入 → 以該 App 的 <code>sso_secret</code> 簽一枚短效（120 秒）HS256 JWT → 302 導向 <code>&#123;app_url&#125;/sso?token=…</code>。</p>
          <p>Token payload：</p>
          <Code>{`{
  "sub":   "<nuwa_user_id>",   // Market public.users.id
  "email": "<user email>",
  "name":  "<用戶名稱>",
  "app":   "<slug>",           // 例 "happy"
  "to":    "app",              // 選填：進入後的落點，見下
  "iat":   1690000000,
  "exp":   1690000120          // iat + 120s
}`}</Code>
          <p>私版 <code>/sso</code> 要做的事（HS256 = HMAC-SHA256，用同一把 <code>SSO_SECRET</code>）：</p>
          <ol className="ml-4 list-decimal space-y-1">
            <li>驗簽章、檢查 <code>exp</code> 未過期、<code>app</code> 相符。</li>
            <li>用 <code>sub</code>(nuwa_user_id) 找 App 用戶；找不到就用 <code>email</code> 找既有用戶並補上 <code>nuwa_user_id</code>；再沒有就建立新用戶（無密碼、只走 SSO）。</li>
            <li>發自己的 session cookie，導向 App 首頁。導向網址要用 <code>x-forwarded-host</code>（反向代理後 request.url 是容器內位址）。</li>
          </ol>
          <p><code>to</code> 決定使用者驗證通過後的落點，由 Market 端以 <code>?to=</code> 指定：</p>
          <ul className="ml-4 list-disc space-y-1">
            <li><code>app</code> — 直接進 App 主功能</li>
            <li><code>welcome</code> — 先看產品導覽</li>
            <li><code>admin</code> — 進 App 的課程後台（公版「App 管理」的連結會帶這個）</li>
            <li>未帶 — 交給 App 自行判斷</li>
          </ul>
          <p className="text-xs text-fg-muted">
            ⚠️ <code>to=admin</code> 只是<b>落點</b>，不代表有權限。App 的後台仍要自己驗一次 ——
            「公版管理者」與「App 管理者」是兩套獨立權限。權限不足時請顯示明確說明，
            不要靜默轉址到其他頁面（使用者會不知道發生什麼事）。
          </p>
          <p className="text-xs text-fg-muted">參考實作：nexthappy <code>src/app/sso/route.ts</code>（手刻 HMAC 驗證，無需額外套件）。</p>
        </Section>

        <Section id="entitlement-now" title="② 權益 / 用量（目前實作）" badge="✅ 運行中">
          <p>
            <strong>目前的做法不走 HTTP API</strong>：公版與 App 共用同一個 Postgres（公版 <code>public</code> schema、
            App 各自一個 schema），App 直接以 service role 跨 schema 讀寫，不需要中間層、沒有同步延遲。
            下方 ③ 描述的 HTTP API 是規劃版，尚未實作。
          </p>

          <p className="font-medium text-fg-primary">讀方案（唯一真值在公版）</p>
          <pre className="overflow-x-auto rounded-lg bg-surface-secondary p-3 text-xs">{`// App 端另開一個指向 public schema 的 client
const market = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  db: { schema: 'public' },
})

const { data } = await market
  .from('users')
  .select('current_plan, plan_deadline')
  .eq('id', nuwaUserId)      // = App 端記錄的 nuwa_user_id
  .maybeSingle()

// 公版 current_plan → App 自己的層級
// free → trial ｜ basic / advanced / premium / cancelled 同名對應
// 讀不到或認不得 → fallback 本地值，不要讓對話中斷`}</pre>
          <p className="text-xs text-fg-muted">參考實作：nexthappy <code>src/lib/market/plan.ts</code>、<code>src/lib/market/client.ts</code>。</p>

          <p className="font-medium text-fg-primary">回報用量（每次 AI 呼叫）</p>
          <pre className="overflow-x-auto rounded-lg bg-surface-secondary p-3 text-xs">{`await market.from('ai_token_usage').insert({
  user_id: nuwaUserId,
  app_id: appId,             // 以 slug 查 apps 表取得後快取，勿寫死 UUID
  tokens_used: inputTokens + outputTokens,
  cost_twd: costTwd,         // 寫入當下計算並固化，日後調價不影響歷史
  date: new Date().toISOString().slice(0, 10),
})`}</pre>
          <p className="text-xs text-fg-muted">
            參考實作：nexthappy <code>src/lib/market/usage.ts</code>。
            回報是「回報」不是主流程 —— 未綁定公版帳號者直接跳過，任何失敗只記錄日誌，不得影響對話回應。
          </p>

          <p className="font-medium text-fg-primary">額度控管由 App 自己做</p>
          <p>
            公版只持有「這個人買了什麼方案」，不負責計數。每月額度上限、已用量、擋量與提示升級，
            都在 App 端依讀到的方案自行計算（參考 nexthappy <code>src/lib/billing/quotas.ts</code>）。
          </p>

          <p className="rounded-lg border border-surface-secondary bg-surface-secondary/40 p-3 text-xs">
            <strong>什麼時候需要改走 HTTP API</strong>：上述做法的前提是 App 與公版共用同一個資料庫。
            若之後有 App 要獨立部署、使用自己的資料庫，就必須改用下方 ③ 的 <code>entitlement_key</code> 路線，
            屆時再實作。目前 <code>apps.entitlement_key</code> 欄位已存在但沒有任何呼叫端。
          </p>
        </Section>

        <Section id="entitlement" title="③ 權益 API（規劃版，尚未實作）" badge="🚧 待實作（規格）">
          <p>金流與方案集中在 Market。私版需要兩支 API：查會員權益、回報用量（扣對話次數）。皆以 <code>entitlement_key</code> 於 header 驗證。</p>

          <p className="font-medium text-fg-primary">查詢權益 <code>GET /api/entitlement</code></p>
          <Code>{`GET {market}/api/entitlement?nuwa_user_id=<id>
Authorization: Bearer <entitlement_key>

200 →
{
  "active": true,
  "plan": "advanced",
  "monthly_dialog_count": 100,   // 每月額度
  "used": 37,                    // 本期已用
  "remaining": 63,
  "period_end": "2026-09-01T00:00:00Z"
}`}</Code>

          <p className="font-medium text-fg-primary">回報用量（扣次數）<code>POST /api/usage</code></p>
          <Code>{`POST {market}/api/usage
Authorization: Bearer <entitlement_key>
{
  "nuwa_user_id": "<id>",
  "app": "happy",
  "dialogs": 1,        // 這次消耗的對話次數
  "tokens": 1234       // 選填：AI token 數
}

200 → { "ok": true, "remaining": 62 }`}</Code>
          <p>Market 會把用量寫入 <code>ai_token_usage</code> 並標上 <code>app_id</code>（PR3 已加欄位/trigger），各 App 後台只看自己學員用量。額度用完時 <code>active/remaining</code> 反映、私版據以擋或提示升級。</p>
        </Section>

        <Section id="payment" title="④ 付款導回（App → Market 付款 → 回 App）" badge="🚧 待實作（規格）">
          <p>付款一律在 Market 完成（會員的卡片/發票都在公版）。私版遇到需付費/升級時：</p>
          <ol className="ml-4 list-decimal space-y-1">
            <li>導向 Market 訂閱頁：<code>&#123;market&#125;/dashboard/subscribe/&#123;code&#125;?return=&#123;app_url&#125;/…</code>（使用者已是 Market 會員，直接付）。</li>
            <li>Market 走紅陽 SunPay 綁卡/扣款 → callback 更新 <code>public.users</code> 方案 + 寫 <code>subscriptions/payments</code>（標 <code>app_id</code>）。</li>
            <li>完成後 Market 依 <code>return</code> 導回 App；App 重新呼叫 <code>①查詢權益</code> 取得最新方案/額度。</li>
          </ol>
          <p className="text-xs text-fg-muted">交易一律帶 <code>app_id</code>，各 App 後台在「交易」只看到自己 App 的付款與訂閱。</p>
        </Section>
      </div>

      <p className="mt-8 border-t border-surface-secondary pt-4 text-xs text-fg-muted">
        ①已上線；②③為規格定義，實作進度依 PR 排程。私版開發前請以本頁介面為準對齊。
      </p>
    </div>
  )
}
