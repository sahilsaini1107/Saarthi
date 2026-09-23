'use client'

// All server state via TanStack Query. Keys are flat and predictable so
// mutations can invalidate precisely.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, clearStoredToken, setStoredToken } from '@/lib/client'
import { enqueueQuickAdd } from '@/lib/offline-queue'
import {
  AccountDTO,
  AssetDTO,
  BillDTO,
  BodyMetricSeries,
  CategoryDTO,
  CourseDTO,
  FixedDepositDTO,
  GoalContributionsDTO,
  GoalDayLogsDTO,
  GoalDTO,
  GoalJournalDTO,
  JournalLearningsDTO,
  HabitWithStats,
  PrincipleWithStats,
  HabitGridPayloadDTO,
  CourseGridPayloadDTO,
  InvestmentDTO,
  InvestmentTxnDTO,
  JournalListResponse,
  Paginated,
  RecurringDepositDTO,
  RoutineWithMeta,
  SkinPayload,
  TransactionDTO,
  UserDTO,
  WorkoutsPayload,
  FitnessSummaryDTO,
  WorkoutPlanDTO,
  WorkoutSessionDTO,
  WorkoutSessionDetailDTO,
  BodyCompositionDTO,
  CheckInPayloadDTO,
  ProgressPhotosPayloadDTO,
  BodyProfileDTO,
  FoodItemDTO,
  FoodLibraryPayloadDTO,
  NutritionPayloadDTO,
  RecipeDTO,
  ExerciseDTO,
  ExerciseProgressDTO,
  VaultConfigDTO,
  VaultEntryDTO,
  BookDTO,
  BookDetailDTO,
  HighlightDTO,
  BookmarkDTO,
  NoteDTO,
  QuoteDTO,
  SkillWithStats,
  PersonWithMeta,
  ContentItemDTO,
  IdeaDTO,
  SessionDTO,
} from '@/lib/types'
import type { AccountWithUtilization } from '@/services/accounts'
import type { BillWithMeta } from '@/services/bills'
import type { FdWithMeta } from '@/services/fds'
import type { RdWithMeta } from '@/services/rds'
import type { InvestmentWithMeta } from '@/services/investments'
import type { AssetWithMeta } from '@/services/assets'
import type { BudgetListPayload, BudgetWithStatus } from '@/services/budgets'
import type { TripDetail, TripSummary } from '@/services/trips'
import type { LifeScorePayload } from '@/services/lifescore'
import type { DomainReportPayload, LifeReportPayload } from '@/services/reports'
import type { InsightsPayload } from '@/services/insights'
import type { ExpenseOverview, TodaySnapshot } from '@/services/overview'
import type { NetWorthTrendPayload } from '@/services/networth'

import type { CaptureParseResponse, ImportCsvResult, ImportCsvRow } from '@/lib/types'
import type { InsurancePolicyDTO } from '@/lib/types'
import type { PolicyWithMeta } from '@/services/insurance'
import type { GamificationProfile } from '@/services/gamification'
import type { AuthSessionInfo } from '@/services/auth-sessions'
import type { PlannerOverview } from '@/services/planner'

/** Marker: the write was deferred to the offline queue (never hit the network). */
class OfflineDeferredError extends Error {}

export const qk = {
  me: ['me'] as const,
  accounts: ['accounts'] as const,
  categories: ['categories'] as const,
  transactions: (f: Record<string, unknown>) => ['transactions', f] as const,
  recentTxns: ['transactions', { recent: true }] as const,
  fds: ['fds'] as const,
  rds: ['rds'] as const,
  investments: ['investments'] as const,
  assets: ['assets'] as const,
  bills: ['bills'] as const,
  netWorth: ['networth'] as const,
  overview: (month: string) => ['overview', month] as const,
  today: ['today'] as const,
  habits: ['habits'] as const,
  principles: ['principles'] as const,
  routines: ['routines'] as const,
  journal: (f: Record<string, unknown>) => ['journal', f] as const,
  goals: ['goals'] as const,
  courses: ['courses'] as const,
  workouts: ['workouts'] as const,
  bodyMetrics: ['body-metrics'] as const,
  skin: ['skin'] as const,
  budgets: ['budgets'] as const,
  trips: ['trips'] as const,
  trip: (id: string) => ['trip', id] as const,
  lifeScore: ['lifescore'] as const,
  domainReport: (domain: string, from: string, to: string) => ['report', domain, from, to] as const,
  lifeReport: (month: string) => ['life-report', month] as const,
  insights: ['insights'] as const,
  insurance: ['insurance'] as const,
  planner: ['planner'] as const,
  gamification: ['gamification'] as const,
  goalContributions: (id: string) => ['goal-contributions', id] as const,
  goalJournal: (id: string) => ['goal-journal', id] as const,
  journalLearnings: (month: string) => ['journal-learnings', month] as const,
  habitGrid: (id: string) => ['habit-grid', id] as const,
  courseGrid: (id: string) => ['course-grid', id] as const,
  sessions: ['auth-sessions'] as const,
  fitnessSummary: ['fitness-summary'] as const,
  fitnessPlans: ['fitness-plans'] as const,
  fitnessSessions: ['fitness-sessions'] as const,
  fitnessSession: (id: string) => ['fitness-session', id] as const,
  fitnessExercises: ['fitness-exercises'] as const,
  fitnessTrained: ['fitness-trained'] as const,
  fitnessProgress: (id: string) => ['fitness-progress', id] as const,
  vaultConfig: ['vault-config'] as const,
  vaultEntries: ['vault-entries'] as const,
  nutrition: ['nutrition'] as const,
  books: ['books'] as const,
  book: (id: string) => ['book', id] as const,
  quotes: ['quotes'] as const,
  skills: ['skills'] as const,
  people: ['people'] as const,
  content: ['content'] as const,
  ideas: ['ideas'] as const,
  foodLibrary: ['food-library'] as const,
  bodyComposition: (goal: string) => ['body-composition', goal] as const,
  checkIn: (date: string) => ['checkin', date] as const,
  photos: ['progress-photos'] as const,
  recipe: (id: string) => ['recipe', id] as const,
}

function useInvalidate() {
  const qc = useQueryClient()
  return (keys: readonly (readonly unknown[])[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })))
}

/* ---------- queries ---------- */

export function useSession() {
  return useQuery({
    queryKey: qk.me,
    queryFn: async () => {
      try {
        // token echoes back so localStorage can self-heal (e.g. after a wipe)
        const me = await api<UserDTO & { token?: string }>('/api/auth/me')
        if (me.token) setStoredToken(me.token)
        return me as UserDTO
      } catch (err) {
        if (err instanceof Error && 'status' in err && (err as { status: number }).status === 401) return null
        throw err
      }
    },
    staleTime: 60_000,
    retry: false,
  })
}

export function useAccounts() {
  return useQuery({
    queryKey: qk.accounts,
    queryFn: () => api<AccountWithUtilization[]>('/api/accounts'),
  })
}

export function useCategories() {
  return useQuery({
    queryKey: qk.categories,
    queryFn: () => api<CategoryDTO[]>('/api/categories'),
  })
}

export interface TxnListFilters {
  accountId?: string
  categoryId?: string
  month?: string
  direction?: 'in' | 'out'
  limit?: number
}

export function useTransactions(filters: TxnListFilters, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.transactions(filters as Record<string, unknown>),
    queryFn: () =>
      api<Paginated<TransactionDTO> & { totalPaise: { in: number; out: number } }>(
        `/api/transactions?${new URLSearchParams(
          Object.entries(filters).filter(([, v]) => v !== undefined && v !== '') .map(([k, v]) => [k, String(v)]),
        ).toString()}`,
      ),
    enabled: opts?.enabled ?? true,
  })
}

export function useRecentTransactions(enabled: boolean) {
  return useQuery({
    queryKey: qk.recentTxns,
    queryFn: () => api<Paginated<TransactionDTO>>('/api/transactions?limit=20'),
    enabled,
  })
}

export function useFds(enabled = true) {
  return useQuery({ queryKey: qk.fds, queryFn: () => api<FdWithMeta[]>('/api/fds'), enabled })
}

export function useRds(enabled = true) {
  return useQuery({ queryKey: qk.rds, queryFn: () => api<RdWithMeta[]>('/api/rds'), enabled })
}

export function useInvestments(enabled = true) {
  return useQuery({ queryKey: qk.investments, queryFn: () => api<InvestmentWithMeta[]>('/api/investments'), enabled })
}

export function useAssets(enabled = true) {
  return useQuery({ queryKey: qk.assets, queryFn: () => api<AssetWithMeta[]>('/api/assets'), enabled })
}

export function useBills(enabled = true) {
  return useQuery({ queryKey: qk.bills, queryFn: () => api<BillWithMeta[]>('/api/bills'), enabled })
}

export function useExpenseOverview(month: string, enabled = true) {
  return useQuery({
    queryKey: qk.overview(month),
    queryFn: () => api<ExpenseOverview>(`/api/overview/expense?month=${month}`),
    enabled,
  })
}

export function useToday(enabled = true) {
  return useQuery({ queryKey: qk.today, queryFn: () => api<TodaySnapshot>('/api/overview/today'), enabled })
}

export function useNetWorthTrend(days = 90, enabled = true) {
  return useQuery({ queryKey: qk.netWorth, queryFn: () => api<NetWorthTrendPayload>(`/api/overview/networth?days=${days}`), enabled })
}

/* ---------- Phase 2: habits · routines · journal ---------- */

export function useHabits(enabled = true) {
  return useQuery({ queryKey: qk.habits, queryFn: () => api<HabitWithStats[]>('/api/habits'), enabled })
}

export function useRoutines(enabled = true) {
  return useQuery({ queryKey: qk.routines, queryFn: () => api<RoutineWithMeta[]>('/api/routines'), enabled })
}

export interface JournalFilters {
  q?: string
  mood?: string
  tag?: string
  month?: string
}

export function useJournal(filters: JournalFilters, enabled = true) {
  return useQuery({
    queryKey: qk.journal(filters as Record<string, unknown>),
    queryFn: () =>
      api<JournalListResponse>(
        `/api/journal?${new URLSearchParams(
          Object.entries(filters)
            .filter(([, v]) => v !== undefined && v !== '')
            .map(([k, v]) => [k, String(v)]),
        ).toString()}`,
      ),
    enabled,
  })
}

/* ---------- Phase 3: goals · study · body · skin ---------- */

export function useGoals(enabled = true) {
  return useQuery({ queryKey: qk.goals, queryFn: () => api<GoalDTO[]>('/api/goals'), enabled })
}

export function useCourses(enabled = true) {
  return useQuery({ queryKey: qk.courses, queryFn: () => api<CourseDTO[]>('/api/courses'), enabled })
}

export function useWorkouts(enabled = true) {
  return useQuery({ queryKey: qk.workouts, queryFn: () => api<WorkoutsPayload>('/api/workouts'), enabled })
}

export function useBodyMetrics(enabled = true) {
  return useQuery({ queryKey: qk.bodyMetrics, queryFn: () => api<BodyMetricSeries[]>('/api/body-metrics'), enabled })
}

export function useSkin(enabled = true) {
  return useQuery({ queryKey: qk.skin, queryFn: () => api<SkinPayload>('/api/skin'), enabled })
}

/* ---------- Phase 5 — Intelligence layer ---------- */

export function useBudgets(enabled = true) {
  return useQuery({ queryKey: qk.budgets, queryFn: () => api<BudgetListPayload>('/api/budgets'), enabled })
}

export function useTrips(enabled = true) {
  return useQuery({ queryKey: qk.trips, queryFn: () => api<TripSummary[]>('/api/trips'), enabled })
}

export function useTrip(id: string, enabled = true) {
  return useQuery({ queryKey: qk.trip(id), queryFn: () => api<TripDetail>(`/api/trips/${id}`), enabled: enabled && !!id })
}

export function useLifeScore(enabled = true) {
  return useQuery({ queryKey: qk.lifeScore, queryFn: () => api<LifeScorePayload>('/api/lifescore'), enabled, staleTime: 60_000 })
}

export function useDomainReport(domain: string, from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: qk.domainReport(domain, from, to),
    queryFn: () => api<DomainReportPayload>(`/api/reports?domain=${encodeURIComponent(domain)}&from=${from}&to=${to}`),
    enabled,
    staleTime: 60_000,
  })
}

export function useLifeReport(month: string, enabled = true) {
  return useQuery({
    queryKey: qk.lifeReport(month),
    queryFn: () => api<LifeReportPayload>(`/api/reports/life?month=${month}`),
    enabled,
    staleTime: 60_000,
  })
}

export function useInsights(enabled = true) {
  return useQuery({ queryKey: qk.insights, queryFn: () => api<InsightsPayload>('/api/insights?limit=6'), enabled, staleTime: 60_000 })
}

/* ---------- mutations ---------- */

interface Msg {
  success?: string
  error?: string
}

export function useAuthMutation(kind: 'login' | 'register') {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { email: string; password: string; name?: string }) =>
      api<{ user: UserDTO; token: string }>(`/api/auth/${kind}`, { method: 'POST', json: input }),
    onSuccess: async ({ token }) => {
      // Persist for the Authorization-header fallback (iframe-safe sessions).
      setStoredToken(token)
      await invalidate([qk.me])
    },
  })
}

export function useLogout() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: () => api('/api/auth/logout', { method: 'POST' }),
    onSuccess: async () => {
      clearStoredToken()
      await invalidate([qk.me])
    },
  })
}

export function useUpdateUser(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { name?: string; timezone?: string; currency?: string }) =>
      api<UserDTO>('/api/user', { method: 'PATCH', json: input }),
    onSuccess: async () => {
      await invalidate([qk.me, qk.today, qk.netWorth, qk.planner, qk.fds, qk.bills])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useSaveAccount(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: Partial<Parameters<typeof createOrUpdate>[0]> & { id?: string }) => createOrUpdate(input),
    onSuccess: async () => {
      await invalidate([qk.accounts, qk.today, qk.netWorth, qk.planner])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

async function createOrUpdate(input: { id?: string; [k: string]: unknown }) {
  if (input.id) return api<AccountDTO>(`/api/accounts/${input.id}`, { method: 'PATCH', json: input })
  return api<AccountDTO>('/api/accounts', { method: 'POST', json: input })
}

export function useDeleteAccount(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api(`/api/accounts/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.accounts, qk.transactions({}), qk.today, qk.netWorth, qk.planner])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useSaveTransaction(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    // IMPORTANT (Decision #38): TanStack's default networkMode='online' would
    // PAUSE the mutation offline (mutationFn never runs, button shows
    // "Saving…" forever). 'always' lets the mutation run so the offline
    // short-circuit below can queue the entry deterministically instead.
    networkMode: 'always',
    mutationFn: (input: { id?: string; [k: string]: unknown }) => {
      // Offline write-queue (Decision #38): a NEW entry is short-circuited
      // BEFORE the network while offline — a doomed fetch would hang the
      // mutation in pending state. It lands in localStorage and the shell's
      // useOfflineQueue replays it on reconnect (server dedupes by clientKey).
      if (!input.id && typeof input.clientKey === 'string' && !navigator.onLine) {
        throw new OfflineDeferredError()
      }
      if (input.id) return api<TransactionDTO>(`/api/transactions/${input.id}`, { method: 'PATCH', json: input })
      return api<TransactionDTO>('/api/transactions', { method: 'POST', json: input })
    },
    onSuccess: async () => {
      // Balances + every read model can move; invalidate the money family.
      await invalidate([qk.transactions({}), qk.recentTxns, qk.accounts, qk.today, qk.netWorth, qk.planner, qk.fds, qk.bills, qk.budgets, qk.trips, qk.insights, qk.lifeScore, ['trip'] as unknown[]])
      await invalidate([['overview'] as unknown[]])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error, input) => {
      const status = (e as { status?: number }).status
      const offline = e instanceof OfflineDeferredError || (status === undefined && !navigator.onLine)
      if (!input.id && typeof input.clientKey === 'string' && offline) {
        enqueueQuickAdd({
          accountId: String(input.accountId),
          categoryId: (input.categoryId as string | null) ?? null,
          amountPaise: Number(input.amountPaise),
          direction: input.direction as 'in' | 'out',
          date: String(input.date),
          note: (input.note as string | null) ?? null,
          source: String(input.source ?? 'manual'),
          tripId: (input.tripId as string | null) ?? null,
        })
        toast.success('Saved offline — it will sync automatically when you’re back online')
        return
      }
      toast.error(e.message)
    },
  })
}

export function useDeleteTransaction(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api(`/api/transactions/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.transactions({}), qk.recentTxns, qk.accounts, qk.today, qk.netWorth, qk.planner, qk.budgets, qk.trips, qk.insights, qk.lifeScore, ['trip'] as unknown[]])
      await invalidate([['overview'] as unknown[]])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useSaveCategory(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { id?: string; name: string; emoji?: string; color?: string; kind: 'expense' | 'income' }) => {
      if (input.id) return api<CategoryDTO>(`/api/categories/${input.id}`, { method: 'PATCH', json: input })
      return api<CategoryDTO>('/api/categories', { method: 'POST', json: input })
    },
    onSuccess: async () => {
      await invalidate([qk.categories])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useSaveFd(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { id?: string; [k: string]: unknown }) => {
      if (input.id) return api<FixedDepositDTO>(`/api/fds/${input.id}`, { method: 'PATCH', json: input })
      return api<FixedDepositDTO>('/api/fds', { method: 'POST', json: input })
    },
    onSuccess: async () => {
      await invalidate([qk.fds, qk.today, qk.netWorth, qk.planner, qk.insights, qk.lifeScore])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteFd(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api(`/api/fds/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.fds, qk.today, qk.netWorth, qk.planner, qk.insights, qk.lifeScore])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ---------- recurring deposits (Phase 1.5) ---------- */

export function useSaveRd(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { id?: string; [k: string]: unknown }) => {
      if (input.id) return api<RecurringDepositDTO>(`/api/rds/${input.id}`, { method: 'PATCH', json: input })
      return api<RecurringDepositDTO>('/api/rds', { method: 'POST', json: input })
    },
    onSuccess: async () => {
      // RD auto-creates a linked installment bill → bills + today refresh too.
      await invalidate([qk.rds, qk.today, qk.netWorth, qk.planner, qk.bills, qk.insights, qk.lifeScore])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteRd(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api(`/api/rds/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.rds, qk.today, qk.netWorth, qk.planner, qk.bills, qk.insights, qk.lifeScore])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ---------- investments (Phase 1.5) ---------- */

export function useSaveInvestment(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { id?: string; [k: string]: unknown }) => {
      if (input.id) return api<InvestmentDTO>(`/api/investments/${input.id}`, { method: 'PATCH', json: input })
      return api<InvestmentDTO>('/api/investments', { method: 'POST', json: input })
    },
    onSuccess: async () => {
      await invalidate([qk.investments, qk.today, qk.netWorth, qk.planner, qk.lifeScore])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteInvestment(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api(`/api/investments/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.investments, qk.today, qk.netWorth, qk.planner, qk.lifeScore])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useRecordInvestmentTxn(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { investmentId: string; kind: 'buy' | 'sell' | 'dividend' | 'interest'; quantity?: number; amountPaise: number; date: string; note?: string }) =>
      api<InvestmentTxnDTO>(`/api/investments/${input.investmentId}/txns`, {
        method: 'POST',
        json: { kind: input.kind, quantity: input.quantity, amountPaise: input.amountPaise, date: input.date, note: input.note },
      }),
    onSuccess: async () => {
      await invalidate([qk.investments, qk.today, qk.netWorth, qk.planner, qk.lifeScore])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ---------- portfolio planner (Phase 8) ---------- */

export function usePlanner() {
  return useQuery({
    queryKey: qk.planner,
    queryFn: () => api<PlannerOverview>('/api/planner'),
  })
}

export function useSaveTargets(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (targets: { job: string; targetPct: number }[]) =>
      api<PlannerOverview>('/api/planner', { method: 'PUT', json: { targets } }),
    onSuccess: async () => {
      await invalidate([qk.planner, qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ---------- physical assets (Phase 1.5) ---------- */

export function useSaveAsset(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { id?: string; [k: string]: unknown }) => {
      if (input.id) return api<AssetDTO>(`/api/assets/${input.id}`, { method: 'PATCH', json: input })
      return api<AssetDTO>('/api/assets', { method: 'POST', json: input })
    },
    onSuccess: async () => {
      await invalidate([qk.assets, qk.today, qk.netWorth, qk.planner, qk.lifeScore])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteAsset(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api(`/api/assets/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.assets, qk.today, qk.netWorth, qk.planner, qk.lifeScore])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useSaveBill(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { id?: string; [k: string]: unknown }) => {
      if (input.id) return api<BillDTO>(`/api/bills/${input.id}`, { method: 'PATCH', json: input })
      return api<BillDTO>('/api/bills', { method: 'POST', json: input })
    },
    onSuccess: async () => {
      await invalidate([qk.bills, qk.today, qk.netWorth, qk.planner])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteBill(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api(`/api/bills/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.bills, qk.today, qk.netWorth, qk.planner])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function usePayBill(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { billId: string; dueDate: string }) =>
      api<{ bill: BillDTO; transactionId: string }>(`/api/bills/${input.billId}`, { method: 'POST', json: { dueDate: input.dueDate } }),
    onSuccess: async () => {
      await invalidate([qk.bills, qk.today, qk.netWorth, qk.planner, qk.recentTxns, qk.accounts, qk.transactions({}), qk.budgets, qk.insights, qk.lifeScore, ['trip'] as unknown[], qk.gamification])
      await invalidate([['overview'] as unknown[]])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ---------- habits (Phase 2) ---------- */

export function useSaveHabit(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { id?: string; [k: string]: unknown }) => {
      if (input.id) return api<HabitWithStats>(`/api/habits/${input.id}`, { method: 'PATCH', json: input })
      return api<HabitWithStats>('/api/habits', { method: 'POST', json: input })
    },
    onSuccess: async () => {
      await invalidate([qk.habits, qk.today, qk.lifeScore, qk.insights])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteHabit(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api(`/api/habits/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.habits, qk.today, qk.lifeScore, qk.insights])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useCheckInHabit(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { habitId: string; date: string }) =>
      api<{ done: boolean; streak: number; longest: number }>(`/api/habits/${input.habitId}/checkin`, {
        method: 'POST',
        json: { date: input.date },
      }),
    onSuccess: async (_data, input) => {
      await invalidate([qk.habits, qk.habitGrid(input.habitId), qk.today, qk.lifeScore, qk.insights, qk.gamification])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ---------- Phase 15 — Life Principles ---------- */

export function usePrinciples(enabled = true) {
  return useQuery({ queryKey: qk.principles, queryFn: () => api<PrincipleWithStats[]>('/api/principles?archived=true'), enabled })
}

export function useCreatePrinciple(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { title: string; detail?: string | null; category?: string; active?: boolean }) =>
      api<PrincipleWithStats>('/api/principles', { method: 'POST', json: input }),
    onSuccess: async () => {
      await invalidate([qk.principles, qk.today, qk.lifeScore])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdatePrinciple(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { id: string; title?: string; detail?: string | null; category?: string; active?: boolean }) =>
      api<PrincipleWithStats>(`/api/principles/${input.id}`, {
        method: 'PATCH',
        json: { title: input.title, detail: input.detail, category: input.category, active: input.active },
      }),
    onSuccess: async () => {
      await invalidate([qk.principles, qk.today, qk.lifeScore])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeletePrinciple(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/api/principles/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.principles, qk.today, qk.lifeScore])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useSetPrincipleCheck(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { principleId: string; date: string; status: 'kept' | 'broken' | 'na'; note?: string | null }) =>
      api<{ principleId: string; date: string; status: string; note: string | null }>(`/api/principles/${input.principleId}/check`, {
        method: 'POST',
        json: { date: input.date, status: input.status, note: input.note },
      }),
    onSuccess: async () => {
      await invalidate([qk.principles, qk.today, qk.lifeScore, qk.insights])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ---------- Phase 17 — Skills ---------- */

export function useSkills(enabled = true) {
  return useQuery({ queryKey: qk.skills, queryFn: () => api<SkillWithStats[]>('/api/skills?archived=true'), enabled })
}

export function useCreateSkill(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { name: string; category?: string; targetLevel?: number; notes?: string | null }) =>
      api<SkillWithStats>('/api/skills', { method: 'POST', json: input }),
    onSuccess: async () => {
      await invalidate([qk.skills, qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateSkill(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { id: string; name?: string; category?: string; targetLevel?: number; notes?: string | null; status?: string }) =>
      api<SkillWithStats>(`/api/skills/${input.id}`, {
        method: 'PATCH',
        json: { name: input.name, category: input.category, targetLevel: input.targetLevel, notes: input.notes, status: input.status },
      }),
    onSuccess: async () => {
      await invalidate([qk.skills, qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteSkill(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/api/skills/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.skills, qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useLogPractice(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { skillId: string; date: string; minutes: number; note?: string | null }) =>
      api<SkillWithStats>(`/api/skills/${input.skillId}/practice`, {
        method: 'POST',
        json: { date: input.date, minutes: input.minutes, note: input.note },
      }),
    onSuccess: async () => {
      await invalidate([qk.skills, qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeletePractice(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { skillId: string; logId: string }) =>
      api<{ ok: true }>(`/api/skills/${input.skillId}/practice/${input.logId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.skills, qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ---------- Phase 17 — People ---------- */

export function usePeople(enabled = true) {
  return useQuery({ queryKey: qk.people, queryFn: () => api<PersonWithMeta[]>('/api/people?archived=true'), enabled })
}

export function useCreatePerson(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { name: string; category?: string; importance?: number; cadenceDays?: number | null; role?: string | null; howMet?: string | null; contact?: string | null; notes?: string | null; tags?: string | null }) =>
      api<PersonWithMeta>('/api/people', { method: 'POST', json: input }),
    onSuccess: async () => {
      await invalidate([qk.people, qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdatePerson(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { id: string; name?: string; category?: string; importance?: number; cadenceDays?: number | null; role?: string | null; howMet?: string | null; contact?: string | null; notes?: string | null; tags?: string | null; archived?: boolean }) =>
      api<PersonWithMeta>(`/api/people/${input.id}`, {
        method: 'PATCH',
        json: {
          name: input.name,
          category: input.category,
          importance: input.importance,
          cadenceDays: input.cadenceDays,
          role: input.role,
          howMet: input.howMet,
          contact: input.contact,
          notes: input.notes,
          tags: input.tags,
          archived: input.archived,
        },
      }),
    onSuccess: async () => {
      await invalidate([qk.people, qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeletePerson(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/api/people/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.people, qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useLogTouchpoint(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { personId: string; date: string; type: string; note?: string | null }) =>
      api<PersonWithMeta>(`/api/people/${input.personId}/touch`, {
        method: 'POST',
        json: { date: input.date, type: input.type, note: input.note },
      }),
    onSuccess: async () => {
      await invalidate([qk.people, qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteTouchpoint(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { personId: string; touchId: string }) =>
      api<{ ok: true }>(`/api/people/${input.personId}/touch/${input.touchId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.people, qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ---------- Phase 18 — Content Library ---------- */

export function useContent(enabled = true) {
  return useQuery({ queryKey: qk.content, queryFn: () => api<ContentItemDTO[]>('/api/content?archived=true'), enabled })
}

export function useCreateContent(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { title?: string | null; kind?: string; url?: string | null; notes?: string | null; tags?: string | null; status?: string; favorite?: boolean }) =>
      api<ContentItemDTO>('/api/content', { method: 'POST', json: input }),
    onSuccess: async () => {
      await invalidate([qk.content, qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateContent(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { id: string; title?: string | null; kind?: string; url?: string | null; notes?: string | null; tags?: string | null; status?: string; favorite?: boolean }) =>
      api<ContentItemDTO>(`/api/content/${input.id}`, {
        method: 'PATCH',
        json: { title: input.title, kind: input.kind, url: input.url, notes: input.notes, tags: input.tags, status: input.status, favorite: input.favorite },
      }),
    onSuccess: async () => {
      await invalidate([qk.content, qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteContent(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/api/content/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.content, qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUploadContentFile(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { id: string; fileName: string; mime: string; dataBase64: string }) =>
      api<ContentItemDTO>(`/api/content/${input.id}/file`, {
        method: 'POST',
        json: { fileName: input.fileName, mime: input.mime, dataBase64: input.dataBase64 },
      }),
    onSuccess: async () => {
      await invalidate([qk.content, qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteContentFile(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api<ContentItemDTO>(`/api/content/${id}/file`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.content, qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useFetchReader(msg?: Msg) {
  return useMutation({
    mutationFn: (input: { id: string; refresh?: boolean }) =>
      api<{ id: string; url: string; title: string; text: string; stale: boolean }>(
        `/api/content/${input.id}/reader${input.refresh ? '?refresh=true' : ''}`,
        { method: 'POST' },
      ),
    onSuccess: (data) => {
      if (msg?.success) toast.success(data.stale ? 'Showing saved text — the site could not be fetched' : msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ---------- Phase 18 — Ideas Lab ---------- */

export function useIdeas(enabled = true) {
  return useQuery({ queryKey: qk.ideas, queryFn: () => api<IdeaDTO[]>('/api/ideas'), enabled })
}

export function useCreateIdea(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => api<IdeaDTO>('/api/ideas', { method: 'POST', json: input }),
    onSuccess: async () => {
      await invalidate([qk.ideas, qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateIdea(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { id: string } & Record<string, unknown>) => api<IdeaDTO>(`/api/ideas/${input.id}`, { method: 'PATCH', json: input }),
    onSuccess: async () => {
      await invalidate([qk.ideas, qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteIdea(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/api/ideas/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.ideas, qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ---------- routines (Phase 2) ---------- */

export function useSaveRoutine(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { id?: string; [k: string]: unknown }) => {
      if (input.id) return api(`/api/routines/${input.id}`, { method: 'PATCH', json: input })
      return api('/api/routines', { method: 'POST', json: input })
    },
    onSuccess: async () => {
      await invalidate([qk.routines, qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteRoutine(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api(`/api/routines/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.routines, qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useSaveRoutineRun(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { routineId: string; completedSteps: number; totalSteps: number; secondsSpent: number; date?: string }) =>
      api<{ date: string; completedSteps: number; totalSteps: number; secondsSpent: number }>(`/api/routines/${input.routineId}/play`, {
        method: 'POST',
        json: {
          completedSteps: input.completedSteps,
          totalSteps: input.totalSteps,
          secondsSpent: input.secondsSpent,
          ...(input.date ? { date: input.date } : {}),
        },
      }),
    onSuccess: async () => {
      await invalidate([qk.routines, qk.today, qk.gamification])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ---------- journal (Phase 2) ---------- */

export function useSaveJournalEntry(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { id?: string; [k: string]: unknown }) => {
      if (input.id) return api(`/api/journal/${input.id}`, { method: 'PATCH', json: input })
      return api('/api/journal', { method: 'POST', json: input })
    },
    onSuccess: async () => {
      await invalidate([qk.journal({}), qk.today, qk.lifeScore, qk.insights, qk.gamification])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteJournalEntry(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api(`/api/journal/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.journal({}), qk.today, qk.lifeScore, qk.insights])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ---------- goals (Phase 3) ---------- */

/** Every goal mutation returns the fresh GoalDTO, so one family invalidation keeps everything in sync. */
export function useSaveGoal(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { id?: string; [k: string]: unknown }) => {
      if (input.id) return api<GoalDTO>(`/api/goals/${input.id}`, { method: 'PATCH', json: input })
      return api<GoalDTO>('/api/goals', { method: 'POST', json: input })
    },
    onSuccess: async () => {
      await invalidate([qk.goals, qk.today, qk.planner])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteGoal(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api(`/api/goals/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      // deleting a goal cascades its milestone logs → Life Score + digest
      await invalidate([qk.goals, qk.today, qk.planner, qk.lifeScore, ['journal-learnings'] as unknown[]])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useAddMilestone(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { goalId: string; title: string; targetDate?: string | null }) =>
      api<GoalDTO>(`/api/goals/${input.goalId}/milestones`, {
        method: 'POST',
        json: { title: input.title, targetDate: input.targetDate ?? null },
      }),
    onSuccess: async () => {
      await invalidate([qk.goals])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateMilestone(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { id: string; title?: string; done?: boolean; targetDate?: string | null; targetMinutes?: number | null }) =>
      api<GoalDTO>(`/api/milestones/${input.id}`, {
        method: 'PATCH',
        json: { title: input.title, done: input.done, targetDate: input.targetDate, targetMinutes: input.targetMinutes },
      }),
    onSuccess: async (data) => {
      await invalidate([qk.goals, qk.goalJournal(data.id)])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteMilestone(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api<GoalDTO>(`/api/milestones/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      // cascade deletes the milestone's journal logs → score + digest refresh
      await invalidate([qk.goals, qk.lifeScore, ['journal-learnings'] as unknown[]])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/** Phase 12 — commit a drag-and-drop reorder: ids in their NEW order. */
export function useReorderMilestones(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { goalId: string; ids: string[] }) =>
      api<GoalDTO>(`/api/goals/${input.goalId}/milestones/reorder`, { method: 'POST', json: { ids: input.ids } }),
    onSuccess: async (data) => {
      await invalidate([qk.goals, qk.goalJournal(data.id)])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useAddGoalTask(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { goalId: string; title: string; milestoneId?: string | null; dueDate?: string | null }) =>
      api<GoalDTO>(`/api/goals/${input.goalId}/tasks`, {
        method: 'POST',
        json: { title: input.title, milestoneId: input.milestoneId ?? null, dueDate: input.dueDate ?? null },
      }),
    onSuccess: async () => {
      await invalidate([qk.goals, qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateGoalTask(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { id: string; title?: string; done?: boolean; dueDate?: string | null }) =>
      api<GoalDTO>(`/api/tasks/${input.id}`, {
        method: 'PATCH',
        json: { title: input.title, done: input.done, dueDate: input.dueDate },
      }),
    onSuccess: async () => {
      await invalidate([qk.goals, qk.today, qk.gamification])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteGoalTask(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api<GoalDTO>(`/api/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.goals, qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ---------- goal contributions (Phase 9) ---------- */
export function useGoalContributions(goalId: string | null, enabled = true) {
  return useQuery({
    queryKey: qk.goalContributions(goalId ?? 'none'),
    queryFn: () => api<GoalContributionsDTO>(`/api/goals/${goalId}/contributions`),
    enabled: enabled && !!goalId,
  })
}

/** Upsert one day's contribution — re-sending a date replaces its value. */
export function useLogContribution(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { goalId: string; date: string; amountMilli: number; note?: string | null }) =>
      api(`/api/goals/${input.goalId}/contributions`, {
        method: 'POST',
        json: { date: input.date, amountMilli: input.amountMilli, note: input.note ?? null },
      }),
    onSuccess: async (_data, input) => {
      await invalidate([qk.goals, qk.today, qk.goalContributions(input.goalId), qk.planner])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteContribution(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { goalId: string; date: string }) =>
      api(`/api/goals/${input.goalId}/contributions?date=${input.date}`, { method: 'DELETE' }),
    onSuccess: async (_data, input) => {
      await invalidate([qk.goals, qk.today, qk.goalContributions(input.goalId), qk.planner])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ---------- milestone journal (Phase 11) ---------- */

export function useGoalJournal(goalId: string | null, enabled = true) {
  return useQuery({
    queryKey: qk.goalJournal(goalId ?? 'none'),
    queryFn: () => api<GoalJournalDTO>(`/api/goals/${goalId}/journal`),
    enabled: enabled && !!goalId,
  })
}

/** Phase 12 — "💡 key learnings" digest for the Journal tab (per month). */
export function useJournalLearnings(monthKey: string) {
  return useQuery({
    queryKey: qk.journalLearnings(monthKey),
    queryFn: () => api<JournalLearningsDTO>(`/api/journal/learnings?month=${monthKey}`),
  })
}

/** One day's entries across the goal's milestones (grid tap → edit day). */
export function useGoalDayLogs(goalId: string | null, date: string | null) {
  return useQuery({
    queryKey: ['goal-day-logs', goalId, date] as const,
    queryFn: () => api<GoalDayLogsDTO>(`/api/goals/${goalId}/journal/day?date=${date}`),
    enabled: !!goalId && !!date,
  })
}

/** Upsert one day's journal entry — re-sending a date replaces it. */
export function useLogMilestoneProgress(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: {
      milestoneId: string
      goalId: string
      date: string
      minutes: number
      did?: string | null
      learned?: string | null
      keyLearning?: string | null
    }) =>
      api(`/api/milestones/${input.milestoneId}/logs`, {
        method: 'POST',
        json: {
          date: input.date,
          minutes: input.minutes,
          did: input.did ?? null,
          learned: input.learned ?? null,
          keyLearning: input.keyLearning ?? null,
        },
      }),
    onSuccess: async (_data, input) => {
      // minutes feed the Life Score growth pillar + the learnings digest
      await invalidate([qk.goals, qk.today, qk.goalJournal(input.goalId), qk.lifeScore, ['journal-learnings'] as unknown[], ['goal-day-logs'] as unknown[]])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteMilestoneLog(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { milestoneId: string; goalId: string; date: string }) =>
      api(`/api/milestones/${input.milestoneId}/logs?date=${input.date}`, { method: 'DELETE' }),
    onSuccess: async (_data, input) => {
      await invalidate([qk.goals, qk.today, qk.goalJournal(input.goalId), qk.lifeScore, ['journal-learnings'] as unknown[], ['goal-day-logs'] as unknown[]])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ---------- effort grids (Phase 10) ---------- */

export function useHabitGrid(habitId: string | null, enabled = true) {
  return useQuery({
    queryKey: qk.habitGrid(habitId ?? 'none'),
    queryFn: () => api<HabitGridPayloadDTO>(`/api/habits/${habitId}/grid`),
    enabled: enabled && !!habitId,
  })
}

export function useCourseGrid(courseId: string | null, enabled = true) {
  return useQuery({
    queryKey: qk.courseGrid(courseId ?? 'none'),
    queryFn: () => api<CourseGridPayloadDTO>(`/api/courses/${courseId}/grid`),
    enabled: enabled && !!courseId,
  })
}

/* ---------- study (Phase 3) ---------- */

export function useSaveCourse(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { id?: string; [k: string]: unknown }) => {
      if (input.id) return api<CourseDTO>(`/api/courses/${input.id}`, { method: 'PATCH', json: input })
      return api<CourseDTO>('/api/courses', { method: 'POST', json: input })
    },
    onSuccess: async () => {
      await invalidate([qk.courses, qk.today, qk.lifeScore, qk.insights])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteCourse(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api(`/api/courses/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.courses, qk.today, qk.lifeScore, qk.insights])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useAddTopic(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { courseId: string; title: string; estMinutes?: number | null }) =>
      api<CourseDTO>(`/api/courses/${input.courseId}/topics`, {
        method: 'POST',
        json: { title: input.title, estMinutes: input.estMinutes ?? null },
      }),
    onSuccess: async () => {
      await invalidate([qk.courses, qk.insights])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateTopic(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { id: string; title?: string; status?: 'todo' | 'learning' | 'done' }) =>
      api<CourseDTO>(`/api/topics/${input.id}`, {
        method: 'PATCH',
        json: { title: input.title, status: input.status },
      }),
    onSuccess: async () => {
      await invalidate([qk.courses, qk.today, qk.lifeScore, qk.insights])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteTopic(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api<CourseDTO>(`/api/topics/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.courses, qk.insights])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useReviseTopic(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { topicId: string; outcome: 'revised' | 'forgot' }) =>
      api<CourseDTO>(`/api/topics/${input.topicId}/revise`, { method: 'POST', json: { outcome: input.outcome } }),
    onSuccess: async () => {
      await invalidate([qk.courses, qk.today, qk.lifeScore, qk.insights, qk.gamification])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useLogStudySession(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { courseId: string; minutes: number; date: string; topicId?: string | null; note?: string | null }) =>
      api<CourseDTO>(`/api/courses/${input.courseId}/sessions`, {
        method: 'POST',
        json: {
          minutes: input.minutes,
          date: input.date,
          topicId: input.topicId ?? null,
          note: input.note ?? null,
        },
      }),
    onSuccess: async (_data, input) => {
      await invalidate([qk.courses, qk.courseGrid(input.courseId), qk.insights])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteStudySession(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api<CourseDTO>(`/api/study-sessions/${id}`, { method: 'DELETE' }),
    onSuccess: async (course) => {
      await invalidate([qk.courses, qk.courseGrid(course.id), qk.insights])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ---------- body (Phase 3) ---------- */

export function useSaveWorkout(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { [k: string]: unknown }) => api<WorkoutsPayload>('/api/workouts', { method: 'POST', json: input }),
    onSuccess: async () => {
      await invalidate([qk.workouts, qk.lifeScore, qk.insights, qk.gamification])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteWorkout(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api(`/api/workouts/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.workouts, qk.lifeScore, qk.insights])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useSaveBodyMetric(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { kind: string; date: string; valueMilli: number; note?: string | null }) =>
      api<BodyMetricSeries[]>('/api/body-metrics', { method: 'POST', json: input }),
    onSuccess: async () => {
      await invalidate([qk.bodyMetrics, ['body-composition'] as unknown[], qk.lifeScore])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteBodyMetric(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api(`/api/body-metrics/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.bodyMetrics, ['body-composition'] as unknown[], qk.lifeScore])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ---------- skin (Phase 3) ---------- */

export function useSaveSkinProduct(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { id?: string; [k: string]: unknown }) => {
      if (input.id) return api<SkinPayload>(`/api/skin/products/${input.id}`, { method: 'PATCH', json: input })
      return api<SkinPayload>('/api/skin/products', { method: 'POST', json: input })
    },
    onSuccess: async () => {
      await invalidate([qk.skin, qk.today, qk.lifeScore])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteSkinProduct(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api<SkinPayload>(`/api/skin/products/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.skin, qk.today, qk.lifeScore])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useSkinCheckIn(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { date: string; slot: 'am' | 'pm'; done: boolean }) =>
      api<SkinPayload>('/api/skin/checkin', { method: 'POST', json: input }),
    onSuccess: async () => {
      await invalidate([qk.skin, qk.today, qk.lifeScore, qk.gamification])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ---------- budgets (Phase 5.1) ---------- */

export function useSaveBudget(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { id?: string; categoryId: string; amountPaise: number }) => {
      if (input.id) return api<unknown>(`/api/budgets/${input.id}`, { method: 'PATCH', json: { amountPaise: input.amountPaise } })
      return api<unknown>('/api/budgets', { method: 'POST', json: input })
    },
    onSuccess: async () => {
      await invalidate([qk.budgets, qk.today, qk.lifeScore, qk.insights])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteBudget(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api(`/api/budgets/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.budgets, qk.today, qk.lifeScore, qk.insights])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ---------- trips (Phase 5.2) ---------- */

export function useSaveTrip(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { id?: string; [k: string]: unknown }) => {
      if (input.id) return api<TripSummary>(`/api/trips/${input.id}`, { method: 'PATCH', json: input })
      return api<TripSummary>('/api/trips', { method: 'POST', json: input })
    },
    onSuccess: async (_data, input) => {
      await invalidate([qk.trips, qk.today, qk.insights])
      if (input.id) await invalidate([qk.trip(input.id)])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteTrip(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api(`/api/trips/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      // transactions stay in the ledger (SetNull) — refresh money views too
      await invalidate([qk.trips, qk.today, qk.insights, qk.transactions({}), qk.recentTxns])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/** Pull a transaction out of (or into) a trip from the trip detail screen. */
export function useSetTxnTrip(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { id: string; tripId: string | null }) =>
      api<TransactionDTO>(`/api/transactions/${input.id}`, { method: 'PATCH', json: { tripId: input.tripId } }),
    onSuccess: async () => {
      await invalidate([qk.trips, qk.today, qk.insights, qk.transactions({}), qk.recentTxns])
      // detail screens of specific trips also refetch
      await invalidate([['trip'] as unknown[]])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ---------- Phase 6: advanced capture (voice · text · receipt · CSV) ---------- */

export function useParseCaptureText() {
  return useMutation({
    mutationFn: (input: { text: string; suggestCategory?: boolean }) =>
      api<CaptureParseResponse>('/api/capture/text', { method: 'POST', json: input }),
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useParseCaptureVoice() {
  return useMutation({
    mutationFn: (input: { audioBase64: string; suggestCategory?: boolean }) =>
      api<CaptureParseResponse>('/api/capture/voice', { method: 'POST', json: input }),
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useParseCaptureReceipt() {
  return useMutation({
    mutationFn: (input: { imageBase64: string; suggestCategory?: boolean }) =>
      api<CaptureParseResponse>('/api/capture/receipt', { method: 'POST', json: input }),
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useImportCsv(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { accountId: string; rows: ImportCsvRow[] }) =>
      api<ImportCsvResult>('/api/transactions/import', { method: 'POST', json: { ...input, source: 'csv' } }),
    onSuccess: async (result) => {
      // identical blast radius to a batch of manual transaction saves
      await invalidate([qk.transactions({}), qk.recentTxns, qk.accounts, qk.today, qk.netWorth, qk.planner, qk.budgets, qk.trips, qk.insights, qk.lifeScore])
      await invalidate([['overview'] as unknown[]])
      if (msg?.success) toast.success(msg.success.replace('{n}', String(result.created)))
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ---------- Phase 7: insurance ---------- */

export function useInsurance(enabled = true) {
  return useQuery({
    queryKey: qk.insurance,
    queryFn: () => api<{ policies: PolicyWithMeta[]; summary: { policyCount: number; totalSumAssuredPaise: number; annualPremiumPaise: number; nextDuePolicyId: string | null; nextDueDate: string | null; attentionCount: number } }>('/api/insurance'),
    enabled,
  })
}

export function useSavePolicy(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { id?: string; [k: string]: unknown }) => {
      if (input.id) return api<InsurancePolicyDTO>(`/api/insurance/${input.id}`, { method: 'PATCH', json: input })
      return api<InsurancePolicyDTO>('/api/insurance', { method: 'POST', json: input })
    },
    onSuccess: async () => {
      await invalidate([qk.insurance, qk.today, qk.insights, qk.gamification])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeletePolicy(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api(`/api/insurance/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.insurance, qk.today, qk.insights, qk.gamification])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function usePayPremium(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { id: string; accountId?: string; categoryId?: string | null; note?: string | null }) =>
      api<{ policy: InsurancePolicyDTO; transactionId: string | null; nextDue: string }>(`/api/insurance/${input.id}/pay`, {
        method: 'POST',
        json: { accountId: input.accountId ?? null, categoryId: input.categoryId ?? null, note: input.note ?? null },
      }),
    onSuccess: async () => {
      // premium may create a linked expense → money + gamification refresh
      await invalidate([qk.insurance, qk.today, qk.transactions({}), qk.recentTxns, qk.accounts, qk.netWorth, qk.insights, qk.lifeScore, qk.gamification])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ---------- Phase 7: gamification ---------- */

export function useGamification(enabled = true) {
  return useQuery({
    queryKey: qk.gamification,
    queryFn: () => api<GamificationProfile>('/api/gamification'),
    enabled,
    staleTime: 30_000,
  })
}

/* ---------- Phase 7: session management (security) ---------- */

export function useAuthSessions(enabled = true) {
  return useQuery({
    queryKey: qk.sessions,
    queryFn: () => api<AuthSessionInfo[]>('/api/auth/sessions'),
    enabled,
  })
}

export function useRevokeSession(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api<{ ok: boolean }>(`/api/auth/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.sessions])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useRevokeOtherSessions(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: () => api<{ revoked: number }>('/api/auth/sessions/revoke-others', { method: 'POST' }),
    onSuccess: async (r) => {
      await invalidate([qk.sessions])
      if (msg?.success) toast.success(msg.success.replace('{n}', String(r.revoked)))
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ---------- Phase 13 — Strength Coach ---------- */

export function useFitnessSummary(enabled = true) {
  return useQuery({ queryKey: qk.fitnessSummary, queryFn: () => api<FitnessSummaryDTO>('/api/fitness/summary'), enabled })
}

export function useFitnessPlans(enabled = true) {
  return useQuery({ queryKey: qk.fitnessPlans, queryFn: () => api<{ plans: WorkoutPlanDTO[] }>('/api/fitness/plans'), enabled })
}

export function useFitnessExercises(enabled = true) {
  return useQuery({ queryKey: qk.fitnessExercises, queryFn: () => api<{ exercises: ExerciseDTO[] }>('/api/fitness/exercises'), enabled })
}

export function useFitnessSessions(enabled = true) {
  return useQuery({ queryKey: qk.fitnessSessions, queryFn: () => api<{ sessions: WorkoutSessionDTO[] }>('/api/fitness/sessions'), enabled })
}

export function useFitnessSession(id: string | null, enabled = true) {
  return useQuery({
    queryKey: qk.fitnessSession(id ?? ''),
    queryFn: () => api<WorkoutSessionDetailDTO>(`/api/fitness/sessions/${id}`),
    enabled: enabled && !!id,
  })
}

export function useNutrition(enabled = true) {
  return useQuery({ queryKey: qk.nutrition, queryFn: () => api<NutritionPayloadDTO>('/api/fitness/nutrition'), enabled })
}

export function useTrainedExercises(enabled = true) {
  return useQuery({ queryKey: qk.fitnessTrained, queryFn: () => api<{ exercises: { exerciseId: string; name: string; sessionCount: number; lastDate: string | null }[] }>('/api/fitness/progress'), enabled })
}

export function useExerciseProgress(exerciseId: string | null, enabled = true) {
  return useQuery({
    queryKey: qk.fitnessProgress(exerciseId ?? ''),
    queryFn: () => api<ExerciseProgressDTO>(`/api/fitness/progress/${exerciseId}`),
    enabled: enabled && !!exerciseId,
  })
}

function fitnessInvalidations(extra: readonly (readonly unknown[])[] = []) {
  // qk.workouts: the Body screen's movement feed now includes closed coach
  // sessions, so it has to refresh whenever a session changes.
  return [qk.fitnessSummary, qk.fitnessPlans, qk.fitnessSessions, qk.fitnessExercises, qk.fitnessTrained, qk.workouts, qk.lifeScore, qk.gamification, qk.insights, qk.today, ...extra]
}

export function useCreatePlan(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => api<WorkoutPlanDTO>('/api/fitness/plans', { method: 'POST', json: input }),
    onSuccess: async () => {
      await invalidate(fitnessInvalidations())
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdatePlan(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Record<string, unknown>) =>
      api<WorkoutPlanDTO>(`/api/fitness/plans/${id}`, { method: 'PATCH', json: input }),
    onSuccess: async () => {
      await invalidate(fitnessInvalidations())
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeletePlan(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api(`/api/fitness/plans/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate(fitnessInvalidations())
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useAddPlanDay(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ planId, ...input }: { planId: string; label: string; focus?: string | null }) =>
      api<unknown>(`/api/fitness/plans/${planId}/days`, { method: 'POST', json: input }),
    onSuccess: async () => {
      await invalidate([qk.fitnessPlans, qk.fitnessSummary])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdatePlanDay(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Record<string, unknown>) =>
      api(`/api/fitness/days/${id}`, { method: 'PATCH', json: input }),
    onSuccess: async () => {
      await invalidate([qk.fitnessPlans, qk.fitnessSummary])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeletePlanDay(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api(`/api/fitness/days/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.fitnessPlans, qk.fitnessSummary])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useAddPlanExercise(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ dayId, ...input }: { dayId: string } & Record<string, unknown>) =>
      api(`/api/fitness/days/${dayId}/exercises`, { method: 'POST', json: input }),
    onSuccess: async () => {
      await invalidate([qk.fitnessPlans, qk.fitnessSummary, qk.fitnessExercises])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdatePlanExercise(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Record<string, unknown>) =>
      api(`/api/fitness/plan-exercises/${id}`, { method: 'PATCH', json: input }),
    onSuccess: async () => {
      await invalidate([qk.fitnessPlans, qk.fitnessSummary])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeletePlanExercise(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api(`/api/fitness/plan-exercises/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.fitnessPlans, qk.fitnessSummary])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useCreateSession(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { planDayId?: string; label?: string; date?: string }) =>
      api<WorkoutSessionDetailDTO>('/api/fitness/sessions', { method: 'POST', json: input }),
    onSuccess: async () => {
      await invalidate(fitnessInvalidations())
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateSession(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Record<string, unknown>) =>
      api<WorkoutSessionDetailDTO>(`/api/fitness/sessions/${id}`, { method: 'PATCH', json: input }),
    onSuccess: async () => {
      await invalidate(fitnessInvalidations([qk.bodyMetrics]))
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteSession(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api(`/api/fitness/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate(fitnessInvalidations())
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useAddSet(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ sessionId, ...input }: { sessionId: string } & Record<string, unknown>) =>
      api<WorkoutSessionDetailDTO>(`/api/fitness/sessions/${sessionId}/sets`, { method: 'POST', json: input }),
    onSuccess: async (_data, variables) => {
      await invalidate([qk.fitnessSessions, qk.fitnessSummary, qk.fitnessExercises, qk.today, qk.fitnessSession(variables.sessionId)])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteSet(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ setId, sessionId }: { setId: string; sessionId: string }) =>
      api(`/api/fitness/sets/${setId}`, { method: 'DELETE' }),
    onSuccess: async (_data, variables) => {
      await invalidate([qk.fitnessSessions, qk.fitnessSummary, qk.fitnessSession(variables.sessionId)])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useSaveNutritionDay(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { date: string; proteinG?: number | null; caloriesKcal?: number | null }) =>
      api<NutritionPayloadDTO>('/api/fitness/nutrition', { method: 'POST', json: input }),
    onSuccess: async () => {
      await invalidate([qk.nutrition, qk.fitnessSummary, qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateNutritionProfile(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      api<NutritionPayloadDTO>('/api/fitness/nutrition/profile', { method: 'PATCH', json: input }),
    onSuccess: async () => {
      await invalidate([qk.nutrition, qk.fitnessSummary])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ---------- Phase 19 — meals & exercise media ---------- */

export function useAddMealEntry(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { date: string; mealType?: string; name: string; caloriesKcal?: number | null; proteinG?: number | null; carbsG?: number | null; fatG?: number | null }) =>
      api<NutritionPayloadDTO>('/api/fitness/meals', { method: 'POST', json: input }),
    onSuccess: async () => {
      await invalidate([qk.nutrition, qk.fitnessSummary, qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteMealEntry(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api<NutritionPayloadDTO>(`/api/fitness/meals/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.nutrition, qk.fitnessSummary, qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/** Media changes surface inside session detail (and future plan views). */
function mediaInvalidations() {
  return [['fitness-session'] as unknown[], qk.fitnessSessions, qk.fitnessPlans, qk.fitnessSummary]
}

export function useSetExerciseMedia(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { exerciseId: string; youtubeUrl?: string | null; photo?: { fileName: string; mime: string; dataBase64: string } | null }) =>
      api<{ ok: true }>(`/api/fitness/exercises/${input.exerciseId}/media`, {
        method: 'POST',
        json: { youtubeUrl: input.youtubeUrl, photo: input.photo ?? undefined },
      }),
    onSuccess: async () => {
      await invalidate(mediaInvalidations())
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useClearExerciseMedia(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (exerciseId: string) => api<{ ok: true }>(`/api/fitness/exercises/${exerciseId}/media`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate(mediaInvalidations())
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ---------- Phase 14 — Password Vault ---------- */

export function useVaultConfig(enabled = true) {
  return useQuery({
    queryKey: qk.vaultConfig,
    queryFn: () => api<{ config: VaultConfigDTO | null }>('/api/vault/config'),
    enabled,
  })
}

export function useVaultEntries(enabled = true) {
  return useQuery({
    queryKey: qk.vaultEntries,
    queryFn: () => api<{ entries: VaultEntryDTO[] }>('/api/vault/entries'),
    enabled,
  })
}

export function useCreateVaultConfig(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: VaultConfigDTO) => api<{ config: VaultConfigDTO }>('/api/vault/config', { method: 'POST', json: input }),
    onSuccess: async () => {
      await invalidate([qk.vaultConfig])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useResetVault(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: () => api<{ ok: true }>('/api/vault/config', { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.vaultConfig, qk.vaultEntries])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useCreateVaultEntry(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { data: string; iv: string }) =>
      api<VaultEntryDTO>('/api/vault/entries', { method: 'POST', json: input }),
    onSuccess: async () => {
      await invalidate([qk.vaultEntries])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateVaultEntry(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, data, iv }: { id: string; data: string; iv: string }) =>
      api<VaultEntryDTO>(`/api/vault/entries/${id}`, { method: 'PATCH', json: { data, iv } }),
    onSuccess: async () => {
      await invalidate([qk.vaultEntries])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteVaultEntry(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api(`/api/vault/entries/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.vaultEntries])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ---------- books · reader · quotes (Phase 16) ---------- */

export function useBooks(status?: string, enabled = true) {
  return useQuery({
    queryKey: qk.books,
    queryFn: () => api<BookDTO[]>(`/api/books${status ? `?status=${status}` : ''}`),
    enabled,
  })
}

export function useBook(id: string | null, enabled = true) {
  return useQuery({
    queryKey: qk.book(id ?? 'none'),
    queryFn: () => api<BookDetailDTO>(`/api/books/${id}`),
    enabled: !!id && enabled,
  })
}

export function useQuotes(enabled = true) {
  return useQuery({
    queryKey: qk.quotes,
    queryFn: () => api<QuoteDTO[]>('/api/quotes'),
    enabled,
  })
}

export function useCreateBook(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { title: string; author?: string | null; format?: string; status?: string; totalPages?: number; tags?: string | null }) =>
      api<BookDTO>('/api/books', { method: 'POST', json: input }),
    onSuccess: async () => {
      await invalidate([qk.books, qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateBook(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { id: string; title?: string; author?: string | null; format?: string; status?: string; totalPages?: number; currentPage?: number; tags?: string | null; rating?: number | null; takeaway?: string | null }) =>
      api<BookDTO>(`/api/books/${input.id}`, {
        method: 'PATCH',
        json: {
          title: input.title,
          author: input.author,
          format: input.format,
          status: input.status,
          totalPages: input.totalPages,
          currentPage: input.currentPage,
          tags: input.tags,
          rating: input.rating,
          takeaway: input.takeaway,
        },
      }),
    onSuccess: async (_, input) => {
      await invalidate([qk.books, qk.book(input.id), qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteBook(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/api/books/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.books, qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUploadBookFile(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { id: string; fileName: string; mime: string; dataBase64: string }) =>
      api<BookDTO>(`/api/books/${input.id}/file`, {
        method: 'POST',
        json: { fileName: input.fileName, mime: input.mime, dataBase64: input.dataBase64 },
      }),
    onSuccess: async (_, input) => {
      await invalidate([qk.books, qk.book(input.id)])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateBookProgress(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { id: string; currentPage?: number; percent?: number; position?: string | null }) =>
      api<BookDTO>(`/api/books/${input.id}/progress`, {
        method: 'POST',
        json: { currentPage: input.currentPage, percent: input.percent, position: input.position },
      }),
    onSuccess: async (_, input) => {
      await invalidate([qk.books, qk.book(input.id), qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useLogReadingSession(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { id: string; date: string; minutes: number; pages?: number; currentPage?: number }) =>
      api<SessionDTO>(`/api/books/${input.id}/sessions`, {
        method: 'POST',
        json: { date: input.date, minutes: input.minutes, pages: input.pages, currentPage: input.currentPage },
      }),
    onSuccess: async (_, input) => {
      await invalidate([qk.books, qk.book(input.id), qk.today, qk.insights])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteReadingSession(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { id: string; sid: string }) =>
      api<{ ok: true }>(`/api/books/${input.id}/sessions/${input.sid}`, { method: 'DELETE' }),
    onSuccess: async (_, input) => {
      await invalidate([qk.books, qk.book(input.id), qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useAddHighlight(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { bookId: string; cfi?: string | null; page?: number | null; text: string; note?: string | null; color?: string; chapter?: string | null }) =>
      api<HighlightDTO>(`/api/books/${input.bookId}/highlights`, {
        method: 'POST',
        json: { cfi: input.cfi, page: input.page, text: input.text, note: input.note, color: input.color, chapter: input.chapter },
      }),
    onSuccess: async (_, input) => {
      await invalidate([qk.book(input.bookId)])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateHighlight(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { bookId: string; hid: string; note?: string | null; color?: string }) =>
      api<HighlightDTO>(`/api/books/${input.bookId}/highlights/${input.hid}`, {
        method: 'PATCH',
        json: { note: input.note, color: input.color },
      }),
    onSuccess: async (_, input) => {
      await invalidate([qk.book(input.bookId)])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteHighlight(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { bookId: string; hid: string }) =>
      api<{ ok: true }>(`/api/books/${input.bookId}/highlights/${input.hid}`, { method: 'DELETE' }),
    onSuccess: async (_, input) => {
      await invalidate([qk.book(input.bookId)])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useAddBookmark(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { bookId: string; cfi?: string | null; page?: number | null; label?: string | null }) =>
      api<BookmarkDTO>(`/api/books/${input.bookId}/bookmarks`, {
        method: 'POST',
        json: { cfi: input.cfi, page: input.page, label: input.label },
      }),
    onSuccess: async (_, input) => {
      await invalidate([qk.book(input.bookId)])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteBookmark(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { bookId: string; bid: string }) =>
      api<{ ok: true }>(`/api/books/${input.bookId}/bookmarks/${input.bid}`, { method: 'DELETE' }),
    onSuccess: async (_, input) => {
      await invalidate([qk.book(input.bookId)])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useAddNote(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { bookId: string; page: number; text: string }) =>
      api<NoteDTO>(`/api/books/${input.bookId}/notes`, { method: 'POST', json: { page: input.page, text: input.text } }),
    onSuccess: async (_, input) => {
      await invalidate([qk.book(input.bookId)])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateNote(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { bookId: string; nid: string; text?: string; page?: number }) =>
      api<NoteDTO>(`/api/books/${input.bookId}/notes/${input.nid}`, { method: 'PATCH', json: { text: input.text, page: input.page } }),
    onSuccess: async (_, input) => {
      await invalidate([qk.book(input.bookId)])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteNote(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { bookId: string; nid: string }) =>
      api<{ ok: true }>(`/api/books/${input.bookId}/notes/${input.nid}`, { method: 'DELETE' }),
    onSuccess: async (_, input) => {
      await invalidate([qk.book(input.bookId)])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useCreateQuote(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { text: string; author?: string | null; source?: string | null; bookId?: string | null; tags?: string | null; favorite?: boolean }) =>
      api<QuoteDTO>('/api/quotes', { method: 'POST', json: input }),
    onSuccess: async () => {
      await invalidate([qk.quotes, qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateQuote(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { id: string; text?: string; author?: string | null; source?: string | null; bookId?: string | null; tags?: string | null; favorite?: boolean }) =>
      api<QuoteDTO>(`/api/quotes/${input.id}`, {
        method: 'PATCH',
        json: { text: input.text, author: input.author, source: input.source, bookId: input.bookId, tags: input.tags, favorite: input.favorite },
      }),
    onSuccess: async () => {
      await invalidate([qk.quotes, qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteQuote(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/api/quotes/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.quotes, qk.today])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useQuoteFromHighlight(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (highlightId: string) =>
      api<{ quote: QuoteDTO; created: boolean }>('/api/quotes/from-highlight', { method: 'POST', json: { highlightId } }),
    onSuccess: async (res) => {
      await invalidate([qk.quotes, qk.today])
      toast.success(res.created ? 'Saved to your quotes vault' : 'Already in your quotes vault')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ---------- Phase 21 — food library & thali builder ---------- */

/**
 * Anything that changes a food or a plate also changes what the Fuel screen,
 * the Today card and the Life Score see, because logging from the library
 * writes MealEntry rows.
 */
function foodInvalidations() {
  return [qk.foodLibrary, qk.nutrition, qk.fitnessSummary, qk.lifeScore, qk.today]
}

export function useFoodLibrary(enabled = true) {
  return useQuery({
    queryKey: qk.foodLibrary,
    queryFn: () => api<FoodLibraryPayloadDTO>('/api/food'),
    enabled,
  })
}

export function useCreateFood(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => api<FoodItemDTO>('/api/food/items', { method: 'POST', json: input }),
    onSuccess: async () => {
      await invalidate([qk.foodLibrary])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateFood(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Record<string, unknown>) =>
      api<FoodItemDTO>(`/api/food/items/${id}`, { method: 'PATCH', json: input }),
    onSuccess: async () => {
      // recipe totals are derived from foods, so the whole library refreshes
      await invalidate([qk.foodLibrary])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteFood(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, force }: { id: string; force?: boolean }) =>
      api(`/api/food/items/${id}${force ? '?force=1' : ''}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.foodLibrary])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useSeedFoodPresets(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (groupId: string) =>
      api<{ added: number; skipped: number }>('/api/food/presets', { method: 'POST', json: { groupId } }),
    onSuccess: async (res) => {
      await invalidate([qk.foodLibrary])
      toast.success(
        res.added === 0
          ? 'Already in your library'
          : `Added ${res.added} food${res.added === 1 ? '' : 's'}${res.skipped ? ` · ${res.skipped} already there` : ''}`,
      )
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useSaveRecipe(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...input }: { id?: string } & Record<string, unknown>) =>
      id
        ? api<RecipeDTO>(`/api/food/recipes/${id}`, { method: 'PUT', json: input })
        : api<RecipeDTO>('/api/food/recipes', { method: 'POST', json: input }),
    onSuccess: async () => {
      await invalidate([qk.foodLibrary])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteRecipe(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api(`/api/food/recipes/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.foodLibrary])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/** Log a library food or a saved plate straight into the day's meal log. */
export function useLogFood(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      api<NutritionPayloadDTO>('/api/food/log', { method: 'POST', json: input }),
    onSuccess: async () => {
      await invalidate(foodInvalidations())
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ---------- Phase 22 — body composition ---------- */

/**
 * Composition reads derive from weight and the body profile, and weight also
 * drives the coach's suggested targets — so a new reading has to refresh the
 * nutrition surfaces too, not just this panel.
 */
function compositionInvalidations() {
  return [['body-composition'] as unknown[], qk.bodyMetrics, qk.nutrition, qk.fitnessSummary, qk.lifeScore, qk.today]
}

export function useBodyComposition(goal = 'lean_bulk', enabled = true) {
  return useQuery({
    queryKey: qk.bodyComposition(goal),
    queryFn: () => api<BodyCompositionDTO>(`/api/body-composition?goal=${goal}`),
    enabled,
  })
}

export function useSaveBodyProfile(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      api<BodyProfileDTO>('/api/body-composition/profile', { method: 'PATCH', json: input }),
    onSuccess: async () => {
      await invalidate(compositionInvalidations())
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/** Save a whole weigh-in at once; a null value clears that reading for the day. */
export function useSaveMetricsBulk(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { date: string; values: Record<string, number | null> }) =>
      api<BodyCompositionDTO>('/api/body-metrics/bulk', { method: 'POST', json: input }),
    onSuccess: async () => {
      await invalidate(compositionInvalidations())
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ---------- Phase 23 — daily coach check-in ---------- */

export function useCheckIn(date?: string, enabled = true) {
  return useQuery({
    queryKey: qk.checkIn(date ?? 'today'),
    queryFn: () => api<CheckInPayloadDTO>(`/api/checkin${date ? `?date=${date}` : ''}`),
    enabled,
  })
}

/**
 * Saving a check-in feeds the Life Score movement/reflection inputs and the
 * Today screen, so both refresh alongside every cached check-in day.
 */
export function useSaveCheckIn(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      api<CheckInPayloadDTO>('/api/checkin', { method: 'POST', json: input }),
    onSuccess: async () => {
      await invalidate([['checkin'] as unknown[], qk.today, qk.lifeScore])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/* ---------- Phase 24 — progress photos ---------- */

export function useProgressPhotos(enabled = true) {
  return useQuery({
    queryKey: qk.photos,
    queryFn: () => api<ProgressPhotosPayloadDTO>('/api/photos'),
    enabled,
  })
}

export function useAddProgressPhoto(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      api<ProgressPhotosPayloadDTO>('/api/photos', { method: 'POST', json: input }),
    onSuccess: async () => {
      await invalidate([qk.photos])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteProgressPhoto(msg?: Msg) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api<ProgressPhotosPayloadDTO>(`/api/photos/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate([qk.photos])
      if (msg?.success) toast.success(msg.success)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
