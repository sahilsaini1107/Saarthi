// Capture service (Phase 6): turn raw input — pasted bank-SMS/WhatsApp text,
// a voice recording, or a receipt photo — into a transaction DRAFT.
//
// Layering (Decision #29): the deterministic parser (lib/capture.ts) runs
// first for text inputs; the LLM is only a fallback for text the rules can't
// confidently parse, and its JSON is zod-validated + merged over the rules.
// Receipts go straight to the vision model (no rules apply to pixels).

import ZAI from 'z-ai-web-dev-sdk'
import { z } from 'zod'
import { todayISO, isValidTimezone } from '@/lib/date'
import { parseCaptureText, guessCategoryId, CaptureDirection } from '@/lib/capture'
import { HttpError } from '@/lib/api-helpers'

const MAX_TEXT_CHARS = 4_000
const MAX_AUDIO_BASE64 = 12_000_000 // ~9 MB audio
const MAX_IMAGE_BASE64 = 12_000_000 // ~9 MB image

export type CaptureEngine = 'rules' | 'llm' | 'asr+rules' | 'asr+llm' | 'vision'

export interface CaptureParseResult {
  direction: CaptureDirection | null
  amountPaise: number | null
  dateISO: string
  note: string | null
  confidence: number
  /** raw transcript (voice) so the user can verify what was heard */
  transcript?: string
  engine: CaptureEngine
}

/* ------------------------------------------------------------------ */
/* LLM structured extraction                                           */
/* ------------------------------------------------------------------ */

const llmDraftSchema = z.object({
  direction: z.enum(['in', 'out']).nullable().optional(),
  /** rupees (float) from the LLM — converted to paise here */
  amount: z.number().positive().nullable().optional(),
  /** YYYY-MM-DD if the text states a date, else null */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  note: z.string().max(120).nullable().optional(),
})

function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

async function llmStructureText(text: string, today: string): Promise<z.infer<typeof llmDraftSchema> | null> {
  const zai = await ZAI.create()
  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: 'assistant',
        content:
          'You extract expense/income facts from raw text (bank SMS, WhatsApp forwards, voice-transcript gibberish). ' +
          `Today is ${today}. Reply with ONLY a JSON object, no prose: ` +
          '{"direction": "in"|"out"|null, "amount": <positive number in rupees>|null, "date": "YYYY-MM-DD"|null, "note": "<short merchant/narration>"|null}. ' +
          'Rules: use null for anything not clearly stated. "debited/spent/paid/withdrew" = out; "credited/received/refund/salary" = in. ' +
          'amount is a NUMBER in rupees (e.g. 1250.50), never a string. date must be a real calendar date implied by the text. ' +
          'note: the merchant or purpose in a few lowercase words (e.g. "swiggy order").',
      },
      { role: 'user', content: text.slice(0, MAX_TEXT_CHARS) },
    ],
    thinking: { type: 'disabled' },
  })
  const raw = completion.choices[0]?.message?.content
  if (!raw) return null
  const parsed = llmDraftSchema.safeParse(extractJson(raw))
  return parsed.success ? parsed.data : null
}

/* ------------------------------------------------------------------ */
/* Text pipeline (rules first, LLM fallback)                           */
/* ------------------------------------------------------------------ */

export async function parseTextCapture(
  timezone: string,
  input: { text: string; categoryIdHint?: string | null },
): Promise<CaptureParseResult> {
  const text = input.text.trim()
  if (!text) throw new HttpError('Text is required', 422)
  if (text.length > MAX_TEXT_CHARS) throw new HttpError('Text too long (max 4000 chars)', 422)
  const tz = isValidTimezone(timezone) ? timezone : 'Asia/Kolkata'
  const today = todayISO(tz)
  const todayDate = new Date(`${today}T00:00:00.000Z`)

  const rules = parseCaptureText(text, todayDate)
  const result: CaptureParseResult = {
    direction: rules.direction,
    amountPaise: rules.amountPaise,
    dateISO: rules.dateISO,
    note: rules.note,
    confidence: rules.confidence,
    engine: 'rules',
  }

  // LLM fallback: missing amount is the deal-breaker for capture UX
  if (rules.amountPaise == null || rules.direction == null) {
    try {
      const llm = await llmStructureText(text, today)
      if (llm) {
        result.engine = 'llm'
        if (result.amountPaise == null && llm.amount != null) {
          result.amountPaise = Math.round(llm.amount * 100)
        }
        if (result.direction == null && llm.direction != null) result.direction = llm.direction
        if (!rules.matched.date && llm.date) result.dateISO = llm.date
        if (result.note == null && llm.note) result.note = llm.note
        result.confidence = Math.max(result.confidence, result.amountPaise != null ? 0.75 : 0.3)
      }
    } catch {
      // AI unavailable — the rules-based draft (even partial) is still returned
    }
  }

  return result
}

/* ------------------------------------------------------------------ */
/* Voice pipeline (ASR → text pipeline)                                */
/* ------------------------------------------------------------------ */

export async function parseVoiceCapture(
  timezone: string,
  input: { audioBase64: string },
): Promise<CaptureParseResult> {
  const audio = input.audioBase64.trim()
  if (!audio) throw new HttpError('Audio is required', 422)
  if (audio.length > MAX_AUDIO_BASE64) throw new HttpError('Recording too large (max ~9 MB)', 422)

  let transcript: string
  try {
    const zai = await ZAI.create()
    const asr = await zai.audio.asr.create({ file_base64: audio })
    transcript = (asr.text ?? '').trim()
  } catch (err) {
    throw new HttpError(`Could not transcribe the recording (${(err as Error).message})`, 502)
  }
  if (!transcript) throw new HttpError('Nothing audible in the recording', 422)

  const parsed = await parseTextCapture(timezone, { text: transcript })
  return { ...parsed, transcript, engine: (parsed.engine === 'llm' ? 'asr+llm' : 'asr+rules') }
}

/* ------------------------------------------------------------------ */
/* Receipt pipeline (vision model)                                     */
/* ------------------------------------------------------------------ */

const visionDraftSchema = z.object({
  merchant: z.string().max(120).nullable().optional(),
  /** rupees (float) — the TOTAL */
  amount: z.number().positive().nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  paidVia: z.string().max(40).nullable().optional(),
})

export async function parseReceiptCapture(
  timezone: string,
  input: { imageBase64: string },
): Promise<CaptureParseResult> {
  const image = input.imageBase64.trim()
  if (!image) throw new HttpError('Image is required', 422)
  if (image.length > MAX_IMAGE_BASE64) throw new HttpError('Image too large (max ~9 MB)', 422)
  const tz = isValidTimezone(timezone) ? timezone : 'Asia/Kolkata'
  const today = todayISO(tz)

  const zai = await ZAI.create()
  let raw: string | undefined
  try {
    // model omitted server-side defaults to the vision model (SDK type wants
    // the property; empty string is the documented "no override")
    const completion = await zai.chat.completions.createVision({
      model: '',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'This is a photo of a store receipt or bill. Reply with ONLY a JSON object, no prose: ' +
                '{"merchant": "<store name>"|null, "amount": <TOTAL as a number in rupees>|null, ' +
                '"date": "YYYY-MM-DD"|null, "paidVia": "cash"|"card"|"upi"|null}. ' +
                'amount is the grand TOTAL (after taxes/discounts), a NUMBER in rupees — never a string. ' +
                `If the receipt shows no date, use null (the app will assume ${today}).`,
            },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } },
          ],
        },
      ],
      thinking: { type: 'disabled' },
    })
    raw = completion.choices[0]?.message?.content
  } catch (err) {
    throw new HttpError(`Receipt reader unavailable (${(err as Error).message})`, 502)
  }

  const parsed = visionDraftSchema.safeParse(extractJson(raw ?? ''))
  const draft = parsed.success ? parsed.data : null
  if (!draft || draft.amount == null) {
    throw new HttpError('Could not read a total from this photo — try better light or the full receipt in frame', 422)
  }
  const amount = draft.amount
  return {
    direction: 'out',
    amountPaise: Math.round(amount * 100),
    dateISO: draft.date ?? today,
    note: draft.merchant ? draft.merchant.toLowerCase() : null,
    confidence: draft.date ? 0.95 : 0.85,
    engine: 'vision',
  }
}

/* ------------------------------------------------------------------ */
/* Category suggestion (shared by all capture UIs)                     */
/* ------------------------------------------------------------------ */

export function suggestCategoryId(
  note: string | null,
  direction: CaptureDirection | null,
  categories: Array<{ id: string; name: string; kind: string }>,
): string | null {
  return guessCategoryId(note, direction, categories)
}
