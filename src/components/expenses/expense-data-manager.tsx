import { AlertTriangle } from 'lucide-react';

import React from 'react';
import { Link } from 'react-router-dom';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const ExpenseDataManager: React.FC = () => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Expense reference data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertDescription>
              Expense types and service providers are managed through normal
              expense workflows. Bulk clear, debug, and cleanup tools are
              available under{' '}
              <Link
                to="/admin/system-tools"
                className="text-primary font-medium underline-offset-4 hover:underline"
              >
                Admin → System Tools
              </Link>
              .
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
};

export default ExpenseDataManager;
