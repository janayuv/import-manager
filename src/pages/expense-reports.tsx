import ExpenseReports from '@/components/expenses/expense-reports';
import { AppBar, PageHeader } from '@/components/shared/im';

const ExpenseReportsPage = () => {
  return (
    <div className="im-page">
      <AppBar crumbs={['Import Manager', 'Expenses', 'Reports']} />
      <PageHeader
        title="Expense Reports"
        subtitle="Generate detailed expense reports and summaries"
      />
      <div className="im-dashboard-body">
        <ExpenseReports />
      </div>
    </div>
  );
};

export default ExpenseReportsPage;
