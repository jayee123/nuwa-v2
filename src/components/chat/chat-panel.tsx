'use client'

import { useRef, useEffect, useState, useMemo } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { Send, CheckCircle, ChevronDown, ChevronUp, BookOpen } from 'lucide-react'
import { Message } from '@/components/chat/message'
import { Button } from '@/components/ui/button'

interface ChatPanelProps {
  topicId: string | null
  teacherId: string | null
  serviceId: string
  initialMessages?: { role: 'user' | 'assistant'; content: string }[]
  dayLabel?: string
}

interface CourseDay {
  day: number
  title: string
  theme: string
  objectives: string[]
  actions: string[]
  reflectionQuestions: string[]
  coreTip: string
  variationTip?: string
}

interface JourneyInfo {
  id: string
  currentDay: number
  mbtiSelf: string | null
  mbtiPartner: string | null
  partnerNickname: string | null
  relationshipType: string
  goalStatement: string | null
}

function getTextContent(parts: { type: string; text?: string }[]): string {
  return parts
    .filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text)
    .join('')
}

export function ChatPanel({
  topicId,
  teacherId,
  serviceId,
  initialMessages = [],
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [input, setInput] = useState('')

  // Journey state
  const [journey, setJourney] = useState<JourneyInfo | null>(null)
  const [course, setCourse] = useState<CourseDay | null>(null)
  const [todayCompleted, setTodayCompleted] = useState(false)
  const [showCourse, setShowCourse] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [journeyLoaded, setJourneyLoaded] = useState(false)

  // Load journey + today's course
  useEffect(() => {
    if (!serviceId) return
    fetch(`/api/day?serviceId=${serviceId}`)
      .then((res) => res.json())
      .then((data) => {
        setJourney(data.journey ?? null)
        setCourse(data.course ?? null)
        setTodayCompleted(data.todayCompleted ?? false)
        setJourneyLoaded(true)
      })
      .catch(() => setJourneyLoaded(true))
  }, [serviceId])

  // Chat transport
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        body: { topicId, teacherId, serviceId },
      }),
    [topicId, teacherId, serviceId]
  )

  const { messages, sendMessage, status, error, setMessages } = useChat({
    id: topicId ?? 'new',
    transport,
  })

  const isLoading = status === 'submitted' || status === 'streaming'

  useEffect(() => {
    if (initialMessages.length > 0) {
      setMessages(
        initialMessages.map((m, i) => ({
          id: `hist-${i}`,
          role: m.role,
          parts: [{ type: 'text' as const, text: m.content }],
        }))
      )
    } else {
      setMessages([])
    }
  }, [topicId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    sendMessage({ text: input.trim() })
    setInput('')
  }

  async function handleCompleteDay() {
    if (!journey || completing) return
    setCompleting(true)
    try {
      const res = await fetch('/api/day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ journeyId: journey.id }),
      })
      if (res.ok) {
        const data = await res.json()
        setTodayCompleted(true)
        if (data.nextDay) {
          setJourney((prev) => prev ? { ...prev, currentDay: data.nextDay } : prev)
          // Reload next day's course
          const dayRes = await fetch(`/api/day?serviceId=${serviceId}`)
          const dayData = await dayRes.json()
          setCourse(dayData.course ?? null)
          setTodayCompleted(dayData.todayCompleted ?? false)
        }
      }
    } finally {
      setCompleting(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header — Day indicator */}
      {journey && course && (
        <div className="shrink-0">
          <button
            onClick={() => setShowCourse(!showCourse)}
            className="flex w-full items-center justify-between bg-brand-purple px-4 py-2.5"
          >
            <div className="flex items-center gap-2">
              <BookOpen className="size-3.5 text-white/70" />
              <span className="text-xs font-medium text-white">
                Day {journey.currentDay}：{course.title}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] text-white">
                {journey.currentDay}/21
              </span>
              {showCourse ? (
                <ChevronUp className="size-3.5 text-white/70" />
              ) : (
                <ChevronDown className="size-3.5 text-white/70" />
              )}
            </div>
          </button>

          {/* Expandable course content */}
          {showCourse && (
            <div className="max-h-64 overflow-y-auto border-b border-dark-elevated bg-dark-surface px-4 py-3 text-xs">
              <p className="font-medium text-fg-inverse">{course.theme}</p>
              <p className="mt-1 text-fg-muted">{course.coreTip}</p>

              {course.actions.length > 0 && (
                <div className="mt-2">
                  <p className="font-medium text-brand-teal">今日行動</p>
                  <ul className="mt-1 space-y-0.5 text-fg-muted">
                    {course.actions.map((a, i) => (
                      <li key={i}>• {a}</li>
                    ))}
                  </ul>
                </div>
              )}

              {course.reflectionQuestions.length > 0 && (
                <div className="mt-2">
                  <p className="font-medium text-brand-orange">反思問題</p>
                  <ul className="mt-1 space-y-0.5 text-fg-muted">
                    {course.reflectionQuestions.map((q, i) => (
                      <li key={i}>• {q}</li>
                    ))}
                  </ul>
                </div>
              )}

              {course.variationTip && (
                <p className="mt-2 rounded bg-brand-purple/10 p-2 text-fg-muted">
                  💡 {course.variationTip}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* No journey — show setup prompt */}
      {journeyLoaded && !journey && (
        <div className="shrink-0 bg-brand-purple/10 px-4 py-3">
          <p className="text-xs text-fg-muted">尚未開始 21 天練習</p>
          <JourneySetup serviceId={serviceId} onCreated={(j) => {
            setJourney(j)
            // Reload course
            fetch(`/api/day?serviceId=${serviceId}`)
              .then((res) => res.json())
              .then((data) => setCourse(data.course ?? null))
          }} />
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto bg-dark-surface p-4"
      >
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-sm text-fg-muted">
              {journey ? `開始和小羽聊今天的練習吧 🌱` : '開始和 AI 家教對話吧'}
            </p>
          </div>
        )}
        {messages.map((m) => (
          <Message
            key={m.id}
            role={m.role as 'user' | 'assistant'}
            content={getTextContent(m.parts as { type: string; text?: string }[])}
          />
        ))}
        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex gap-3">
            <div className="size-8 shrink-0 rounded-full bg-brand-teal/30" />
            <div className="rounded-2xl bg-dark-elevated px-4 py-3 text-sm text-fg-inverse">
              <span className="animate-pulse">思考中...</span>
            </div>
          </div>
        )}
      </div>

      {/* Complete day button */}
      {journey && !todayCompleted && messages.length >= 4 && (
        <div className="shrink-0 border-t border-dark-elevated bg-dark-surface px-4 py-2">
          <button
            onClick={handleCompleteDay}
            disabled={completing}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-teal py-2 text-xs font-medium text-white transition-colors hover:bg-brand-teal/90 disabled:opacity-50"
          >
            <CheckCircle className="size-3.5" />
            {completing ? '完成中...' : `完成 Day ${journey.currentDay} 練習`}
          </button>
        </div>
      )}

      {todayCompleted && journey && (
        <div className="shrink-0 border-t border-dark-elevated bg-brand-teal/10 px-4 py-2 text-center text-xs text-brand-teal">
          ✓ Day {journey.currentDay - 1} 已完成！
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="shrink-0 bg-destructive/20 px-4 py-2 text-xs text-destructive">
          發送失敗：{(() => {
            try {
              const parsed = JSON.parse(error.message)
              return parsed.error || '請重試'
            } catch {
              return error.message || '請重試'
            }
          })()}
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="flex shrink-0 items-center gap-2 border-t border-dark-elevated bg-dark-surface px-4 py-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="輸入你的回應..."
          className="flex-1 rounded-xl bg-dark-elevated px-4 py-2.5 text-sm text-fg-inverse outline-none placeholder:text-fg-muted"
        />
        <Button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="size-10 rounded-full bg-brand-purple p-0 text-white hover:bg-brand-purple/90 disabled:opacity-50"
          size="icon"
        >
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  )
}

// --- Journey Setup inline component ---
function JourneySetup({ serviceId, onCreated }: { serviceId: string; onCreated: (j: JourneyInfo) => void }) {
  const [step, setStep] = useState(0)
  const [mbtiSelf, setMbtiSelf] = useState('')
  const [mbtiPartner, setMbtiPartner] = useState('')
  const [partnerNickname, setPartnerNickname] = useState('')
  const [relationshipType, setRelationshipType] = useState('couple')
  const [goalStatement, setGoalStatement] = useState('')
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    setCreating(true)
    try {
      const res = await fetch('/api/journey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId,
          mbtiSelf: mbtiSelf || null,
          mbtiPartner: mbtiPartner || null,
          partnerNickname: partnerNickname || '對方',
          relationshipType,
          goalStatement: goalStatement || null,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        onCreated({
          id: data.journey.id,
          currentDay: 1,
          mbtiSelf: data.journey.mbti_self,
          mbtiPartner: data.journey.mbti_partner,
          partnerNickname: data.journey.partner_nickname,
          relationshipType: data.journey.relationship_type,
          goalStatement: data.journey.goal_statement,
        })
      }
    } finally {
      setCreating(false)
    }
  }

  const MBTI_TYPES = ['ISTJ','ISFJ','INFJ','INTJ','ISTP','ISFP','INFP','INTP','ESTP','ESFP','ENFP','ENTP','ESTJ','ESFJ','ENFJ','ENTJ']

  if (step === 0) {
    return (
      <div className="mt-2 space-y-2">
        <p className="text-xs font-medium text-fg-inverse">開始 21 天幸福關係練習</p>
        <button
          onClick={() => setStep(1)}
          className="w-full rounded-lg bg-brand-purple py-2 text-xs font-medium text-white hover:bg-brand-purple/90"
        >
          開始設定 →
        </button>
      </div>
    )
  }

  if (step === 1) {
    return (
      <div className="mt-2 space-y-2">
        <p className="text-xs font-medium text-fg-inverse">你的 MBTI 類型？（選填）</p>
        <div className="flex flex-wrap gap-1">
          {MBTI_TYPES.map((t) => (
            <button key={t} onClick={() => { setMbtiSelf(t); setStep(2) }}
              className={`rounded px-1.5 py-0.5 text-[10px] ${mbtiSelf === t ? 'bg-brand-purple text-white' : 'bg-dark-elevated text-fg-muted hover:text-fg-inverse'}`}>
              {t}
            </button>
          ))}
        </div>
        <button onClick={() => setStep(2)} className="text-[10px] text-fg-muted hover:underline">跳過</button>
      </div>
    )
  }

  if (step === 2) {
    return (
      <div className="mt-2 space-y-2">
        <p className="text-xs font-medium text-fg-inverse">對方的 MBTI？（選填）</p>
        <div className="flex flex-wrap gap-1">
          {MBTI_TYPES.map((t) => (
            <button key={t} onClick={() => { setMbtiPartner(t); setStep(3) }}
              className={`rounded px-1.5 py-0.5 text-[10px] ${mbtiPartner === t ? 'bg-brand-purple text-white' : 'bg-dark-elevated text-fg-muted hover:text-fg-inverse'}`}>
              {t}
            </button>
          ))}
        </div>
        <button onClick={() => setStep(3)} className="text-[10px] text-fg-muted hover:underline">跳過</button>
      </div>
    )
  }

  if (step === 3) {
    return (
      <div className="mt-2 space-y-2">
        <p className="text-xs font-medium text-fg-inverse">關係類型</p>
        <div className="flex gap-2">
          {[['couple','伴侶'],['parent_child','親子'],['workplace','職場']].map(([val, label]) => (
            <button key={val} onClick={() => { setRelationshipType(val); setStep(4) }}
              className={`flex-1 rounded-lg py-1.5 text-[10px] ${relationshipType === val ? 'bg-brand-purple text-white' : 'bg-dark-elevated text-fg-muted hover:text-fg-inverse'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mt-2 space-y-2">
      <p className="text-xs font-medium text-fg-inverse">對方的暱稱？</p>
      <input value={partnerNickname} onChange={(e) => setPartnerNickname(e.target.value)}
        placeholder="例如：老公、媽媽、主管"
        className="w-full rounded-lg bg-dark-elevated px-3 py-1.5 text-xs text-fg-inverse outline-none placeholder:text-fg-muted" />
      <p className="text-xs font-medium text-fg-inverse">你的目標？（選填）</p>
      <input value={goalStatement} onChange={(e) => setGoalStatement(e.target.value)}
        placeholder="例如：改善和伴侶的溝通品質"
        className="w-full rounded-lg bg-dark-elevated px-3 py-1.5 text-xs text-fg-inverse outline-none placeholder:text-fg-muted" />
      <button onClick={handleCreate} disabled={creating}
        className="w-full rounded-lg bg-brand-purple py-2 text-xs font-medium text-white hover:bg-brand-purple/90 disabled:opacity-50">
        {creating ? '建立中...' : '🚀 開始 21 天練習'}
      </button>
    </div>
  )
}
