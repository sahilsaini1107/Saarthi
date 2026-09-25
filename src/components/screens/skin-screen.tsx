'use client'

// Skin screen — daily AM/PM checklists with a streak, and the product
// shelf with PAO (period-after-opening) expiry warnings (Decision #22).

import { useState } from 'react'
import { ArrowLeft, Moon, Pencil, Plus, RotateCcw, Search, Sun, Trash2 } from 'lucide-react'
import { useUi } from '@/components/saarthi-app'
import { HealthNav } from '@/components/health/health-nav'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState, ErrorCard, Field, SectionHeader, SkeletonRow } from '@/components/ui/saarthi'
import { StreakCalendar } from '@/components/ui/streak-calendar'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { useDeleteSkinProduct, useSaveSkinProduct, useSkin, useSkinCheckIn } from '@/hooks/queries'
import { SKIN_PRODUCT_KINDS, SKIN_PRODUCT_LABELS, type SkinProductKindKey } from '@/lib/constants'
import { formatDayLabel, todayISO } from '@/lib/date'
import type { SkinProductDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

const PAO_META: Record<SkinProductDTO['pao']['level'], { label: (d: number) => string; cls: string }> = {
  expired: { label: (d) => `Expired ${-d}d ago`, cls: 'bg-expense/10 text-expense' },
  soon: { label: (d) => `${d}d left`, cls: 'bg-warn/15 text-warn' },
  expiring: { label: (d) => `${d}d left`, cls: 'bg-warn/10 text-warn' },
  ok: { label: (d) => `${d}d left`, cls: 'bg-muted text-muted-foreground' },
  no_pao: { label: () => 'no PAO', cls: 'bg-muted text-muted-foreground' },
}

export function SkinScreen() {
  const { user, navigate } = useUi()
  const today = todayISO(user.timezone)
  const skin = useSkin()
  const checkin = useSkinCheckIn()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SkinProductDTO | null>(null)
  const [shelf, setShelf] = useState<'active' | 'finished' | 'discarded' | 'all'>('active')
  const [search, setSearch] = useState('')

  if (skin.isLoading) return <SkeletonRow />
  if (skin.isError) return <ErrorCard message={(skin.error as Error).message} onRetry={() => skin.refetch()} />

  const data = skin.data
  const products = data?.products ?? []
  const active = products.filter((p) => p.status === 'active')
  const amRoutine = active.filter((p) => p.routineAm)
  const pmRoutine = active.filter((p) => p.routinePm)
  const expired = active.filter((p) => p.pao.level === 'expired').length
  const q = search.trim().toLowerCase()
  const shown = products.filter(
    (p) =>
      (shelf === 'all' || p.status === shelf) &&
      (!q || p.name.toLowerCase().includes(q) || (p.brand ?? '').toLowerCase().includes(q)),
  )

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={() => navigate('/growth')} className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Growth
      </button>
      <header className="flex items-center justify-between px-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Skin</h1>
          <p className="text-xs text-muted-foreground">Keep routines simple and know what is active, finished, or expiring.</p>
        </div>
        <Button size="sm" className="h-9 rounded-full" onClick={() => { setEditing(null); setFormOpen(true) }}>
          <Plus className="mr-1 size-4" /> Add product
        </Button>
      </header>

      <HealthNav active="skin" />

      {/* today's AM/PM check */}
      <section className="rounded-2xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">
            Today&apos;s routine
            {(data?.streak ?? 0) > 0 && <span className="ml-1.5 text-xs font-medium text-warn">🔥 {data?.streak}-day</span>}
          </p>
          {expired > 0 && <span className="rounded-full bg-expense/10 px-2 py-1 text-[10px] font-bold text-expense">{expired} product{expired === 1 ? '' : 's'} EXPIRED</span>}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button
            type="button"
            aria-label={data?.today.amDone ? 'Undo morning routine' : 'Complete morning routine'}
            disabled={checkin.isPending}
            onClick={() => checkin.mutate({ date: today, slot: 'am', done: !data?.today.amDone })}
            className={cn(
              'flex min-h-20 flex-col items-center justify-center gap-0.5 rounded-2xl border-2 px-2 transition-all active:scale-95',
              data?.today.amDone ? 'border-transparent bg-income text-white' : 'border-muted-foreground/25',
            )}
          >
            <Sun className="size-5" />
            <span className="text-xs font-bold">AM {data?.today.amDone ? '✓ done' : 'routine'}</span>
            <span className={cn('text-[10px]', data?.today.amDone ? 'text-white/80' : 'text-muted-foreground')}>{amRoutine.length} product{amRoutine.length === 1 ? '' : 's'}</span>
          </button>
          <button
            type="button"
            aria-label={data?.today.pmDone ? 'Undo night routine' : 'Complete night routine'}
            disabled={checkin.isPending}
            onClick={() => checkin.mutate({ date: today, slot: 'pm', done: !data?.today.pmDone })}
            className={cn(
              'flex min-h-20 flex-col items-center justify-center gap-0.5 rounded-2xl border-2 px-2 transition-all active:scale-95',
              data?.today.pmDone ? 'border-transparent bg-primary text-primary-foreground' : 'border-muted-foreground/25',
            )}
          >
            <Moon className="size-5" />
            <span className="text-xs font-bold">PM {data?.today.pmDone ? '✓ done' : 'routine'}</span>
            <span className={cn('text-[10px]', data?.today.pmDone ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{pmRoutine.length} product{pmRoutine.length === 1 ? '' : 's'}</span>
          </button>
        </div>
        {(amRoutine.length > 0 || pmRoutine.length > 0) ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <RoutineProducts label="Morning" products={amRoutine} />
            <RoutineProducts label="Night" products={pmRoutine} />
          </div>
        ) : (
          <p className="mt-3 rounded-xl bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
            Add a product and choose AM, PM, or both to build your routine.
          </p>
        )}
        {data && data.recent.some((r) => r.done) && (
          <div className="mt-3">
            <StreakCalendar days={data.recent} />
            <p className="mt-1.5 text-[11px] text-muted-foreground">A day counts when AM or PM was done — grace applies today</p>
          </div>
        )}
      </section>

      {/* product shelf */}
      <section>
        <SectionHeader title="Product shelf" />
        {products.length === 0 ? (
          <EmptyState
            emoji="🧴"
            title="No products tracked"
            body="Add what's on your shelf with its PAO (period after opening) — Saarthi warns you before it expires."
            action={
              <Button size="sm" className="mt-2 rounded-full" onClick={() => { setEditing(null); setFormOpen(true) }}>
                <Plus className="mr-1 size-4" /> Add product
              </Button>
            }
          />
        ) : (
          <>
            <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto pb-1">
              {(['active', 'finished', 'discarded', 'all'] as const).map((status) => {
                const count = status === 'all' ? products.length : products.filter((p) => p.status === status).length
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setShelf(status)}
                    className={cn(
                      'h-8 shrink-0 rounded-full border px-3 text-xs font-semibold capitalize',
                      shelf === status ? 'border-primary bg-primary/10 text-primary' : 'bg-card text-muted-foreground',
                    )}
                  >
                    {status} <span className="ml-1 tabular-nums opacity-70">{count}</span>
                  </button>
                )
              })}
            </div>
            {products.length >= 5 && (
              <label className="relative mb-3 block">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products or brands" aria-label="Search products or brands" className="h-10 rounded-xl pl-9" />
              </label>
            )}
            {shown.length === 0 ? (
              <EmptyState compact emoji="🧴" title={`No ${shelf === 'all' ? '' : `${shelf} `}products`} body={search ? 'Try a different search.' : 'Products in this state will appear here.'} />
            ) : (
              <div className="flex flex-col gap-2">
                {shown.map((p) => (
                  <ProductRow key={p.id} product={p} onEdit={() => { setEditing(p); setFormOpen(true) }} />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <ProductFormSheet open={formOpen} onOpenChange={setFormOpen} product={editing} tz={today} />
    </div>
  )
}

function RoutineProducts({ label, products }: { label: string; products: SkinProductDTO[] }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted/50 p-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      {products.length > 0 ? (
        <p className="mt-1 line-clamp-3 text-xs leading-relaxed">{products.map((p) => p.name).join(' → ')}</p>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">No products assigned</p>
      )}
    </div>
  )
}

function ProductRow({ product: p, onEdit }: { product: SkinProductDTO; onEdit: () => void }) {
  const update = useSaveSkinProduct({ success: 'Product updated' })
  const del = useDeleteSkinProduct({ success: 'Product removed' })
  const meta = SKIN_PRODUCT_LABELS[(p.kind as SkinProductKindKey) in SKIN_PRODUCT_LABELS ? (p.kind as SkinProductKindKey) : 'other']
  const pao = PAO_META[p.pao.level]
  const active = p.status === 'active'

  return (
    <div className={cn('rounded-2xl border bg-card p-3.5', !active && 'opacity-60', p.pao.level === 'expired' && active && 'border-expense/40')}>
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-lg" aria-hidden>
          {meta.emoji}
        </span>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onEdit}>
          <p className="truncate text-sm font-semibold">
            {p.name}
            {!active && <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">{p.status.toUpperCase()}</span>}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {meta.label}
            {p.brand ? ` · ${p.brand}` : ''}
            {p.openedDate ? ` · opened ${formatDayLabel(p.openedDate)}` : ''}
          </p>
          {active && (p.routineAm || p.routinePm) && (
            <p className="mt-0.5 text-[10px] font-semibold text-primary">
              {p.routineAm ? 'AM' : ''}{p.routineAm && p.routinePm ? ' + ' : ''}{p.routinePm ? 'PM' : ''} routine
            </p>
          )}
          {p.notes && <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{p.notes}</p>}
        </button>
        {active && (
          <span className={cn('shrink-0 rounded-full px-2 py-1 text-[10px] font-bold', pao.cls)}>{pao.label(p.pao.daysLeft ?? 0)}</span>
        )}
        <button type="button" aria-label={`Edit ${p.name}`} onClick={onEdit} className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
          <Pencil className="size-4" />
        </button>
        <button
          type="button"
          aria-label={`Delete ${p.name}`}
          onClick={() => {
            if (confirm(`Delete "${p.name}"?`)) del.mutate(p.id)
          }}
          className="shrink-0 rounded-lg p-2 text-muted-foreground opacity-60 hover:bg-accent hover:text-expense hover:opacity-100"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      {active && p.pao.level !== 'no_pao' && (
        <div className="mt-2 flex gap-2 border-t pt-2">
          <Button size="sm" variant="ghost" className="h-7 rounded-full px-2.5 text-[11px]" disabled={update.isPending} onClick={() => update.mutate({ id: p.id, status: 'finished' })}>
            Finished
          </Button>
          <Button size="sm" variant="ghost" className="h-7 rounded-full px-2.5 text-[11px] text-expense" disabled={update.isPending} onClick={() => update.mutate({ id: p.id, status: 'discarded' })}>
            Discard
          </Button>
        </div>
      )}
      {!active && (
        <div className="mt-2 border-t pt-2">
          <Button size="sm" variant="ghost" className="h-7 rounded-full px-2.5 text-[11px]" disabled={update.isPending} onClick={() => update.mutate({ id: p.id, status: 'active' })}>
            <RotateCcw className="mr-1 size-3" /> Move back to active
          </Button>
        </div>
      )}
    </div>
  )
}

function ProductFormSheet({ open, onOpenChange, product, tz }: { open: boolean; onOpenChange: (o: boolean) => void; product: SkinProductDTO | null; tz: string }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DrawerHeader>
          <DrawerTitle>{product ? 'Edit product' : 'Add a product'}</DrawerTitle>
          <DrawerDescription>PAO is the little open-jar symbol (e.g. 12M) — it powers the expiry warnings.</DrawerDescription>
        </DrawerHeader>
        {open && <ProductForm key={product?.id ?? 'new'} product={product} tz={tz} onClose={() => onOpenChange(false)} />}
      </DrawerContent>
    </Drawer>
  )
}

function ProductForm({ product, tz, onClose }: { product: SkinProductDTO | null; tz: string; onClose: () => void }) {
  const save = useSaveSkinProduct({ success: product ? 'Product updated' : 'Product added' })
  const [name, setName] = useState(product?.name ?? '')
  const [brand, setBrand] = useState(product?.brand ?? '')
  const [kind, setKind] = useState<SkinProductKindKey>((product?.kind as SkinProductKindKey) ?? 'serum')
  const [openedDate, setOpenedDate] = useState(product?.openedDate ?? tz)
  const [paoMonths, setPaoMonths] = useState(product?.paoMonths ? String(product.paoMonths) : '')
  const [notes, setNotes] = useState(product?.notes ?? '')
  const [status, setStatus] = useState(product?.status ?? 'active')
  const [routineAm, setRoutineAm] = useState(product?.routineAm ?? true)
  const [routinePm, setRoutinePm] = useState(product?.routinePm ?? true)

  const valid = name.trim().length > 0

  return (
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
      <Field label="Product name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Vitamin C serum" />
      </Field>

      <Field label="Brand (optional)">
        <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Minimalist, Cetaphil…" />
      </Field>

      <Field label="Type">
        <div className="flex flex-wrap gap-2">
          {SKIN_PRODUCT_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                'flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-all active:scale-95',
                kind === k ? 'border-primary bg-primary/10' : 'bg-card',
              )}
            >
              <span aria-hidden>{SKIN_PRODUCT_LABELS[k].emoji}</span>
              {SKIN_PRODUCT_LABELS[k].label}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Opened on">
          <Input type="date" value={openedDate} onChange={(e) => setOpenedDate(e.target.value)} className="h-11 rounded-xl" />
        </Field>
        <Field label="PAO (months)" hint="From the jar symbol, e.g. 12M">
          <Input inputMode="numeric" value={paoMonths} onChange={(e) => setPaoMonths(e.target.value.replace(/\D/g, ''))} placeholder="12" className="h-11 rounded-xl" />
        </Field>
      </div>

      <Field label="Notes (optional)">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="AM only, patch test first…" />
      </Field>

      <Field label="Use in routine" hint="Choose when this product should appear. You can select both.">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            aria-pressed={routineAm}
            onClick={() => setRoutineAm(!routineAm)}
            className={cn('flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-semibold', routineAm ? 'border-primary bg-primary/10 text-primary' : 'bg-card text-muted-foreground')}
          >
            <Sun className="size-4" /> Morning
          </button>
          <button
            type="button"
            aria-pressed={routinePm}
            onClick={() => setRoutinePm(!routinePm)}
            className={cn('flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-semibold', routinePm ? 'border-primary bg-primary/10 text-primary' : 'bg-card text-muted-foreground')}
          >
            <Moon className="size-4" /> Night
          </button>
        </div>
      </Field>

      {product && (
        <Field label="Shelf status" hint="Keep finished products for history, or move them back to active.">
          <div className="grid grid-cols-3 gap-2">
            {(['active', 'finished', 'discarded'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatus(value)}
                className={cn(
                  'h-10 rounded-xl border text-xs font-semibold capitalize transition-colors',
                  status === value ? 'border-primary bg-primary/10 text-primary' : 'bg-card text-muted-foreground',
                )}
              >
                {value}
              </button>
            ))}
          </div>
        </Field>
      )}

      <Button
        disabled={!valid || save.isPending}
        className="mt-1 h-12 rounded-xl text-base font-semibold"
        onClick={() =>
          save.mutate(
            {
              ...(product ? { id: product.id } : {}),
              name: name.trim(),
              brand: brand.trim() || null,
              kind,
              openedDate: openedDate || null,
              paoMonths: paoMonths ? Number(paoMonths) : null,
              status,
              routineAm,
              routinePm,
              notes: notes.trim() || null,
            },
            { onSuccess: onClose },
          )
        }
      >
        {save.isPending ? 'Saving…' : product ? 'Save changes' : 'Add to shelf'}
      </Button>
    </div>
  )
}
