// 「開始 14 天（30 次對話）免費試用」按鈕文字（首頁、App 服務頁共用）。
//
// 加上對話次數後文案變長，窄卡片裡瀏覽器會把最後一個「用」字單獨擠到第二行，
// 用 text-balance 又會斷在括號中間（「（30 次」／「對話）」）。
// 所以拆成兩段、各自不斷行：寬度夠就一行，不夠就「開始 14 天（30 次對話）」／「免費試用」。
export function StartTrialLabel({ offer }: { offer: string }) {
  return (
    <span className="text-center">
      <span className="whitespace-nowrap">開始 {offer}</span>
      <span className="whitespace-nowrap">免費試用</span>
    </span>
  )
}
