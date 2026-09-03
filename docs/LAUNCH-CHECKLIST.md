# 正式上線前檢查清單

測試階段為了方便做了幾項暫時性調整，這些**必須在開放付費前還原**。
本檔案的用途是：那些調整散在資料庫與程式碼的不同地方，靠記憶一定會漏。

盤點日期：2026-08-22（依當時正式庫實際狀態）

---

## 1. 價格：三個地方，不是一個 🔴

價格定義在三處，而且**目前正式站已經不一致**：

| # | 位置 | 現值 | 用途 |
|---|---|---|---|
| A | `public.plans` | **5 / 5 / 5** | 訂閱**實際扣款**依據 |
| B | `public.services.plans`（JSONB） | 100 / 200 / 300 | 課程列表頁**顯示** |
| C | 私版 `src/lib/billing/plans.ts` | **5 / 5 / 5**（寫死） | 私版「我的方案」顯示 |

> ⚠️ 現況：使用者在 `/courses` 看到「NT$ 100 起」，實際扣款 NT$ 5。
> 測試階段收得比標示少不會出事，但這是真實的資料不一致。

`021_test_pricing.sql` 檔尾的還原 SQL **只涵蓋 A**。B 與 C 要另外處理。

### A. `public.plans`（扣款依據）

```sql
-- 先確認現況
SELECT code, price, renewal_price, monthly_charge, monthly_dialog_count
FROM public.plans ORDER BY sort_order;

-- 還原
UPDATE public.plans SET price=100, renewal_price=100, monthly_charge=100, updated_at=NOW() WHERE code='basic';
UPDATE public.plans SET price=200, renewal_price=200, monthly_charge=200, updated_at=NOW() WHERE code='advanced';
UPDATE public.plans SET price=300, renewal_price=300, monthly_charge=300, updated_at=NOW() WHERE code='premium';
```

### B. `public.services.plans`

目前已是 100 / 200 / 300，**若 A 還原成相同數字則不需更動**。
但兩者是各自獨立的資料，改 A 時務必回頭確認 B 是否一致 ——
這兩個值不一致就是「標示一個價、收另一個價」。

```sql
SELECT code, plans FROM public.services WHERE plans IS NOT NULL;
```

### C. 私版 `src/lib/billing/plans.ts`

三個 `price_twd: 5` 要改回真實金額（basic 100 / advanced 200 / premium 300）。
**這是程式碼，需要重新部署私版才會生效。**

---

## 2. 管理員二階段驗證目前形同虛設 🔴

`src/app/(public)/login/actions.ts` 有兩處寫死驗證碼：

| 行 | 流程 | 影響對象 |
|---|---|---|
| 58 | 手機登入，密碼正確後發 OTP | 所有走手機登入的人 |
| 117 | Email 登入且 `role='superadmin'` | **兩個 superadmin 帳號** |

```ts
// 目前固定 1234，不發簡訊（正式上線再改回隨機碼 + SMS）
const code = '1234'
```

**準確描述風險**：這兩處都在 `signInWithPassword` **成功之後**才執行，
所以**不是登入繞過** —— 攻擊者仍需要正確密碼。
但這層 OTP 存在的目的就是保護最高權限帳號，而它現在等於關閉。

> 對照：`src/app/api/auth/sms/send/route.ts:39` 的 `1234` **有開關保護**
> （`SMS_TEST_MODE` 這個 secret_param，目前為空 = 非測試模式 = 產生隨機碼），
> 那一處設計正確、不需更動。

### 這件事被簡訊 token 卡住

要啟用真實 OTP 就必須能發簡訊，而目前簡訊靠的是**寫死在原始碼裡的 token**
（`src/lib/sms/milkidea.ts:6`，作為 `getSecretParam('SMS_API_KEY')` 的 fallback，
而該參數在正式庫是空的）。因此順序是：

1. 向 milkidea 換發新 token（舊的已在 GitHub 歷史中，等同公開）
2. 填入後台 `/manage/settings` 的 `SMS_API_KEY`
3. 移除 `milkidea.ts` 的 fallback
4. 將 `login/actions.ts` 兩處改為隨機碼並實際發送簡訊
5. 部署公版

### 順帶：OTP 沒有嘗試次數限制

驗證邏輯（`login/actions.ts:146`）只比對最新一筆、檢查是否過期，
**沒有累計錯誤次數或鎖定機制**。4 位數 = 10,000 種組合、5 分鐘有效窗口。
啟用隨機碼時建議一併加上嘗試上限，否則隨機化的效果有限。

---

## 3. 其他

| 項目 | 動作 |
|---|---|
| `014_drop_unlinked_users.sql` | 尚未執行。清除未綁定公版的私版帳號（目前僅一筆空殼） |
| GoDaddy 舊 DNS 記錄 | Resend 改驗證根網域後，三筆 `send.send` 已無作用，可刪 |
| Supabase service_role / Anthropic key | 仍存在於 GitHub 歷史中。已決定暫不輪替 |

---

## 上線前最終驗證

```sql
-- 價格三處一致？
SELECT code, price FROM public.plans ORDER BY sort_order;
SELECT code, plans FROM public.services WHERE code = 'happy';
-- 私版 plans.ts 需人工確認並重新部署
```

```bash
# 確認驗證碼已非固定值
grep -n "const code = '1234'" src/app/\(public\)/login/actions.ts   # 應無輸出

# 確認簡訊 token 已不在程式碼中
grep -rn "e14485ece4f8062e97b58f3d790ac2f7855" src/                 # 應無輸出
```
