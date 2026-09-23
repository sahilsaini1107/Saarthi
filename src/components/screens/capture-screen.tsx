'use client'

// Capture hub (Phase 6): one screen, four ways to skip typing —
//   Voice    → record → ASR → draft
//   Message  → paste a bank SMS / WhatsApp forward → rules+LLM → draft
//   Receipt  → photo → vision model → draft
//   Import   → CSV statement → column mapping → bulk import with dedupe
// Every AI path funnels into the SAME Quick-Add review sheet (source tag
// preserved), so nothing lands in the ledger without one confirming tap.

import { useMemo, useRef, useState } from 'react'
import { useUi } from '@/components/saarthi-app'
import {
  useAccounts,
  useCategories,
  useImportCsv,
  useParseCaptureReceipt,
  useParseCaptureText,
  useParseCaptureVoice,
} from '@/hooks/queries'
import { useVoiceRecorder } from '@/hooks/use-voice-recorder'
import { QuickAddSheet, QuickAddPreset } from '@/components/money/quick-add-sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState, ErrorCard, SectionHeader, SkeletonRow } from '@/components/ui/saarthi'
import { csvDraftRows, detectCsvMapping, parseCsv, CsvDraftRow } from '@/lib/csv'
import { formatINR, formatINRCompact } from '@/lib/money'
import { formatDayLabel } from '@/lib/date'
import { cn } from '@/lib/utils'
import { Camera, FileUp, Mic, MessageSquareText, Square, Trash2 } from 'lucide-react'
import type { CaptureParseResponse } from '@/lib/types'

type Tab = 'voice' | 'message' | 'receipt' | 'import'

const TABS: Array<{ key: Tab; label: string; icon: typeof Mic }> = [
  { key: 'voice', label: 'Voice', icon: Mic },
  { key: 'message', label: 'Message', icon: MessageSquareText },
  { key: 'receipt', label: 'Receipt', icon: Camera },
  { key: 'import', label: 'Import', icon: FileUp },
]

const SOURCE_LABEL: Record<string, string> = {
  rules: 'parsed on-device',
  llm: 'AI parsed',
  'asr+rules': 'voice → parsed on-device',
  'asr+llm': 'voice → AI parsed',
  vision: 'receipt reader',
}

export function CaptureScreen({ initialTab }: { initialTab?: Tab }) {
  const { navigate } = useUi()
  const [tab, setTab] = useState<Tab>(initialTab ?? 'voice')

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1 px-1">
        <button
          type="button"
          onClick={() => navigate('/money')}
          className="self-start text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          ← Money
        </button>
        <h1 className="text-2xl font-bold tracking-tight">Capture</h1>
        <p className="text-sm text-muted-foreground">Log money without typing — speak, paste, or snap. You always confirm before anything is saved.</p>
      </header>

      <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted p-1" role="tablist" aria-label="Capture mode">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex h-9 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-semibold transition-all',
                tab === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
              )}
            >
              <Icon className="size-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'voice' && <VoiceTab />}
      {tab === 'message' && <MessageTab />}
      {tab === 'receipt' && <ReceiptTab />}
      {tab === 'import' && <ImportTab />}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Shared draft card                                                   */
/* ------------------------------------------------------------------ */

function DraftCard({
  result,
  onSave,
  extra,
}: {
  result: CaptureParseResponse
  onSave: () => void
  extra?: React.ReactNode
}) {
  const hasAmount = result.amountPaise != null
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {SOURCE_LABEL[result.engine] ?? 'parsed'}
        </p>
        <span className="text-xs text-muted-foreground">{Math.round(result.confidence * 100)}% sure</span>
      </div>

      {result.transcript && (
        <p className="mt-2 rounded-xl bg-muted px-3 py-2 text-sm italic text-muted-foreground">“{result.transcript}”</p>
      )}

      <div className="mt-3 flex items-baseline gap-2">
        <span className={cn('text-3xl font-bold tabular-nums', !hasAmount && 'text-muted-foreground')}>
          {result.amountPaise != null ? formatINR(result.amountPaise) : '—'}
        </span>
        {result.direction && (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-semibold',
              result.direction === 'out' ? 'bg-expense/10 text-expense' : 'bg-income/10 text-income',
            )}
          >
            {result.direction === 'out' ? 'Expense' : 'Income'}
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>{formatDayLabel(result.dateISO)}</span>
        {result.note && <span className="max-w-full truncate">{result.note}</span>}
      </div>

      {!hasAmount && (
        <p className="mt-2 text-sm text-expense">No amount found — you can still add it manually.</p>
      )}
      {extra}

      <Button className="mt-4 h-11 w-full rounded-xl font-semibold" onClick={onSave}>
        Review &amp; save
      </Button>
      <p className="mt-2 text-center text-xs text-muted-foreground">Nothing is saved until you confirm.</p>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Voice                                                               */
/* ------------------------------------------------------------------ */

function VoiceTab() {
  const rec = useVoiceRecorder()
  const parse = useParseCaptureVoice()
  const [result, setResult] = useState<CaptureParseResponse | null>(null)
  const [preset, setPreset] = useState<QuickAddPreset | null>(null)

  async function onStop() {
    const recording = await rec.stop()
    if (!recording) return
    parse.mutate(
      { audioBase64: recording.wavBase64, suggestCategory: true },
      { onSuccess: (r) => setResult(r) },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col items-center gap-3 rounded-2xl border bg-card p-6 shadow-sm">
        <button
          type="button"
          aria-label={rec.state === 'recording' ? 'Stop recording' : 'Start recording'}
          onClick={() => (rec.state === 'recording' ? onStop() : rec.start())}
          disabled={rec.state === 'encoding' || parse.isPending}
          className={cn(
            'flex size-24 items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95',
            rec.state === 'recording' ? 'bg-expense animate-pulse' : 'bg-primary',
          )}
        >
          {rec.state === 'recording' ? <Square className="size-8" /> : <Mic className="size-10" />}
        </button>
        <p className="text-sm font-medium">
          {rec.state === 'recording'
            ? `Listening… ${rec.seconds}s (tap to stop)`
            : rec.state === 'encoding' || parse.isPending
              ? 'Transcribing…'
              : 'Tap to record'}
        </p>
        <p className="text-center text-xs text-muted-foreground">
          Try: <span className="italic">“Spent 250 on Swiggy yesterday”</span>
        </p>
        {rec.state === 'recording' && (
          <button type="button" onClick={rec.cancel} className="text-xs font-medium text-muted-foreground hover:text-foreground">
            Cancel
          </button>
        )}
        {rec.error && <p className="text-sm text-expense">{rec.error}</p>}
      </section>

      {parse.isError && !result && <ErrorCard message={(parse.error as Error).message} onRetry={() => parse.reset()} />}

      {result && (
        <DraftCard
          result={result}
          onSave={() => setPreset({ source: 'voice', direction: result.direction ?? 'out', amountPaise: result.amountPaise, date: result.dateISO, note: result.note, categoryId: result.categoryId })}
          extra={
            <button
              type="button"
              onClick={() => {
                setResult(null)
                parse.reset()
              }}
              className="mt-3 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <Trash2 className="size-3" /> Discard and record again
            </button>
          }
        />
      )}

      <QuickAddSheet
        open={preset != null}
        onOpenChange={(o) => !o && setPreset(null)}
        preset={preset ?? undefined}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Message (bank SMS / WhatsApp forward)                               */
/* ------------------------------------------------------------------ */

const MESSAGE_EXAMPLES = [
  'Rs 1,250 debited from HDFC a/c xx421 on 04-09-26 for Amazon purchase',
  'Paid ₹340 via UPI to Chai Point yesterday',
  'INR 45,000 salary credited today',
]

function MessageTab() {
  const parse = useParseCaptureText()
  const [text, setText] = useState('')
  const [result, setResult] = useState<CaptureParseResponse | null>(null)
  const [preset, setPreset] = useState<QuickAddPreset | null>(null)

  function onParse() {
    parse.mutate(
      { text, suggestCategory: true },
      {
        onSuccess: (r) => setResult(r),
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste a bank SMS or forward a WhatsApp message here…"
          rows={4}
          maxLength={4000}
          className="w-full resize-none rounded-xl bg-muted p-3 text-sm outline-none placeholder:text-muted-foreground"
          aria-label="Message text"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {MESSAGE_EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setText(ex)}
              className="rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {ex.length > 34 ? `${ex.slice(0, 34)}…` : ex}
            </button>
          ))}
        </div>
        <Button className="mt-3 h-11 w-full rounded-xl font-semibold" onClick={onParse} disabled={!text.trim() || parse.isPending}>
          {parse.isPending ? 'Parsing…' : 'Parse message'}
        </Button>
      </section>

      {result && (
        <DraftCard
          result={result}
          onSave={() => setPreset({ source: 'whatsapp', direction: result.direction ?? 'out', amountPaise: result.amountPaise, date: result.dateISO, note: result.note, categoryId: result.categoryId })}
          extra={
            <button
              type="button"
              onClick={() => {
                setResult(null)
                setText('')
              }}
              className="mt-3 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <Trash2 className="size-3" /> Clear
            </button>
          }
        />
      )}

      <QuickAddSheet
        open={preset != null}
        onOpenChange={(o) => !o && setPreset(null)}
        preset={preset ?? undefined}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Receipt photo                                                       */
/* ------------------------------------------------------------------ */

function ReceiptTab() {
  const parse = useParseCaptureReceipt()
  const [result, setResult] = useState<CaptureParseResponse | null>(null)
  const [preset, setPreset] = useState<QuickAddPreset | null>(null)
  const [imageData, setImageData] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function onFile(file: File | undefined) {
    if (!file) return
    if (file.size > 8 * 1024 * 1024) {
      parse.reset()
      setResult(null)
      alert('Image too large (max 8 MB)')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result)
      setImageData(dataUrl)
      const base64 = dataUrl.split(',')[1] ?? ''
      parse.mutate(
        { imageBase64: base64, suggestCategory: true },
        { onSuccess: (r) => setResult(r) },
      )
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
          aria-label="Choose or take a receipt photo"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex h-36 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Camera className="size-8" />
          <span className="text-sm font-medium">Take or choose a receipt photo</span>
          <span className="text-xs">Total is read on-device — no photo is stored</span>
        </button>

        {imageData && (
          <div className="mt-3">
            <img src={imageData} alt="Receipt preview" className="max-h-48 w-full rounded-xl object-contain" />
          </div>
        )}
        {parse.isPending && <p className="mt-3 text-center text-sm text-muted-foreground">Reading the receipt…</p>}
      </section>

      {parse.isError && <ErrorCard message={(parse.error as Error).message} onRetry={() => parse.reset()} />}

      {result && (
        <DraftCard
          result={result}
          onSave={() => setPreset({ source: 'ocr', direction: 'out', amountPaise: result.amountPaise, date: result.dateISO, note: result.note, categoryId: result.categoryId })}
          extra={
            <button
              type="button"
              onClick={() => {
                setResult(null)
                setImageData(null)
                if (fileRef.current) fileRef.current.value = ''
              }}
              className="mt-3 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <Trash2 className="size-3" /> Discard and try another photo
            </button>
          }
        />
      )}

      <QuickAddSheet
        open={preset != null}
        onOpenChange={(o) => !o && setPreset(null)}
        preset={preset ?? undefined}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* CSV import                                                          */
/* ------------------------------------------------------------------ */

const SAMPLE_CSV = `Date,Narration,Withdrawal Amt,Deposit Amt
01/09/2026,SWIGGY ORDER 1234,"412.00",
03/09/2026,SALARY SEPTEMBER,,"45000.00"
05/09/2026,UBER RIDE,"230.50",
05/09/2026,ATM WITHDRAWAL,"2000.00",
bad-row,x,y,z`

interface ParsedImport {
  mapping: ReturnType<typeof detectCsvMapping>
  outcomes: ReturnType<typeof csvDraftRows>
  valid: number
  errors: number
}

function ImportTab() {
  const { user } = useUi()
  const accounts = useAccounts()
  const categories = useCategories()
  const importCsv = useImportCsv({ success: 'Imported {n} transactions' })
  const [raw, setRaw] = useState('')
  const [parsed, setParsed] = useState<ParsedImport | null>(null)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [done, setDone] = useState<{ created: number; skippedDuplicates: number; failed: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const pickedAccountId = accounts.data?.some((a) => a.id === accountId) ? accountId : accounts.data?.[0]?.id ?? null

  function runParse(text: string) {
    setRaw(text)
    setDone(null)
    if (!text.trim()) {
      setParsed(null)
      return
    }
    const rows = parseCsv(text)
    const mapping = detectCsvMapping(rows)
    if (!mapping) {
      setParsed({ mapping: null, outcomes: [], valid: 0, errors: rows.length })
      return
    }
    const outcomes = csvDraftRows(rows, mapping)
    setParsed({
      mapping,
      outcomes,
      valid: outcomes.filter((o) => o.draft).length,
      errors: outcomes.filter((o) => o.error).length,
    })
  }

  function onFile(file: File | undefined) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => runParse(String(reader.result))
    reader.readAsText(file)
  }

  /** map a draft's free-text category name to the user's categories */
  function categoryFor(draft: CsvDraftRow): string | null {
    if (!draft.categoryName) return null
    const cats = categories.data ?? []
    const n = draft.categoryName.toLowerCase().trim()
    return (
      cats.find((c) => c.name.toLowerCase() === n)?.id ??
      cats.find((c) => c.kind === (draft.direction === 'in' ? 'income' : 'expense') && (c.name.toLowerCase().includes(n) || n.includes(c.name.toLowerCase())))?.id ??
      null
    )
  }

  const drafts = useMemo(() => parsed?.outcomes.filter((o) => o.draft).map((o) => o.draft!) ?? [], [parsed])
  const totalPaise = drafts.reduce((s, d) => s + d.amountPaise, 0)

  function onImport() {
    if (!pickedAccountId || drafts.length === 0) return
    importCsv.mutate(
      {
        accountId: pickedAccountId,
        rows: drafts.map((d) => ({
          amountPaise: d.amountPaise,
          direction: d.direction,
          date: d.date,
          note: d.note,
          categoryId: categoryFor(d),
        })),
      },
      {
        onSuccess: (r) =>
          setDone({ created: r.created, skippedDuplicates: r.skippedDuplicates, failed: r.failedRows.length }),
      },
    )
  }

  if (accounts.isLoading) return <SkeletonRow />
  if (accounts.isError) return <ErrorCard message={(accounts.error as Error).message} onRetry={() => accounts.refetch()} />

  if ((accounts.data ?? []).length === 0) {
    return (
      <EmptyState
        emoji="🏦"
        title="Add an account first"
        body="A statement imports into one account. Add the bank account it belongs to, then come back."
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">1 · Paste or choose a CSV</p>
          <button type="button" onClick={() => runParse(SAMPLE_CSV)} className="text-xs font-medium text-primary">
            Load sample
          </button>
        </div>
        <input ref={fileRef} type="file" accept=".csv,.txt,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} aria-label="Choose CSV file" />
        <textarea
          value={raw}
          onChange={(e) => runParse(e.target.value)}
          rows={5}
          placeholder="Date,Narration,Amount&#10;05/09/2026,Swiggy order,-412"
          className="mt-2 w-full resize-none rounded-xl bg-muted p-3 font-mono text-xs outline-none placeholder:text-muted-foreground"
          aria-label="CSV text"
        />
        <div className="mt-2 flex gap-2">
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => fileRef.current?.click()}>
            <FileUp className="size-4" /> Choose file
          </Button>
          {raw && (
            <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground" onClick={() => { setRaw(''); setParsed(null); setDone(null) }}>
              Clear
            </Button>
          )}
        </div>
      </section>

      {parsed && (
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <p className="text-sm font-medium">2 · Check the preview</p>
          {!parsed.mapping ? (
            <p className="mt-2 text-sm text-expense">
              Could not find a date and an amount column. The file needs a date column and at least one money column (amount or debit/credit).
            </p>
          ) : (
            <>
              <p className="mt-1 text-xs text-muted-foreground">
                Detected: date · {parsed.mapping.debitCol != null || parsed.mapping.creditCol != null ? 'debit/credit columns' : 'single amount column'}
                {parsed.mapping.noteCol != null ? ' · narration' : ''}
                {parsed.mapping.categoryCol != null ? ' · category' : ''}
              </p>
              <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border">
                <table className="w-full text-left text-xs">
                  <tbody>
                    {parsed.outcomes.slice(0, 50).map((o) => (
                      <tr key={o.rowIdx} className="border-b last:border-b-0">
                        <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">#{o.rowIdx + 1}</td>
                        {o.draft ? (
                          <>
                            <td className="px-2 py-1.5">{formatDayLabel(o.draft.date)}</td>
                            <td className="max-w-28 truncate px-2 py-1.5">{o.draft.note ?? '—'}</td>
                            <td className={cn('px-2 py-1.5 text-right font-semibold tabular-nums', o.draft.direction === 'in' ? 'text-income' : 'text-expense')}>
                              {o.draft.direction === 'in' ? '+' : '−'}{formatINRCompact(o.draft.amountPaise)}
                            </td>
                            <td className="px-2 py-1.5 text-right"><span className="text-income">ok</span></td>
                          </>
                        ) : (
                          <td colSpan={4} className="px-2 py-1.5 text-expense" title={o.error}>{o.error}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {parsed.valid} readable · {parsed.errors} problem rows · showing first {Math.min(50, parsed.outcomes.length)}
              </p>
            </>
          )}
        </section>
      )}

      {parsed?.mapping && drafts.length > 0 && (
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <p className="text-sm font-medium">3 · Import into</p>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {(accounts.data ?? []).map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setAccountId(a.id)}
                className={cn(
                  'shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                  pickedAccountId === a.id ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent',
                )}
              >
                {a.name}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {drafts.length} rows · {formatINR(totalPaise)} total. Duplicates of what&apos;s already in the ledger are skipped automatically.
          </p>
          <Button className="mt-3 h-11 w-full rounded-xl font-semibold" onClick={onImport} disabled={importCsv.isPending || !pickedAccountId}>
            {importCsv.isPending ? 'Importing…' : `Import ${drafts.length} transactions`}
          </Button>
        </section>
      )}

      {done && (
        <section className="rounded-2xl border bg-income/10 p-4 shadow-sm">
          <p className="text-sm font-semibold text-income">Import finished</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {done.created} created · {done.skippedDuplicates} duplicates skipped
            {done.failed ? ` · ${done.failed} rows failed validation` : ''}.
          </p>
          <div className="mt-2 flex gap-3">
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => { setRaw(''); setParsed(null); setDone(null) }}>
              Import another
            </Button>
          </div>
        </section>
      )}

      {parsed && parsed.mapping && parsed.errors > 0 && drafts.length === 0 && (
        <p className="rounded-xl border border-dashed p-3 text-center text-xs text-muted-foreground">
          No importable rows — fix the highlighted problems in the file and re-paste.
        </p>
      )}
    </div>
  )
}
