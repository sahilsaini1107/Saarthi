'use client'

// Saarthi app shell: providers, auth gate, hash-routed screens,
// bottom tabs (Today | Money | Growth | Journal | Settings) + global FAB.

import { createContext, useCallback, useContext, ReactNode, useState } from 'react'
import { ThemeProvider } from 'next-themes'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BookOpen, House, Settings, Sprout, Wallet } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
import { AppFooter, SkeletonRow, Fab } from '@/components/ui/saarthi'
import { cn } from '@/lib/utils'
import { useHashRoute } from '@/hooks/use-hash-route'
import { useSession } from '@/hooks/queries'
import { useReminders } from '@/hooks/use-reminders'
import { useOfflineQueue, useOnlineStatus } from '@/hooks/use-offline-queue'
import { ConfettiBurst, useCelebrations } from '@/hooks/use-celebrations'
import { UserDTO, TransactionDTO } from '@/lib/types'
import { AuthScreen } from '@/components/screens/auth-screen'
import { TodayScreen } from '@/components/screens/today-screen'
import { MoneyScreen } from '@/components/screens/money-screen'
import { AccountsScreen } from '@/components/screens/accounts-screen'
import { AccountDetailScreen } from '@/components/screens/account-detail-screen'
import { TransactionsScreen } from '@/components/screens/transactions-screen'
import { FdsScreen } from '@/components/screens/fds-screen'
import { BillsScreen } from '@/components/screens/bills-screen'
import { InvestScreen } from '@/components/screens/invest-screen'
import { OverviewScreen } from '@/components/screens/overview-screen'
import { BudgetsScreen } from '@/components/screens/budgets-screen'
import { TravelScreen } from '@/components/screens/travel-screen'
import { TripDetailScreen } from '@/components/screens/trip-detail-screen'
import { CaptureScreen } from '@/components/screens/capture-screen'
import { InsuranceScreen } from '@/components/screens/insurance-screen'
import { PlannerScreen } from '@/components/screens/planner-screen'
import { GrowthHub, GrowthScreen } from '@/components/screens/growth-screen'
import { GoalsScreen } from '@/components/screens/goals-screen'
import { StudyScreen } from '@/components/screens/study-screen'
import { BodyScreen } from '@/components/screens/body-screen'
import { SkinScreen } from '@/components/screens/skin-screen'
import { PrinciplesScreen } from '@/components/screens/principles-screen'
import { SkillsScreen } from '@/components/skills/skills-screen'
import { PeopleScreen } from '@/components/people/people-screen'
import { ContentScreen } from '@/components/content/content-screen'
import { IdeasScreen } from '@/components/ideas/ideas-screen'
import { LibraryScreen } from '@/components/reading/library-screen'
import { BookDetailScreen } from '@/components/reading/book-detail-screen'
import { ReaderScreen } from '@/components/reading/reader-screen'
import { QuotesScreen } from '@/components/reading/quotes-screen'
import { FitnessScreen } from '@/components/screens/fitness-screen'
import { FitnessPlanScreen } from '@/components/fitness/plan-overview-screen'
import { SessionScreen } from '@/components/fitness/session-view'
import { FoodScreen } from '@/components/screens/food-screen'
import { HealthCoachScreen } from '@/components/screens/health-coach-screen'
import { CheckInScreen } from '@/components/screens/checkin-screen'
import { PhotosScreen } from '@/components/screens/photos-screen'
import { JournalScreen } from '@/components/screens/journal-screen'
import { ReportsScreen } from '@/components/screens/reports-screen'
import { SettingsScreen } from '@/components/screens/settings-screen'
import { StyleguideScreen } from '@/components/screens/styleguide-screen'
import { QuickAddSheet } from '@/components/money/quick-add-sheet'

/* ---------- shared UI context ---------- */

interface UiContextValue {
  user: UserDTO
  navigate: (to: string) => void
  /** opts.tripId pre-attaches a new expense to a trip (trip detail "Add expense") */
  openQuickAdd: (editTxn?: TransactionDTO, opts?: { tripId?: string }) => void
}

const UiContext = createContext<UiContextValue | null>(null)

export function useUi(): UiContextValue {
  const ctx = useContext(UiContext)
  if (!ctx) throw new Error('useUi outside shell')
  return ctx
}

/* ---------- bottom nav ---------- */

const TABS = [
  { path: '/today', label: 'Today', icon: House },
  { path: '/money', label: 'Money', icon: Wallet },
  { path: '/growth', label: 'Growth', icon: Sprout },
  { path: '/journal', label: 'Journal', icon: BookOpen },
  { path: '/settings', label: 'Settings', icon: Settings },
] as const

function BottomNav({ active, onNavigate }: { active: string; onNavigate: (to: string) => void }) {
  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 left-1/2 z-40 w-full max-w-[480px] -translate-x-1/2 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur print:hidden lg:sticky lg:top-0 lg:left-auto lg:order-first lg:flex lg:h-dvh lg:w-52 lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:flex-col lg:border-t-0 lg:border-r lg:p-4"
    >
      <div className="hidden items-center gap-2 px-3 pt-2 pb-8 text-lg font-bold tracking-tight lg:flex">
        <span aria-hidden>🧭</span>
        <span>Saarthi</span>
      </div>
      <div className="grid grid-cols-5 lg:flex lg:flex-col lg:gap-1">
        {TABS.map((tab) => {
          const isActive =
            active === tab.path || (tab.path !== '/today' && active.startsWith(tab.path))
          const Icon = tab.icon
          return (
            <button
              key={tab.path}
              type="button"
              onClick={() => onNavigate(tab.path)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors lg:h-11 lg:flex-row lg:justify-start lg:gap-3 lg:rounded-xl lg:px-3 lg:text-sm',
                isActive
                  ? 'text-primary lg:bg-primary/10'
                  : 'text-muted-foreground hover:text-foreground lg:hover:bg-accent'
              )}
            >
              <Icon className="size-5" strokeWidth={isActive ? 2.5 : 2} />
              {tab.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

/* ---------- screen switch ---------- */

function renderScreen(path: string, navigate: (to: string) => void, user: UserDTO): ReactNode {
  if (path === '/today' || path === '/') return <TodayScreen />
  if (path === '/money') return <MoneyScreen />
  if (path === '/money/accounts') return <AccountsScreen />
  if (path.startsWith('/money/accounts/'))
    return <AccountDetailScreen accountId={path.split('/')[3]} />
  if (path === '/money/transactions') return <TransactionsScreen />
  if (path === '/money/fds') return <FdsScreen />
  if (path === '/money/invest') return <InvestScreen />
  if (path === '/money/bills') return <BillsScreen />
  if (path === '/money/overview') return <OverviewScreen />
  if (path === '/money/budgets') return <BudgetsScreen />
  if (path === '/money/travel') return <TravelScreen />
  if (path.startsWith('/money/travel/')) return <TripDetailScreen tripId={path.split('/')[3]} />
  if (path === '/money/capture') return <CaptureScreen />
  if (path === '/money/import') return <CaptureScreen key="import" initialTab="import" />
  if (path === '/money/insurance') return <InsuranceScreen />
  if (path === '/money/planner') return <PlannerScreen />
  if (path === '/growth' || path === '/growth/') return <GrowthHub />
  if (path === '/growth/habits') return <GrowthScreen key="habits" initialTab="habits" />
  if (path === '/growth/routines') return <GrowthScreen key="routines" initialTab="routines" />
  if (path === '/growth/goals') return <GoalsScreen />
  if (path === '/growth/study') return <StudyScreen />
  if (path === '/growth/fitness') return <FitnessScreen />
  if (path === '/growth/health') return <HealthCoachScreen />
  if (path === '/growth/checkin') return <CheckInScreen />
  if (path === '/growth/fitness/food') return <FoodScreen />
  if (path === '/growth/fitness/plan') return <FitnessPlanScreen />
  if (path.startsWith('/growth/fitness/plan/'))
    return <FitnessPlanScreen planId={path.split('/')[4]} />
  if (path.startsWith('/growth/fitness/session/'))
    return <SessionScreen sessionId={path.split('/')[4]} />
  if (path === '/growth/body/photos') return <PhotosScreen />
  if (path === '/growth/body') return <BodyScreen />
  if (path === '/growth/skin') return <SkinScreen />
  if (path === '/growth/principles') return <PrinciplesScreen />
  if (path === '/growth/skills') return <SkillsScreen />
  if (path === '/growth/people') return <PeopleScreen />
  if (path === '/growth/content') return <ContentScreen />
  if (path === '/growth/ideas') return <IdeasScreen />
  if (path === '/growth/library') return <LibraryScreen />
  if (path.startsWith('/growth/library/')) {
    const seg = path.split('/')
    if (seg[4] === 'read') return <ReaderScreen key={seg[3]} bookId={seg[3]} />
    return <BookDetailScreen key={seg[3]} bookId={seg[3]} />
  }
  if (path === '/growth/quotes') return <QuotesScreen />
  if (path === '/journal') return <JournalScreen />
  if (path === '/reports') return <ReportsScreen />
  if (path === '/settings') return <SettingsScreen user={user} />
  // unknown deep links land on Today
  return <TodayScreen key={path} />
}

/* ---------- root ---------- */

export function SaarthiApp() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
      })
  )
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <Toaster position="top-center" richColors />
        <SaarthiRoot />
      </QueryClientProvider>
    </ThemeProvider>
  )
}

function SaarthiRoot() {
  const { path, navigate } = useHashRoute()
  const session = useSession()

  if (path.startsWith('/styleguide')) return <StyleguideScreen />

  if (session.isLoading) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center gap-6 p-8">
        <div className="flex flex-col items-center gap-2">
          <span className="text-4xl" aria-hidden>
            🧭
          </span>
          <p className="text-xl font-bold tracking-tight">Saarthi</p>
          <p className="text-sm text-muted-foreground">Your Personal Life OS</p>
        </div>
        <SkeletonRow />
      </div>
    )
  }

  if (!session.data || !session.data.id) return <AuthScreen />

  return <Shell user={session.data} path={path} navigate={navigate} />
}

function Shell({
  user,
  path,
  navigate,
}: {
  user: UserDTO
  path: string
  navigate: (to: string) => void
}) {
  const [quickAdd, setQuickAdd] = useState<{
    open: boolean
    editTxn?: TransactionDTO
    tripId?: string
  }>({ open: false })
  useReminders() // local notification engine (Phase 2, task 2.5)
  useOfflineQueue() // offline banner state + queued Quick-Add replay (Phase 7)
  const celebrating = useCelebrations() // new badge / level-up confetti (Phase 7)

  const openQuickAdd = useCallback(
    (editTxn?: TransactionDTO, opts?: { tripId?: string }) =>
      setQuickAdd({ open: true, editTxn, tripId: opts?.tripId }),
    []
  )
  const closeQuickAdd = useCallback(() => setQuickAdd({ open: false }), [])
  const showQuickAdd = path === '/' || path === '/today' || path.startsWith('/money')

  return (
    <UiContext.Provider value={{ user, navigate, openQuickAdd }}>
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[1180px] flex-col bg-background lg:flex-row print:max-w-none">
        {celebrating && <ConfettiBurst celebration={celebrating} />}
        <main className="flex min-w-0 flex-1 flex-col px-4 pt-6 pb-36 lg:px-8 lg:pt-8 lg:pb-12 print:pb-0">
          <OfflineBanner />
          <div className="flex-1">{renderScreen(path, navigate, user)}</div>
          <AppFooter />
        </main>
        {showQuickAdd && (
          <div className="print:hidden">
            <Fab onClick={() => openQuickAdd()} />
          </div>
        )}
        <BottomNav active={path === '/' ? '/today' : path} onNavigate={navigate} />
        <QuickAddSheet
          open={quickAdd.open}
          editTxn={quickAdd.editTxn}
          initialTripId={quickAdd.tripId}
          onOpenChange={(o) =>
            o ? openQuickAdd(quickAdd.editTxn, { tripId: quickAdd.tripId }) : closeQuickAdd()
          }
        />
      </div>
    </UiContext.Provider>
  )
}

/** Slim connectivity strip under the top edge (Phase 7). */
function OfflineBanner() {
  const online = useOnlineStatus()
  if (online) return null
  return (
    <div
      className="sticky top-0 z-50 -mx-4 -mt-6 mb-4 bg-warn/15 px-4 py-2 text-center text-xs font-medium text-warn backdrop-blur lg:-mx-8 lg:-mt-8"
      role="status"
    >
      ⚠︎ You&apos;re offline — entries save locally and sync when you reconnect
    </div>
  )
}
