import ExpenseDataManager from '@/components/expenses/expense-data-manager';
import { AppBar, PageHeader } from '@/components/shared/im';

const ExpenseDataManagerPage = () => {
  return (
    <div className="im-page">
      <AppBar crumbs={['Import Manager', 'Expenses', 'Data Manager']} />
      <PageHeader
        title="Expense Data Manager"
        subtitle="Manage expense types and service providers data"
      />
      <div className="im-dashboard-body">
        <ExpenseDataManager />
      </div>
    </div>
  );
};

export default ExpenseDataManagerPage;
