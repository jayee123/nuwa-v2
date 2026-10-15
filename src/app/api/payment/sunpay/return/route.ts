import { NextResponse } from 'next/server'

// 紅陽 SunPay v3「交易完成轉導網址」：使用者在紅陽付款頁付完後，瀏覽器被帶來這裡。
// 付款結果以背景通知（/api/payment/sunpay/notify）為準，這裡不處理任何帳，
// 只把付款視窗導到說明頁；原本的結帳頁會自己輪詢付款狀態並跳轉。
// 紅陽用 GET 或 POST 帶回來都接（文件沒寫是哪一種）。

function toReturnPage(request: Request): NextResponse {
  return NextResponse.redirect(new URL('/dashboard/subscribe/return', request.url), 303)
}

export async function GET(request: Request) {
  return toReturnPage(request)
}

export async function POST(request: Request) {
  return toReturnPage(request)
}
