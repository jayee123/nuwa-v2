'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Puzzle } from 'lucide-react'
import Link from 'next/link'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const MAX_TURNS = 3

export function PublicUnpackChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [turnCount, setTurnCount] = useState(0)
  const [limitReached, setLimitReached] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading || limitReached) return

    const newTurnCount = turnCount + 1
    const userMsg: ChatMessage = { role: 'user', content: text.trim() }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput('')
    setIsLoading(true)
    setTurnCount(newTurnCount)

    try {
      const res = await fetch('/api/unpack/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages,
          turnCount: newTurnCount,
        }),
      })

      if (res.status === 403) {
        setLimitReached(true)
        setIsLoading(false)
        return
      }

      // Stream the response
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let aiText = ''

      setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n')
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const data = JSON.parse(line.slice(6))
              const val = data.value || data.text || data.content || data.delta
              if (typeof val === 'string' && val.length > 0) {
                aiText += val
                const currentText = aiText
                setMessages((prev) => {
                  const updated = [...prev]
                  updated[updated.length - 1] = { role: 'assistant', content: currentText }
                  return updated
                })
              }
            } catch { /* skip non-JSON */ }
          }
        }
      }

      if (!aiText) {
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: '(小羽已回覆)' }
          return updated
        })
      }

      // Check if we just used the last turn
      if (newTurnCount >= MAX_TURNS) {
        setLimitReached(true)
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '抱歉，發生了錯誤，請重試。' },
      ])
    } finally {
      setIsLoading(false)
    }
  }, [messages, isLoading, limitReached, turnCount])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    sendMessage(input)
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-120px)] max-w-2xl flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-surface-secondary pb-4">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-brand-purple/10 text-brand-purple">
            <Puzzle className="size-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-fg-primary">我卡住了</p>
            <p className="text-xs text-fg-muted">
              跟小羽說說你的困擾，免費體驗 {MAX_TURNS} 次
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto py-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Puzzle className="mx-auto size-12 text-brand-purple/30" />
              <p className="mt-4 text-sm text-fg-muted">
                說說你跟家人、伴侶或同事之間遇到的問題
              </p>
              <p className="mt-1 text-xs text-fg-muted">
                小羽會幫你拆解，給你今晚就能用的建議
              </p>
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-brand-purple text-white'
                  : 'bg-surface-secondary text-fg-primary'
              }`}
            >
              {m.content ? (
                m.content.split(/\n\n+/).map((para, pi) => (
                  <p key={pi} className={pi > 0 ? 'mt-3' : ''}>
                    {para.split('\n').map((line, li) => (
                      <span key={li}>
                        {li > 0 && <br />}
                        {line}
                      </span>
                    ))}
                  </p>
                ))
              ) : (
                <span className="animate-pulse text-fg-muted">思考中...</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* CTA after limit reached */}
      {limitReached && (
        <div className="shrink-0 rounded-xl border border-brand-purple/30 bg-brand-purple/5 p-4 text-center">
          <p className="text-sm font-medium text-fg-primary">
            想繼續聊？免費註冊開始你的練習旅程
          </p>
          <Link
            href="/register"
            className="mt-3 inline-block rounded-lg bg-brand-purple px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-purple/90"
          >
            免費註冊
          </Link>
        </div>
      )}

      {/* Input */}
      {!limitReached && (
        <form
          onSubmit={handleSubmit}
          className="flex shrink-0 items-center gap-2 border-t border-surface-secondary pt-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="說說你遇到的問題..."
            disabled={isLoading}
            className="flex-1 rounded-xl border border-surface-secondary bg-white px-4 py-2.5 text-sm text-fg-primary outline-none placeholder:text-fg-muted focus:border-brand-purple disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="flex size-10 items-center justify-center rounded-xl bg-brand-purple text-white transition-colors hover:bg-brand-purple/90 disabled:opacity-50"
          >
            <Send className="size-4" />
          </button>
        </form>
      )}
    </div>
  )
}
