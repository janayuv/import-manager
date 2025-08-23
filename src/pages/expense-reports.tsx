import { lazy, Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

const ExpenseReports = lazy(() => import('@/components/expenses/expense-reports'))

const ExpenseReportsPage = () => {
  return (
    <div className="container mx-auto py-10">
      <Suspense fallback={<ExpenseReportsLoading />}>
        <ExpenseReports />
      </Suspense>
    </div>
  )
}

const ExpenseReportsLoading = () => (
  <div className="space-y-6">
    <div className="space-y-2">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
    </div>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
    </div>
    <Skeleton className="h-96" />
  </div>
)

export default ExpenseReportsPage
