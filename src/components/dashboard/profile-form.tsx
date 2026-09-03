'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import { z } from 'zod/v4'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CopyableId } from '@/components/ui/copyable-id'
import { GENDER_OPTIONS } from '@/lib/user-fields'

const schema = z.object({
  nickname: z.string().min(1, '請輸入用戶名稱').max(50),
  // 014 把 users.email 設為 NOT NULL + UNIQUE，所以這裡必填。
  // 原本允許空字串，送出後會在 DB 撞 not-null constraint、回一個原始 Postgres 錯誤。
  email: z.string().min(1, '請輸入 Email').email('請輸入有效的 Email'),
  gender: z.string().optional(),
  birthday: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface ProfileFormProps {
  defaultValues: {
    nuwaId: string
    nickname: string
    email: string
    phone: string
    gender?: number
    birthday?: string
  }
}

export function ProfileForm({ defaultValues }: ProfileFormProps) {
  const router = useRouter()
  const [serverMsg, setServerMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      nickname: defaultValues.nickname,
      email: defaultValues.email,
      gender: defaultValues.gender != null ? String(defaultValues.gender) : undefined,
      birthday: defaultValues.birthday ?? '',
    },
  })

  async function onSubmit(data: FormValues) {
    setServerMsg(null)
    try {
      const payload = {
        ...data,
        gender: data.gender ? Number(data.gender) : null,
      }
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const json = await res.json()
        setServerMsg({ type: 'error', text: json.error || '更新失敗' })
      } else {
        setServerMsg({ type: 'success', text: '已儲存變更' })
        reset(data)
        router.refresh()
      }
    } catch {
      setServerMsg({ type: 'error', text: '網路錯誤' })
    }
  }

  const inputClass =
    'h-11 rounded-xl border-surface-secondary bg-surface-secondary text-sm placeholder:text-fg-muted focus-visible:border-brand-purple focus-visible:ring-brand-purple/30'

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      // 任何欄位一動就清掉上一次的伺服器訊息。否則「改壞 → 看到錯誤 → 改回原值」時，
      // 按鈕會因為 isDirty=false 而 disabled，紅字卻還留著，看起來像按鈕壞了。
      onChange={() => setServerMsg(null)}
      className="space-y-6"
    >
      <div className="grid gap-6 sm:grid-cols-2">
        {/* Nickname */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-fg-primary">用戶名稱</label>
          <Input
            {...register('nickname')}
            className={inputClass}
          />
          {errors.nickname && (
            <p className="text-xs text-destructive">{errors.nickname.message}</p>
          )}
        </div>

        {/* Gender */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-fg-primary">性別</label>
          <div className="flex gap-3">
            {GENDER_OPTIONS.map((g) => (
              <label
                key={g.value}
                className="flex flex-1 cursor-pointer items-center justify-center rounded-xl border border-surface-secondary bg-surface-secondary px-4 py-2.5 text-sm transition-colors has-[:checked]:border-brand-purple has-[:checked]:bg-brand-purple has-[:checked]:text-white"
              >
                <input
                  type="radio"
                  value={g.value}
                  {...register('gender')}
                  className="sr-only"
                />
                {g.label}
              </label>
            ))}
          </div>
        </div>

        {/* Email */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-fg-primary">Email</label>
          <Input
            {...register('email')}
            type="email"
            placeholder="name@example.com"
            className={inputClass}
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>

        {/* Birthday */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-fg-primary">生日</label>
          <Input
            {...register('birthday')}
            type="date"
            className={inputClass}
          />
        </div>
      </div>

      {/* Phone (read-only) */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-fg-muted">手機號碼（不可變更）</label>
        <Input
          value={defaultValues.phone}
          disabled
          className="h-11 rounded-xl border-surface-secondary bg-surface-secondary/50 text-sm text-fg-muted"
        />
      </div>

      {/* NUWA ID（唯讀）——
          公版是唯一身分來源，各 App（幸福關係、之後上架的其他 App）都用這個值
          對應到同一個人。使用者回報問題、或客服要跨 App 對帳時就是報這一串。 */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-fg-muted">NUWA ID（不可變更）</label>
        <div className="flex h-11 items-center rounded-xl border border-surface-secondary bg-surface-secondary/50 px-3">
          <CopyableId value={defaultValues.nuwaId} />
        </div>
      </div>

      {/* Message */}
      {serverMsg && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            serverMsg.type === 'success'
              ? 'bg-brand-teal/10 text-fg-primary'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          {serverMsg.text}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            reset()
            setServerMsg(null)
          }}
          disabled={isSubmitting}
          className="h-10 rounded-xl px-6 text-sm"
        >
          取消
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || !isDirty}
          className="h-10 rounded-xl bg-brand-purple px-6 text-sm font-medium text-white hover:bg-brand-purple/90 disabled:opacity-50"
        >
          {isSubmitting ? '儲存中...' : '儲存變更'}
        </Button>
      </div>
    </form>
  )
}
