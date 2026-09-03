import type { createAdminClient } from '@/lib/supabase/admin'

// 後台操作記錄：把管理者的操作寫入 admin_audit_logs。
// 記錄失敗不影響主流程（try/catch 吞掉）。
export async function logAudit(
  admin: ReturnType<typeof createAdminClient>,
  actorId: string | null,
  action: string,
  target?: string | null,
  detail?: Record<string, unknown> | null,
): Promise<void> {
  try {
    await admin.from('admin_audit_logs').insert({
      actor_id: actorId,
      action,
      target: target ?? null,
      detail: detail ?? null,
    })
  } catch {
    // 記錄失敗不阻斷操作
  }
}
