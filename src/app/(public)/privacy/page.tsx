import type { Metadata } from 'next'
import Link from 'next/link'
import { Header } from '@/components/layout/header'
import { Footer } from '@/components/layout/footer'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: '隱私政策 — 羽升幸福養成學苑',
}

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-16 lg:px-8">
        <h1 className="font-heading text-3xl font-bold text-fg-primary">隱私政策</h1>
        <div className="prose mt-8 max-w-none text-fg-secondary [&_h2]:mt-8 [&_h2]:border-l-4 [&_h2]:border-brand-purple [&_h2]:pl-3 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-fg-primary [&_h3]:mt-5 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-fg-primary [&_strong]:text-fg-primary">
          <h2>隱私權聲明</h2>
          <p>「羽升幸福養成學院 CHG2ASC ACADEMY」（以下稱「本學院」）為了行銷、客戶管理與服務、提供付費課程及其他電子商務服務、履行法定或合約義務、保護當事人及相關利害關係人之權益、售後服務、以及經營合於營業登記項目或組織章程所定之業務等目的，依照各該服務之性質，可能蒐集您的姓名、連絡方式（包括但不限於電話、E-MAIL 及地址等）、服務單位、職稱、為完成收款或付款所需之資料、ＩＰ位址、及其他得以直接或間接識別使用者身分之個人資料。</p>
          <p>此外，為提升服務品質，本學院透過本平台之系統機制，記錄使用者的 IP 位址及於本平台內之瀏覽活動等資料，但這些資料僅供作流量分析和網路行為調查，不會和特定個人相連繫。</p>
          <h2>使用者之內容和資料聲明</h2>
          <p>使用者擁有其於本學院透過本平台所提供之課程服務中所產生之活動記錄，使用者得依本平台所提供之功能設定，管理相關分享資訊。</p>
          <p>智慧財產權所涵蓋內容（包括相片和影片之 IP 內容），使用者具體地給予本學院非獨有、可轉讓、可再授權、免版稅的全球授權。當使用者刪除 IP 內容，已刪除的內容可能會在合理時間內存有備份副本（但不會提供給他人使用）。</p>
          <h2>Cookie 的運用</h2>
          <p>Cookie 是網站伺服器儲存在瀏覽器上的文字檔案，可讓網站記住您的瀏覽偏好。本學院使用 Cookie 進行網站活動分析並改善使用體驗。如果您選擇封鎖所有 Cookie，可能造成您在使用本學院網站時受到限制。</p>
          <h2>個資授權聲明</h2>
          <p>本學院相關網站所取得的個人資料，都僅供本學院於其內部、依照原來所說明的使用目的和範圍，除非事先說明或依照相關法律規定，否則不會將資料提供給第三人或移作其他目的使用。</p>
          <h3>蒐集之目的</h3>
          <p>蒐集之目的在於進行行銷業務、消費者、客戶管理與服務、網路購物及其他電子商務服務及與調查、統計與研究分析（法定特定目的項目編號為Ｏ四Ｏ、Ｏ九Ｏ、一四八、一五七）。</p>
          <h3>蒐集之個人資料類別</h3>
          <p>(1) C001 辨識個人者：如會員之姓名、地址、電話、電子郵件等資訊。<br />(2) C002 辨識財務者：如信用卡或金融機構帳戶資訊。<br />(3) C011 個人描述：例如性別、出生年月日等。</p>
          <h3>利用期間、地區、對象及方式</h3>
          <p>(1) 期間：會員當事人要求停止使用或本學院停止提供服務之日為止。<br />(2) 地區：會員之個人資料將用於台灣地區。<br />(3) 利用對象及方式：會員之個人資料蒐集用於本學院之會員管理、客戶管理、辨識身份、金流服務、行銷廣宣等。</p>
          <h2>會員就個人資料之權利</h2>
          <p>本學院所蒐集個人資料之當事人，依個人資料保護法得對本學院行使以下權利：</p>
          <ol className="list-decimal pl-6 space-y-1">
            <li>查詢或請求閱覽。</li>
            <li>請求製給複製本。</li>
            <li>請求補充或更正。</li>
            <li>請求停止蒐集、處理或利用。</li>
            <li>請求刪除。</li>
          </ol>
          <p>如欲行使上述權利請透過本學院客服（service@chg2asc.com）連絡進行申請，我們會在 15 天內將相關的個人資料提供給您。會員本人可以請求停止利用或刪除個人資料，我們會在 30 天內處理完成。</p>
          <p><strong>請注意！如拒絕提供加入會員所需必要之資料，將可能導致無法享受完整服務或完全無法使用該項服務。</strong></p>
        </div>
        <div className="mt-12 text-center">
          <Link href="/"><Button variant="outline" className="rounded-xl px-8">返回首頁</Button></Link>
        </div>
      </main>
      <Footer />
    </div>
  )
}
