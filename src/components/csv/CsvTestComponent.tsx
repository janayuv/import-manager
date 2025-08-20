// src/components/csv/CsvTestComponent.tsx
// Comprehensive CSV import/export test component with edge case handling
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { FileText, Upload, AlertTriangle, CheckCircle, Info, X, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import {
  validateCsvContent,
  generateCsvTemplate,
  normalizeCsvEncoding,
  type CsvValidationResult,
} from '@/lib/csv-helpers'

interface TestResult {
  timestamp: string
  testType: string
  success: boolean
  message: string
  details?: string
}

export function CsvTestComponent() {
  const [activeTab, setActiveTab] = useState('validation')
  const [csvContent, setCsvContent] = useState('')
  const [validationResult, setValidationResult] = useState<CsvValidationResult | null>(null)
  const [testResults, setTestResults] = useState<TestResult[]>([])
  const [selectedDataType, setSelectedDataType] = useState<
    'items' | 'shipments' | 'suppliers' | 'boes'
  >('items')

  const addTestResult = (result: TestResult) => {
    setTestResults((prev) => [result, ...prev.slice(0, 9)]) // Keep last 10 results
  }

  const runValidationTest = () => {
    if (!csvContent.trim()) {
      toast.error('Please enter CSV content first')
      return
    }

    try {
      const requiredHeaders = {
        items: ['partNumber', 'itemDescription', 'unit', 'currency', 'unitPrice'],
        shipments: ['invoiceNumber', 'invoiceDate', 'invoiceValue'],
        suppliers: ['supplierName', 'country'],
        boes: ['beNumber', 'beDate'],
      }[selectedDataType]

      const result = validateCsvContent(csvContent, requiredHeaders, selectedDataType)
      setValidationResult(result)

      addTestResult({
        timestamp: new Date().toISOString(),
        testType: 'CSV Validation',
        success: result.isValid,
        message: result.isValid ? 'Validation passed' : 'Validation failed',
        details: `Errors: ${result.errors.length}, Warnings: ${result.warnings.length}`,
      })

      if (result.isValid) {
        toast.success('CSV validation passed!')
      } else {
        toast.error(`Validation failed with ${result.errors.length} errors`)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Validation error: ${errorMessage}`)
      addTestResult({
        timestamp: new Date().toISOString(),
        testType: 'CSV Validation',
        success: false,
        message: 'Validation error',
        details: errorMessage,
      })
    }
  }

  const loadTemplate = () => {
    const template = generateCsvTemplate(selectedDataType)
    setCsvContent(template)
    toast.success('Template loaded successfully')
  }

  const testEncodingNormalization = () => {
    if (!csvContent.trim()) {
      toast.error('Please enter CSV content first')
      return
    }

    try {
      const normalized = normalizeCsvEncoding(csvContent)
      const originalSize = new Blob([csvContent]).size
      const normalizedSize = new Blob([normalized]).size

      addTestResult({
        timestamp: new Date().toISOString(),
        testType: 'Encoding Normalization',
        success: true,
        message: 'Encoding normalized successfully',
        details: `Original: ${originalSize} bytes, Normalized: ${normalizedSize} bytes`,
      })

      toast.success('Encoding normalization completed')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Encoding error: ${errorMessage}`)
      addTestResult({
        timestamp: new Date().toISOString(),
        testType: 'Encoding Normalization',
        success: false,
        message: 'Encoding error',
        details: errorMessage,
      })
    }
  }

  const testLargeFileSimulation = () => {
    // Simulate a large CSV file
    const largeCsv = generateLargeCsv(selectedDataType, 5000) // 5000 rows
    const sizeInMB = new Blob([largeCsv]).size / (1024 * 1024)

    addTestResult({
      timestamp: new Date().toISOString(),
      testType: 'Large File Simulation',
      success: sizeInMB <= 10, // 10MB limit
      message: sizeInMB <= 10 ? 'File size within limits' : 'File size exceeds limit',
      details: `Generated: ${sizeInMB.toFixed(2)}MB, Limit: 10MB`,
    })

    if (sizeInMB <= 10) {
      toast.success('Large file simulation passed')
    } else {
      toast.error('File size exceeds 10MB limit')
    }
  }

  const testMaliciousContent = () => {
    const maliciousCsv = `partNumber,itemDescription,unit,currency,unitPrice
ABC-001,<script>alert('xss')</script>,PC,USD,10.50
ABC-002,Item with "quotes" and 'apostrophes',PC,USD,20.00
ABC-003,Item with \n newlines \r and \t tabs,PC,USD,30.00
ABC-004,Item with very long description that exceeds the recommended column length limit of 1000 characters ${'A'.repeat(1000)},PC,USD,40.00`

    setCsvContent(maliciousCsv)
    toast.info('Malicious content loaded for testing')
  }

  const testInvalidData = () => {
    const invalidCsv = `partNumber,itemDescription,unit,currency,unitPrice
,Missing part number,PC,USD,10.50
ABC-002,Item with invalid price,PC,USD,invalid
ABC-003,Item with negative price,PC,USD,-10.00
ABC-004,Item with invalid tax rate,PC,USD,10.50
ABC-005,Item with invalid email,PC,USD,10.50`

    setCsvContent(invalidCsv)
    toast.info('Invalid data loaded for testing')
  }

  const generateLargeCsv = (dataType: string, rowCount: number): string => {
    const headers =
      {
        items:
          'partNumber,itemDescription,unit,currency,unitPrice,hsnCode,supplierName,isActive,countryOfOrigin,bcd,sws,igst',
        shipments:
          'invoiceNumber,invoiceDate,invoiceValue,invoiceCurrency,supplierId,goodsCategory,incoterm,shipmentMode,shipmentType',
        suppliers:
          'supplierName,shortName,country,email,phone,beneficiaryName,bankName,branch,bankAddress,accountNo,iban,swiftCode,isActive',
        boes: 'beNumber,beDate,location,totalAssessmentValue,dutyAmount,paymentDate,dutyPaid,challanNumber,refId,transactionId',
      }[dataType] || ''

    const rows = []
    for (let i = 1; i <= rowCount; i++) {
      const row =
        {
          items: `ITEM-${i.toString().padStart(6, '0')},Sample Item ${i},PC,USD,${(Math.random() * 100).toFixed(2)},HSN${i},Supplier ${i},true,China,5.0,2.5,18.0`,
          shipments: `INV-${i.toString().padStart(6, '0')},2024-01-15,${(Math.random() * 100000).toFixed(2)},USD,SUP-${i.toString().padStart(3, '0')},Electronics,FOB,Sea,FCL`,
          suppliers: `Supplier ${i},SUP${i},China,supplier${i}@example.com,+86-123-456-7890,Beneficiary ${i},Bank ${i},Branch ${i},Address ${i},1234567890,IBAN${i},SWIFT${i},true`,
          boes: `BE${i.toString().padStart(6, '0')},2024-01-15,Mumbai,${(Math.random() * 100000).toFixed(2)},${(Math.random() * 10000).toFixed(2)},2024-01-16,${(Math.random() * 10000).toFixed(2)},CHL${i},REF${i},TXN${i}`,
        }[dataType] || ''
      rows.push(row)
    }

    return [headers, ...rows].join('\n')
  }

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">CSV Import/Export Edge Cases & Robustness Test</h1>
          <p className="text-muted-foreground">
            Comprehensive testing of CSV functionality with edge case handling
          </p>
        </div>
        <Badge variant="outline" className="text-sm">
          Enhanced CSV System
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="validation">Validation</TabsTrigger>
          <TabsTrigger value="edge-cases">Edge Cases</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="results">Test Results</TabsTrigger>
        </TabsList>

        <TabsContent value="validation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                CSV Validation Testing
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Label htmlFor="data-type">Data Type:</Label>
                <select
                  id="data-type"
                  value={selectedDataType}
                  onChange={(e) =>
                    setSelectedDataType(e.target.value as 'items' | 'suppliers' | 'shipments')
                  }
                  className="rounded border px-3 py-1"
                >
                  <option value="items">Items</option>
                  <option value="shipments">Shipments</option>
                  <option value="suppliers">Suppliers</option>
                  <option value="boes">BOEs</option>
                </select>
                <Button onClick={loadTemplate} variant="outline" size="sm">
                  Load Template
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="csv-content">CSV Content:</Label>
                <Textarea
                  id="csv-content"
                  value={csvContent}
                  onChange={(e) => setCsvContent(e.target.value)}
                  placeholder="Paste your CSV content here..."
                  className="min-h-[200px] font-mono text-sm"
                />
              </div>

              <div className="flex gap-2">
                <Button onClick={runValidationTest} className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Run Validation
                </Button>
                <Button onClick={testEncodingNormalization} variant="outline">
                  Test Encoding
                </Button>
              </div>

              {validationResult && (
                <div className="space-y-4">
                  <Separator />
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">Validation Results:</h3>
                    <Badge variant={validationResult.isValid ? 'default' : 'destructive'}>
                      {validationResult.isValid ? 'Valid' : 'Invalid'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>Total Rows: {validationResult.rowCount}</div>
                    <div>Processed Rows: {validationResult.processedRows}</div>
                    <div>Errors: {validationResult.errors.length}</div>
                    <div>Warnings: {validationResult.warnings.length}</div>
                  </div>

                  {validationResult.errors.length > 0 && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        <div className="space-y-2">
                          <div className="font-semibold">Errors:</div>
                          {validationResult.errors.map((error, index) => (
                            <div key={index} className="text-sm">
                              Row {error.row}, Column {error.column}: {error.message}
                            </div>
                          ))}
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}

                  {validationResult.warnings.length > 0 && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <div className="space-y-2">
                          <div className="font-semibold">Warnings:</div>
                          {validationResult.warnings.map((warning, index) => (
                            <div key={index} className="text-sm">
                              Row {warning.row}, Column {warning.column}: {warning.message}
                            </div>
                          ))}
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="edge-cases" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Edge Case Testing
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Button onClick={testLargeFileSimulation} variant="outline" className="h-20">
                  <div className="text-center">
                    <div className="font-semibold">Large File Test</div>
                    <div className="text-muted-foreground text-xs">Test 10MB limit</div>
                  </div>
                </Button>

                <Button onClick={testInvalidData} variant="outline" className="h-20">
                  <div className="text-center">
                    <div className="font-semibold">Invalid Data Test</div>
                    <div className="text-muted-foreground text-xs">Test validation errors</div>
                  </div>
                </Button>

                <Button onClick={testMaliciousContent} variant="outline" className="h-20">
                  <div className="text-center">
                    <div className="font-semibold">Security Test</div>
                    <div className="text-muted-foreground text-xs">Test XSS & injection</div>
                  </div>
                </Button>

                <Button onClick={testEncodingNormalization} variant="outline" className="h-20">
                  <div className="text-center">
                    <div className="font-semibold">Encoding Test</div>
                    <div className="text-muted-foreground text-xs">Test UTF-8 handling</div>
                  </div>
                </Button>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold">Edge Case Scenarios:</h3>
                <ul className="text-muted-foreground space-y-1 text-sm">
                  <li>• Files exceeding 10MB size limit</li>
                  <li>• CSV files with 10,000+ rows</li>
                  <li>• Malformed CSV with missing headers</li>
                  <li>• Invalid data types (text in numeric fields)</li>
                  <li>• Special characters and encoding issues</li>
                  <li>• XSS and injection attempts</li>
                  <li>• Very long field values</li>
                  <li>• Empty required fields</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Security Features
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <h3 className="font-semibold">Input Sanitization</h3>
                  <ul className="text-muted-foreground space-y-1 text-sm">
                    <li>• DOMPurify integration for XSS prevention</li>
                    <li>• Script tag removal</li>
                    <li>• HTML entity encoding</li>
                    <li>• Dangerous content filtering</li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <h3 className="font-semibold">File Validation</h3>
                  <ul className="text-muted-foreground space-y-1 text-sm">
                    <li>• File size limits (10MB max)</li>
                    <li>• Row count limits (10,000 max)</li>
                    <li>• Column length validation</li>
                    <li>• Encoding detection and normalization</li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <h3 className="font-semibold">Data Validation</h3>
                  <ul className="text-muted-foreground space-y-1 text-sm">
                    <li>• Required field validation</li>
                    <li>• Data type validation</li>
                    <li>• Range validation (tax rates 0-100%)</li>
                    <li>• Email and phone format validation</li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <h3 className="font-semibold">Error Handling</h3>
                  <ul className="text-muted-foreground space-y-1 text-sm">
                    <li>• Comprehensive error reporting</li>
                    <li>• Row and column-level error tracking</li>
                    <li>• Graceful failure handling</li>
                    <li>• Detailed validation reports</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="results" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                Test Results History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {testResults.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center">
                  <Info className="mx-auto mb-4 h-12 w-12 opacity-50" />
                  <p>No test results yet. Run some tests to see results here.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {testResults.map((result, index) => (
                    <div
                      key={index}
                      className={`rounded-lg border p-3 ${
                        result.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {result.success ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <X className="h-4 w-4 text-red-600" />
                          )}
                          <span className="font-medium">{result.testType}</span>
                          <Badge
                            variant={result.success ? 'default' : 'destructive'}
                            className="text-xs"
                          >
                            {result.success ? 'PASS' : 'FAIL'}
                          </Badge>
                        </div>
                        <span className="text-muted-foreground text-xs">
                          {new Date(result.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-muted-foreground mt-1 text-sm">{result.message}</div>
                      {result.details && (
                        <div className="text-muted-foreground mt-1 text-xs">{result.details}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
