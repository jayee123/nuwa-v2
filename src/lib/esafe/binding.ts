import { chkValueBinding } from './chkvalue'
import { getSecretParam } from '@/lib/secret-params'

/**
 * Generate form params for esafe binding (Etopm.aspx POST)
 */
export async function buildBindingParams(opts: {
  amount: number
  orderId: string
  customerName: string
  phone: string
  email: string
  userId: string
  serviceCode: string
  callbackUrl: string
  orderInfo?: string
}) {
  const merchantId = await getSecretParam('ESAFE_MERCHANT_ID')
  const bindUrl = await getSecretParam('ESAFE_BIND_URL')

  // 電話號碼只保留數字（eSafe 不接受特殊符號）
  const cleanPhone = opts.phone.replace(/[^0-9]/g, '')

  return {
    url: bindUrl,
    params: {
      web: merchantId,
      MN: opts.amount,
      OrderInfo: opts.orderInfo || opts.serviceCode,
      Td: opts.orderId,
      sna: opts.customerName,
      sdt: cleanPhone,
      email: opts.email,
      note1: opts.userId,
      note2: opts.serviceCode,
      Card_Type: '2',
      userID: opts.userId,
      Term: '',
      TdReturnURL: opts.callbackUrl,
      ChkValue: await chkValueBinding(opts.amount),
    },
  }
}
