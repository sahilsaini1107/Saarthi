'use client'

// Book create/edit sheet (Phase 16). EPUB/PDF books attach their file right
// here: pick → create → upload → done in under 10 seconds.

import { useRef, useState } from 'react'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/saarthi'
import { useCreateBook, useDeleteBook, useUpdateBook, useUploadBookFile } from '@/hooks/queries'
import { BOOK_FORMAT_META, BOOK_STATUSES, BOOK_STATUS_META, isPageBased, type BookFormat } from '@/lib/reading'
import type { BookDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

const FORMATS: BookFormat[] = ['physical', 'epub', 'pdf']

export function BookFormSheet({
  open,
  onOpenChange,
  book,
  tz,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  book?: BookDTO | null
  tz: string
}) {
  void tz
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>{book ? 'Edit book' : 'Add a book'}</DrawerTitle>
          <DrawerDescription>
            Physical books track pages; EPUB & PDF books open right inside Saarthi.
          </DrawerDescription>
        </DrawerHeader>
        {open && <BookForm key={book?.id ?? 'new'} book={book ?? null} onClose={() => onOpenChange(false)} />}
      </DrawerContent>
    </Drawer>
  )
}

function BookForm({ book, onClose }: { book: BookDTO | null; onClose: () => void }) {
  const create = useCreateBook({ success: 'Added to your library' })
  const update = useUpdateBook({ success: 'Book updated' })
  const upload = useUploadBookFile({ success: 'Book file attached' })
  const del = useDeleteBook({ success: 'Book removed' })
  const fileRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState(book?.title ?? '')
  const [author, setAuthor] = useState(book?.author ?? '')
  const [format, setFormat] = useState<BookFormat>(book?.format ?? 'physical')
  const [totalPages, setTotalPages] = useState(book && book.totalPages > 0 ? String(book.totalPages) : '')
  const [status, setStatus] = useState<string>(book?.status ?? 'to_read')
  const [tags, setTags] = useState(book?.tags.join(', ') ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  const valid = title.trim().length > 0
  const pageBased = isPageBased(format)
  const hasFile = book?.hasFile ?? false
  const canAttachFile = format === 'epub' || format === 'pdf'

  function pickFile(f: File | null) {
    if (!f) return
    const okMime = format === 'epub' ? f.name.toLowerCase().endsWith('.epub') : f.name.toLowerCase().endsWith('.pdf')
    if (!okMime) {
      setFile(null)
      return
    }
    setFile(f)
  }

  function chooseFormat(next: BookFormat) {
    setFormat(next)
    setFile(null)
  }

  function fileToBase64(f: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = String(reader.result)
        resolve(result.slice(result.indexOf(',') + 1))
      }
      reader.onerror = () => reject(new Error('Could not read the file'))
      reader.readAsDataURL(f)
    })
  }

  async function onSave() {
    if (!valid) return
    try {
      if (book) {
        await update.mutateAsync({
          id: book.id,
          title: title.trim(),
          author: author.trim() || null,
          format,
          status,
          totalPages: pageBased ? Number(totalPages) || 0 : 0,
          tags: tags.trim() || null,
        })
        if (file && !hasFile) {
          setUploading(true)
          await upload.mutateAsync({ id: book.id, fileName: file.name, mime: format === 'epub' ? 'application/epub+zip' : 'application/pdf', dataBase64: await fileToBase64(file) })
          setUploading(false)
        }
        onClose()
      } else {
        const created = await create.mutateAsync({
          title: title.trim(),
          author: author.trim() || null,
          format,
          status,
          totalPages: pageBased ? Number(totalPages) || 0 : 0,
          tags: tags.trim() || null,
        })
        if (file) {
          setUploading(true)
          await upload.mutateAsync({ id: created.id, fileName: file.name, mime: format === 'epub' ? 'application/epub+zip' : 'application/pdf', dataBase64: await fileToBase64(file) })
          setUploading(false)
        }
        onClose()
      }
    } catch {
      setUploading(false)
      // toast already surfaced by the hook
    }
  }

  const pending = create.isPending || update.isPending || uploading

  return (
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Atomic Habits" />
      </Field>

      <Field label="Author">
        <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="e.g. James Clear" />
      </Field>

      <Field label="Format" hint={hasFile ? 'The file is already attached' : 'EPUB & PDF files open in the in-app reader'}>
        <div className="grid grid-cols-3 gap-2">
          {FORMATS.map((f) => (
            <button
              key={f}
              type="button"
              disabled={!!book && hasFile}
              onClick={() => chooseFormat(f)}
              className={cn(
                'flex h-11 flex-col items-center justify-center rounded-xl border text-xs font-semibold transition-all active:scale-95 disabled:opacity-50',
                format === f ? 'border-transparent bg-primary text-primary-foreground' : 'bg-card text-muted-foreground',
              )}
            >
              <span aria-hidden>{BOOK_FORMAT_META[f].emoji}</span>
              {BOOK_FORMAT_META[f].label}
            </button>
          ))}
        </div>
      </Field>

      {pageBased && (
        <Field label="Total pages" hint="Optional — unlocks progress % and finish-date estimates">
          <Input
            inputMode="numeric"
            value={totalPages}
            onChange={(e) => setTotalPages(e.target.value.replace(/\D/g, ''))}
            placeholder="e.g. 320"
          />
        </Field>
      )}

      {canAttachFile && !hasFile && (
        <Field label="Book file" hint={file ? file.name : `Attach a .${format} file (≤15 MB)`}>
          <input
            ref={fileRef}
            type="file"
            accept={format === 'epub' ? '.epub,application/epub+zip' : '.pdf,application/pdf'}
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          <Button type="button" variant="outline" className="h-11 w-full rounded-xl" onClick={() => fileRef.current?.click()}>
            {file ? `📎 ${file.name}` : `Choose ${format.toUpperCase()} file`}
          </Button>
        </Field>
      )}

      <Field label="Status">
        <div className="grid grid-cols-4 gap-2">
          {BOOK_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                'flex h-10 items-center justify-center gap-1 rounded-xl border text-xs font-semibold transition-all active:scale-95',
                status === s ? 'border-transparent bg-primary text-primary-foreground' : 'bg-card text-muted-foreground',
              )}
            >
              {BOOK_STATUS_META[s].emoji} {BOOK_STATUS_META[s].label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Tags" hint="Comma-separated — e.g. mindset, stoicism">
        <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="mindset, stoicism" />
      </Field>

      <Button onClick={onSave} disabled={!valid || pending} className="mt-1 h-12 rounded-xl text-base font-semibold">
        {pending ? (uploading ? 'Attaching file…' : 'Saving…') : book ? 'Save changes' : 'Add to library'}
      </Button>

      {book && (
        <Button
          variant="ghost"
          onClick={() => {
            if (confirm(`Delete "${book.title}" with all sessions, highlights and notes? This cannot be undone.`)) del.mutate(book.id, { onSuccess: onClose })
          }}
          className="text-expense"
        >
          Delete book
        </Button>
      )}
    </div>
  )
}
