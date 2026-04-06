import { useState, useRef, useEffect, useCallback } from 'react'
import { MessageCircle, Send, X, Bot, User, Loader2, ImagePlus, XCircle } from 'lucide-react'
import { requestApiJson } from '@/lib/requestApiJson'

type ImageAttachment = {
  data: string // base64 without the data:... prefix
  media_type: string
  preview: string // data URL for display
}

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  images?: string[] // preview URLs for display
  tools_used?: string[]
  sql_queries?: string[]
  timestamp: Date
}

type AgentResponse = {
  answer: string
  tools_used: string[]
  sql_queries?: string[]
  provider: string
  model: string
}

type DashboardContext = {
  active_tab?: string
  selected_entities?: string[]
  total_mv?: number
  account_count?: number
  account_summary?: Record<string, unknown>
  asset_class_breakdown?: Record<string, unknown>[]
  top_positions?: Record<string, unknown>[]
  recent_transactions?: Record<string, unknown>[]
}

type Props = {
  reportDate: string
  clientName: string
  accounts: string[]
  dashboardContext?: DashboardContext
}

const SUGGESTED_QUESTIONS = [
  'Summarize this portfolio for a client meeting',
  'Show me the largest transactions this quarter',
  'Were there any transfers between accounts recently?',
  'What are the top 10 holdings by market value?',
  'How has monthly performance trended over the past year?',
]

export default function AgentChat({ reportDate, clientName, accounts, dashboardContext }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingImages, setPendingImages] = useState<ImageAttachment[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  /** Convert a File/Blob to a base64 ImageAttachment */
  const fileToAttachment = useCallback((file: File | Blob): Promise<ImageAttachment> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        // dataUrl = "data:image/png;base64,iVBOR..."
        const [header, base64] = dataUrl.split(',')
        const mediaType = header?.match(/data:(.*?);/)?.[1] || 'image/png'
        resolve({ data: base64, media_type: mediaType, preview: dataUrl })
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }, [])

  /** Handle paste — detect images on clipboard */
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const blob = item.getAsFile()
        if (blob && pendingImages.length < 3) {
          const attachment = await fileToAttachment(blob)
          setPendingImages((prev) => [...prev, attachment].slice(0, 3))
        }
        return
      }
    }
  }, [fileToAttachment, pendingImages.length])

  /** Handle file input change */
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/') && pendingImages.length < 3) {
        const attachment = await fileToAttachment(file)
        setPendingImages((prev) => [...prev, attachment].slice(0, 3))
      }
    }
    // Reset so the same file can be selected again
    e.target.value = ''
  }, [fileToAttachment, pendingImages.length])

  /** Remove a pending image */
  const removePendingImage = useCallback((index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const sendMessage = useCallback(
    async (text: string) => {
      if ((!text.trim() && pendingImages.length === 0) || loading) return

      const imagePreviews = pendingImages.map((img) => img.preview)
      const userMsg: Message = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: text.trim() || '(screenshot attached)',
        images: imagePreviews.length > 0 ? imagePreviews : undefined,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, userMsg])
      setInput('')
      setLoading(true)
      setError(null)

      // Capture images before clearing
      const imagesToSend = pendingImages.map((img) => ({
        data: img.data,
        media_type: img.media_type,
      }))
      setPendingImages([])

      try {
        const history = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }))

        const res = await requestApiJson<AgentResponse>('/api/cio/agent/chat', {
          method: 'POST',
          body: {
            message: text.trim() || 'Please analyze the attached screenshot(s).',
            report_date: reportDate,
            client_name: clientName,
            accounts,
            context_data: dashboardContext || undefined,
            images: imagesToSend.length > 0 ? imagesToSend : undefined,
            history,
          },
        })

        const assistantMsg: Message = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: res.answer,
          tools_used: res.tools_used,
          sql_queries: res.sql_queries,
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, assistantMsg])
      } catch (err: any) {
        setError(err.message || 'Failed to get response')
      } finally {
        setLoading(false)
      }
    },
    [loading, messages, pendingImages, reportDate, clientName, accounts, dashboardContext]
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage(input)
    }
  }

  return (
    <>
      {/* Chat Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-teal-500 text-white shadow-lg shadow-emerald-900/30 transition-all hover:scale-105 hover:shadow-xl"
        >
          <MessageCircle className="size-6" />
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[600px] w-[420px] flex-col overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-900 shadow-2xl shadow-black/50">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-750 bg-gradient-to-r from-emerald-900/50 to-teal-900/40 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-700/60">
                <Bot className="size-4 text-emerald-300" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Portfolio Assistant</h3>
                <p className="text-[10px] text-emerald-400/80">
                  {clientName || 'Select a client'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-750 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {messages.length === 0 && !loading && (
              <div className="flex flex-col gap-3 pt-4">
                <div className="flex items-center gap-2 text-center">
                  <MessageCircle className="size-4 text-emerald-400" />
                  <p className="text-xs font-medium text-emerald-400">
                    Ask me anything about this portfolio
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => void sendMessage(q)}
                      className="rounded-lg border border-neutral-750 bg-neutral-800/50 px-3 py-2 text-left text-xs text-secondary-foreground transition-colors hover:border-emerald-700/50 hover:bg-neutral-800 hover:text-primary-foreground"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`mb-3 flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-800/50">
                    <Bot className="size-3.5 text-emerald-400" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-emerald-700/40 text-primary-foreground'
                      : 'bg-neutral-800 text-primary-foreground'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-invert prose-sm max-w-none">
                      <MarkdownRenderer content={msg.content} />
                    </div>
                  ) : (
                    <>
                      {msg.images && msg.images.length > 0 && (
                        <div className="mb-1.5 flex flex-wrap gap-1.5">
                          {msg.images.map((src, imgIdx) => (
                            <img
                              key={imgIdx}
                              src={src}
                              alt={`Attached ${imgIdx + 1}`}
                              className="max-h-32 max-w-[200px] rounded-md border border-neutral-600 object-contain"
                            />
                          ))}
                        </div>
                      )}
                      {msg.content}
                    </>
                  )}
                  {msg.sql_queries && msg.sql_queries.length > 0 && (
                    <details className="mt-2 border-t border-neutral-700 pt-1.5">
                      <summary className="cursor-pointer text-[10px] text-emerald-500 hover:text-emerald-400">
                        {msg.sql_queries.length} SQL {msg.sql_queries.length === 1 ? 'query' : 'queries'} executed
                      </summary>
                      {msg.sql_queries.map((q, qi) => (
                        <pre
                          key={qi}
                          className="mt-1 overflow-x-auto rounded bg-neutral-900 p-2 text-[10px] leading-relaxed text-neutral-400"
                        >
                          {q}
                        </pre>
                      ))}
                    </details>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-800/50">
                    <User className="size-3.5 text-blue-400" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="mb-3 flex gap-2.5">
                <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-800/50">
                  <Bot className="size-3.5 text-emerald-400" />
                </div>
                <div className="rounded-xl bg-neutral-800 px-3.5 py-2.5">
                  <div className="flex items-center gap-2 text-xs text-secondary-foreground">
                    <Loader2 className="size-3.5 animate-spin text-emerald-400" />
                    Analyzing portfolio data...
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="mb-3 rounded-lg border border-rose-700/50 bg-rose-900/20 px-3 py-2 text-xs text-rose-300">
                {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Pending Image Previews */}
          {pendingImages.length > 0 && (
            <div className="flex gap-2 border-t border-neutral-750 bg-neutral-850/50 px-3 pt-2">
              {pendingImages.map((img, idx) => (
                <div key={idx} className="relative">
                  <img
                    src={img.preview}
                    alt={`Pending ${idx + 1}`}
                    className="h-16 w-auto rounded-md border border-neutral-600 object-contain"
                  />
                  <button
                    onClick={() => removePendingImage(idx)}
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-neutral-900 text-neutral-400 hover:text-rose-400"
                  >
                    <XCircle className="size-4" />
                  </button>
                </div>
              ))}
              <p className="self-end pb-1 text-[10px] text-neutral-500">
                {3 - pendingImages.length} more allowed
              </p>
            </div>
          )}

          {/* Input */}
          <div className="border-t border-neutral-750 bg-neutral-850 px-3 py-3">
            <div className="flex items-center gap-2">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => void handleFileSelect(e)}
                className="hidden"
              />
              {/* Image upload button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading || !clientName || pendingImages.length >= 3}
                title="Attach screenshot (or paste with Ctrl+V)"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-700 text-neutral-400 transition-colors hover:border-emerald-600 hover:text-emerald-400 disabled:opacity-40"
              >
                <ImagePlus className="size-4" />
              </button>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={(e) => void handlePaste(e)}
                placeholder={clientName ? 'Ask or paste a screenshot (Ctrl+V)...' : 'Select a client first'}
                disabled={loading || !clientName}
                className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-primary-foreground outline-none placeholder:text-neutral-500 focus:border-emerald-600 disabled:opacity-50"
              />
              <button
                onClick={() => void sendMessage(input)}
                disabled={loading || (!input.trim() && pendingImages.length === 0) || !clientName}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-700 text-white transition-colors hover:bg-emerald-600 disabled:opacity-40"
              >
                <Send className="size-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/** Simple markdown renderer for the agent responses */
function MarkdownRenderer({ content }: { content: string }) {
  // Split into paragraphs and handle basic markdown
  const lines = content.split('\n')

  return (
    <>
      {lines.map((line, i) => {
        const trimmed = line.trim()
        if (!trimmed) return <br key={i} />

        // Headers
        if (trimmed.startsWith('### '))
          return (
            <h4 key={i} className="mb-1 mt-2 text-xs font-bold text-emerald-400">
              {trimmed.slice(4)}
            </h4>
          )
        if (trimmed.startsWith('## '))
          return (
            <h3 key={i} className="mb-1 mt-2 text-sm font-bold text-emerald-300">
              {trimmed.slice(3)}
            </h3>
          )
        if (trimmed.startsWith('# '))
          return (
            <h2 key={i} className="mb-1 mt-2 text-sm font-bold text-white">
              {trimmed.slice(2)}
            </h2>
          )

        // Bullet points
        if (trimmed.startsWith('- ') || trimmed.startsWith('* '))
          return (
            <div key={i} className="ml-2 flex gap-1.5">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-500" />
              <span>
                <InlineMarkdown text={trimmed.slice(2)} />
              </span>
            </div>
          )

        // Numbered list
        const numMatch = trimmed.match(/^(\d+)\.\s(.+)/)
        if (numMatch)
          return (
            <div key={i} className="ml-1 flex gap-1.5">
              <span className="shrink-0 text-emerald-500">{numMatch[1]}.</span>
              <span>
                <InlineMarkdown text={numMatch[2]} />
              </span>
            </div>
          )

        // Regular paragraph
        return (
          <p key={i} className="mb-1">
            <InlineMarkdown text={trimmed} />
          </p>
        )
      })}
    </>
  )
}

function InlineMarkdown({ text }: { text: string }) {
  // Handle **bold** and *italic*
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**'))
          return (
            <strong key={i} className="font-semibold text-white">
              {part.slice(2, -2)}
            </strong>
          )
        if (part.startsWith('*') && part.endsWith('*'))
          return (
            <em key={i} className="italic text-emerald-300">
              {part.slice(1, -1)}
            </em>
          )
        return <span key={i}>{part}</span>
      })}
    </>
  )
}
