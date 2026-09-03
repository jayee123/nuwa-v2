/**
 * 動態選項 — 依 stage 回傳
 * Spec: v2/docs/SPEC_STUCK_UNPACK.md §5.2
 * Aligned with: Steven's v1.3.8 Lead & Probe funnel
 */

import type { UnpackStage } from './prompts'

export interface UnpackOption {
  id: string
  label: string
  prompt?: string
}

const OPTIONS: Record<UnpackStage, UnpackOption[]> = {
  diagnose: [
    { id: 'try_action', label: '試了再回來告訴我結果', prompt: '我試了你的建議，結果是…' },
    { id: 'understand_other', label: '我想更了解他為什麼這樣' },
    { id: '4s', label: '教我一句話（4S）', prompt: '4S' },
  ],
  step2_ab: [
    { id: 'give_mbti', label: '我知道他的個性傾向' },
    { id: '4s', label: '教我一句話（4S）', prompt: '4S' },
    { id: 'look_self', label: '我想先看看自己的部分' },
  ],
  deep_mbti: [
    { id: '4s', label: '教我一句話（4S）', prompt: '4S' },
    { id: 'try_action', label: '我先去試試看', prompt: '我想試試看，下次遇到這種情況我會…' },
    { id: 'look_self', label: '想回來看看自己' },
  ],
  '4s_handler': [
    { id: 'try_rehearse', label: '我想預演他的反應' },
    { id: 'deep_version', label: '給我完整深度版', prompt: '深度版' },
    { id: 'try_action', label: '我先去試試這句話', prompt: '我想試試看這句話' },
  ],
  step3_paths: [
    { id: 'path_a', label: '① 只看對方視角', prompt: '1' },
    { id: 'path_b', label: '② 先穩住我自己', prompt: '2' },
    { id: 'path_c', label: '③ 完整深度版 ⭐', prompt: '深度版' },
  ],
  path_c: [
    { id: 'rehearse', label: '陪我預演他的反應' },
    { id: 'start_journey', label: '開始 21 天練習' },
    { id: 'try_action', label: '我先去試試看', prompt: '我先去試試看' },
  ],
  lead: [
    { id: 'start_journey', label: '開始 21 天練習' },
    { id: 'continue', label: '再聊聊現在的狀況' },
    { id: 'not_now', label: '暫時不用，我先試試' },
  ],
}

export function getOptionsForStage(stage: UnpackStage): UnpackOption[] {
  return OPTIONS[stage]
}

/**
 * 偵測 4S trigger word
 * Steven v1.3.8: 「4S」「4s」「4 S」「給我 4S」「想試 4S」「教我 4S」
 */
export function is4sTrigger(text: string): boolean {
  const trimmed = text.trim().toLowerCase()
  return /^(4\s*s|給我\s*4\s*s|想試\s*4\s*s|教我\s*4\s*s)$/i.test(trimmed)
}

/**
 * 偵測 Step 3 Path C 直接 trigger word
 * Steven v1.3.8: 「深度版」「完整」「③」「3」「完整版」「全部」「整套」
 */
export function isDeepVersionTrigger(text: string): boolean {
  const trimmed = text.trim()
  return /^(深度版|完整|完整版|全部|整套|③|3)$/.test(trimmed)
}
