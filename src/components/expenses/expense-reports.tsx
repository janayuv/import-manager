import React from 'react'

interface ExpenseReportsProps {
  shipmentId: string
}

const ExpenseReports: React.FC<ExpenseReportsProps> = ({ shipmentId }) => {
  return <div>Expense Reports for Shipment ID: {shipmentId} (To be implemented)</div>
}

export default ExpenseReports
