import ExpenseDataManager from '@/components/expenses/expense-data-manager';

const ExpenseDataManagerPage = () => {
  return (
    <div className="container mx-auto py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-blue-600">
            Expense Data Manager
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage expense types and service providers data
          </p>
        </div>
      </div>
      <ExpenseDataManager />
    </div>
  );
};

export default ExpenseDataManagerPage;
