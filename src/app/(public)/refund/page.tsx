import type { Metadata } from 'next'
import Link from 'next/link'
import { Header } from '@/components/layout/header'
import { Footer } from '@/components/layout/footer'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: '退款政策 — 羽升幸福養成學苑',
}

export default function RefundPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-16 lg:px-8">
        <h1 className="font-heading text-3xl font-bold text-fg-primary">退款政策</h1>
        <div className="prose mt-8 max-w-none text-fg-secondary [&_h2]:mt-8 [&_h2]:border-l-4 [&_h2]:border-brand-purple [&_h2]:pl-3 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-fg-primary [&_h3]:mt-5 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-fg-primary [&_strong]:text-fg-primary">
          <h2>退費規範</h2>
          <p>本退款政策適用於「羽升幸福養成學院 CHG2ASC ACADEMY」（以下稱「本學院」）所提供之實體課程及 AI Chatbot 訂閱服務。因服務性質不同，退款條件將依下列分類分別適用。</p>
          <h2>一、實體課程退款政策（一次性課程服務）</h2>
          <h3>（一）符合退款資格之情形</h3>
          <p>1. <strong>課程尚未開始前</strong>：購買本學院實體課程之學員，得於課程正式開始前，向本學院提出退款申請；經審核確認後，將依原付款方式辦理退款。<br />2. <strong>重複購買相同課程內容</strong>：若因系統或操作因素，導致學員重複購買相同實體課程內容，請聯繫本學院客服，經確認屬實後，將辦理全額退款。</p>
          <h3>（二）不符合退款資格之情形</h3>
          <p>1. <strong>課程已開始或已完成授課</strong>：實體課程屬一次性服務，於課程正式開始上課後，即視為服務已開始提供，恕不受理退款申請。<br />2. <strong>非可歸責於本學院之個人因素</strong>：包含但不限於個人時間安排、臨時無法出席、主觀不符合期待等情形，恕不構成退款事由。</p>
          <h2>二、AI Chatbot 訂閱服務退款政策（訂閱制數位服務）</h2>
          <p>AI Chatbot 為訂閱制數位服務，依《消費者保護法》及相關法令規定，屬於一經提供即開始使用之數位內容服務，其退款條件如下：</p>
          <h3>（一）免費贈送期間說明</h3>
          <p>1. 首次購買本學院實體課程之學員，將獲得一次性 3 個月 AI Chatbot 免費訂閱優惠。<br />2. 該免費訂閱屬優惠贈送性質，非單獨購買之付費項目，故<strong>不適用退款機制，亦不得折換現金。</strong></p>
          <h3>（二）付費訂閱期間之退款原則</h3>
          <p>1. AI Chatbot 訂閱服務於當期扣款完成後，即提供當期之數位服務內容。<br />2. <strong>已完成扣款之當期訂閱費用，恕不予退還。</strong><br />3. 學員如不再需要該服務，得於次期扣款日前自行取消訂閱；取消後將不再產生後續費用。</p>
          <h2>三、退款方式</h2>
          <p>1. 若原付款方式為信用卡，透過本平台之訂單紀錄功能提交退款申請。<br />2. 實際退款入帳時間，依各發卡銀行作業時間為準。</p>
          <h2>四、退款申請流程</h2>
          <p>1. 請學員登入會員帳號，於訂單紀錄中提交退款申請。<br />2. 本學院將於收到申請後，協助進行相關退款審核與處理。</p>
          <h2>五、補充說明</h2>
          <p>1. 本學院所提供之所有課程內容與 AI 服務，學員僅取得使用權，不因退款或付費而取得內容所有權或智慧財產權。<br />2. 本退款政策未盡事宜，悉依本學院使用條款及相關法令規定辦理。</p>
        </div>
        <div className="mt-12 text-center">
          <Link href="/"><Button variant="outline" className="rounded-xl px-8">返回首頁</Button></Link>
        </div>
      </main>
      <Footer />
    </div>
  )
}
