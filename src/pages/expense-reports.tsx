import ExpenseReports from '@/components/expenses/expense-reports';

const ExpenseReportsPage = () => {
  return (
    <div className="container mx-auto py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-blue-600">
            Expense Reports
          </h1>
          <p className="text-muted-foreground mt-1">
            Generate detailed expense reports and summaries
          </p>
        </div>
      </div>
      <ExpenseReports />
    </div>
  );
};

export default ExpenseReportsPage;
