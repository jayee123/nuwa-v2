import type { Metadata } from 'next'
import Link from 'next/link'
import { Header } from '@/components/layout/header'
import { Footer } from '@/components/layout/footer'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: '常見問題 — 羽升幸福養成學苑',
  description: '關於課程、訂閱、AI 家教、付款等常見問題解答。',
}

interface FaqItem {
  question: string
  answer: string
}

interface FaqSection {
  title: string
  items: FaqItem[]
}

const FAQ_SECTIONS: FaqSection[] = [
  {
    title: '課程相關',
    items: [
      {
        question: '課程可以重複觀看嗎？',
        answer:
          '可以！訂閱期間內所有影片課程皆可無限次觀看，隨時複習不受限制。',
      },
      {
        question: '實體課程和線上課程有什麼不同？',
        answer:
          '線上課程為影片錄播搭配 AI 家教對話練習，可隨時隨地自主學習；實體課程為老師現場授課，有固定時間與地點，提供面對面互動與即時回饋的學習體驗。',
      },
      {
        question: '課程適合什麼樣的人？',
        answer:
          '我們的課程適合所有想要提升自我認知、改善人際與親密關係的人。無論你是想更了解自己的性格特質，還是希望學習更有效的溝通技巧，都能在這裡找到適合的課程。',
      },
      {
        question: '沒有心理學基礎也能上課嗎？',
        answer:
          '完全可以！課程內容從基礎概念開始，循序漸進地帶你了解 MBTI 人格分析、薩提爾冰山理論等，不需要任何先備知識。',
      },
    ],
  },
  {
    title: 'AI 家教',
    items: [
      {
        question: 'AI 家教是什麼？',
        answer:
          'AI 家教是我們獨創的智慧對話系統，搭配每門課程的專屬教師角色，你可以隨時進行情境對話練習、提問討論，就像有一位私人家教 24 小時陪伴你學習。',
      },
      {
        question: 'AI 家教的對話次數有限制嗎？',
        answer:
          '依你的訂閱方案而定。基本方案每月有 50 次對話額度，進階方案以上則享有無限次對話。',
      },
      {
        question: 'AI 家教會記住我之前聊過的內容嗎？',
        answer:
          '會的！我們的 AI 家教具備長期記憶功能，能記住你過去的對話重點、學習進度與個人偏好，讓每次對話都更貼近你的需求。',
      },
    ],
  },
  {
    title: '訂閱與付款',
    items: [
      {
        question: '有哪些訂閱方案可以選擇？',
        answer:
          '每門課程提供不同的訂閱方案（如基本、進階、Premium），各方案的功能與價格不同。你可以在各課程的訂閱方案頁面查看詳細內容與定價。',
      },
      {
        question: '可以隨時取消訂閱嗎？',
        answer:
          '可以隨時取消，取消後仍可使用至當期結束，不會再產生後續費用。請於次期扣款日前完成取消。',
      },
      {
        question: '支援哪些付款方式？',
        answer:
          '目前支援信用卡付款，透過紅陽金流（eSafe）安全處理，支援 Visa、MasterCard、JCB 等主要信用卡。',
      },
      {
        question: '可以申請退款嗎？',
        answer:
          '實體課程在開課前可申請退款；AI 訂閱服務因屬數位內容，當期已扣款的費用恕不退還。詳細規定請參閱退款政策頁面。',
      },
    ],
  },
  {
    title: '帳號與操作',
    items: [
      {
        question: '如何註冊帳號？',
        answer:
          '點擊首頁右上角「登入」按鈕，選擇「註冊」，輸入手機號碼並完成 SMS 驗證碼認證即可建立帳號。',
      },
      {
        question: '忘記密碼怎麼辦？',
        answer:
          '在登入頁面點選「忘記密碼」，輸入你的手機號碼，我們會透過簡訊發送驗證碼，完成驗證後即可重新設定密碼。',
      },
      {
        question: '可以在手機上使用嗎？',
        answer:
          '可以！本平台採用響應式設計，手機、平板、電腦都能流暢使用，隨時隨地學習。',
      },
      {
        question: '如何查看我的學習進度？',
        answer:
          '登入後進入「會員中心」，在各課程的學習 Dashboard 中可以看到你的觀看進度、AI 對話紀錄與學習統計。',
      },
    ],
  },
]

export default function FaqPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-16 lg:px-8">
        <h1 className="font-heading text-3xl font-bold text-fg-primary">
          常見問題
        </h1>
        <p className="mt-2 text-fg-secondary">
          找不到你要的答案？歡迎透過頁面底部的聯絡方式與我們聯繫。
        </p>

        <div className="mt-10 space-y-10">
          {FAQ_SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="border-l-4 border-brand-purple pl-3 text-lg font-bold text-fg-primary">
                {section.title}
              </h2>
              <div className="mt-4 divide-y divide-surface-secondary">
                {section.items.map((item) => (
                  <details
                    key={item.question}
                    className="group py-4"
                  >
                    <summary className="flex cursor-pointer items-center justify-between text-fg-primary font-medium hover:text-brand-purple">
                      {item.question}
                      <span className="ml-4 shrink-0 text-fg-muted transition-transform group-open:rotate-45">
                        +
                      </span>
                    </summary>
                    <p className="mt-3 text-sm leading-relaxed text-fg-secondary">
                      {item.answer}
                    </p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-16 rounded-2xl bg-surface-secondary/50 p-8 text-center">
          <h3 className="font-heading text-lg font-bold text-fg-primary">
            還有其他問題嗎？
          </h3>
          <p className="mt-2 text-sm text-fg-secondary">
            如果以上內容沒有解答你的疑問，歡迎直接與我們聯繫。
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <Link href="/">
              <Button variant="outline" className="rounded-xl px-6">
                返回首頁
              </Button>
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
