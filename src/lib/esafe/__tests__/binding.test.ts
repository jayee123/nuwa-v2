/**
 * 綁卡表單參數完整性（PAYMENT_BOUNDARIES §H Loop 1.5）。
 * Etopm.aspx 對缺欄位 / 髒電話號碼的容忍度是零，表單組裝要整組釘住。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { buildBindingParams } from '../binding'

const BASE_OPTS = {
  amount: 100,
  orderId: 'TD_TEST_001',
  customerName: '測試用戶',
  phone: '0912-345-678',
  email: 'test@example.com',
  userId: 'user-uuid-1',
  serviceCode: 'happy',
  callbackUrl: 'https://example.com/api/payment/callback',
}

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.ESAFE_MERCHANT_ID = 'TESTMERCHANT01'
  process.env.ESAFE_PASSWORD = 'TESTPASS'
  process.env.ESAFE_BIND_URL = 'https://test.esafe.com.tw/Service/Etopm.aspx'
})

describe('buildBindingParams', () => {
  it('回傳完整表單參數與綁卡 URL', async () => {
    const { url, params } = await buildBindingParams(BASE_OPTS)

    expect(url).toBe('https://test.esafe.com.tw/Service/Etopm.aspx')
    expect(params).toEqual({
      web: 'TESTMERCHANT01',
      MN: 100,
      OrderInfo: 'happy', // orderInfo 未給 → fallback serviceCode
      Td: 'TD_TEST_001',
      sna: '測試用戶',
      sdt: '0912345678', // 電話清掉非數字
      email: 'test@example.com',
      note1: 'user-uuid-1',
      note2: 'happy',
      Card_Type: '2',
      userID: 'user-uuid-1',
      Term: '',
      TdReturnURL: 'https://example.com/api/payment/callback',
      // 與 chkvalue.test.ts 相同測試憑證下 chkValueBinding(100) 的預算值
      ChkValue: 'BC0D448131E9367832EAC4BB3E2B9EFCA9654C7C',
    })
  })

  it('orderInfo 有給時優先於 serviceCode', async () => {
    const { params } = await buildBindingParams({ ...BASE_OPTS, orderInfo: '旗艦方案' })
    expect(params.OrderInfo).toBe('旗艦方案')
  })

  it('電話含國碼加號與空格也只留數字', async () => {
    const { params } = await buildBindingParams({ ...BASE_OPTS, phone: '+886 912 345 678' })
    expect(params.sdt).toBe('886912345678')
  })
})
