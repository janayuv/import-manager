import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CheckCircle, XCircle, Shield, FileText, Database, Zap, Bug } from 'lucide-react'
import { toast } from 'sonner'
import {
  useValidation,
  useFileValidation,
  useCsvValidation,
  supplierSchema,
  shipmentSchema,
  itemSchema,
  validateUserInput,
} from '@/lib/validation'

// Test data for CSV validation
const sampleCsvData = [
  {
    partNumber: 'PART-001',
    itemDescription: 'Sample Item 1',
    unit: 'PCS',
    currency: 'USD',
    unitPrice: 100.5,
    hsnCode: '12345678',
  },
  {
    partNumber: 'PART-002',
    itemDescription: 'Sample Item 2',
    unit: 'KG',
    currency: 'EUR',
    unitPrice: 75.25,
    hsnCode: '87654321',
  },
  {
    partNumber: 'INVALID-PART',
    itemDescription: '', // Invalid: empty description
    unit: 'PCS',
    currency: 'INVALID', // Invalid: not 3 letters
    unitPrice: -50, // Invalid: negative price
    hsnCode: '123', // Invalid: too short
  },
]

export const ValidationTest = () => {
  const [activeTab, setActiveTab] = useState('basic')
  const [testResults, setTestResults] = useState<{
    [key: string]: { success: boolean; message: string; details?: unknown }
  }>({})

  // ============================================================================
  // BASIC VALIDATION TESTS
  // ============================================================================

  const BasicValidationTests = () => {
    const [testInput, setTestInput] = useState('')
    const [validationResult, setValidationResult] = useState<{
      success: boolean
      error?: string
    } | null>(null)

    const runBasicTests = () => {
      const results: { [key: string]: { success: boolean; message: string; details?: unknown } } =
        {}

      // Test 1: Valid email
      const emailResult = validateUserInput('test@example.com', {
        maxLength: 100,
        checkSqlInjection: true,
        checkXss: true,
      })
      results.email = {
        success: emailResult.success,
        message: emailResult.success ? 'Valid email' : emailResult.error,
        details: emailResult,
      }

      // Test 2: Invalid email
      const invalidEmailResult = validateUserInput('invalid-email', {
        maxLength: 100,
        checkSqlInjection: true,
        checkXss: true,
      })
      results.invalidEmail = {
        success: invalidEmailResult.success,
        message: invalidEmailResult.success ? 'Valid email' : invalidEmailResult.error,
        details: invalidEmailResult,
      }

      // Test 3: SQL injection attempt
      const sqlInjectionResult = validateUserInput("'; DROP TABLE users; --", {
        maxLength: 100,
        checkSqlInjection: true,
        checkXss: true,
      })
      results.sqlInjection = {
        success: sqlInjectionResult.success,
        message: sqlInjectionResult.success ? 'Valid input' : sqlInjectionResult.error,
        details: sqlInjectionResult,
      }

      // Test 4: XSS attempt
      const xssResult = validateUserInput('<script>alert("XSS")</script>', {
        maxLength: 100,
        checkSqlInjection: true,
        checkXss: true,
      })
      results.xss = {
        success: xssResult.success,
        message: xssResult.success ? 'Valid input' : xssResult.error,
        details: xssResult,
      }

      // Test 5: Long input
      const longInputResult = validateUserInput('a'.repeat(2000), {
        maxLength: 100,
        checkSqlInjection: true,
        checkXss: true,
      })
      results.longInput = {
        success: longInputResult.success,
        message: longInputResult.success ? 'Valid input' : longInputResult.error,
        details: longInputResult,
      }

      setTestResults(results)
    }

    const testCustomInput = () => {
      const result = validateUserInput(testInput, {
        maxLength: 100,
        checkSqlInjection: true,
        checkXss: true,
      })
      setValidationResult(result)

      if (result.success) {
        toast.success('Input is valid!')
      } else {
        toast.error(result.error)
      }
    }

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Basic Validation Tests
              </CardTitle>
              <CardDescription>Test various validation scenarios</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={runBasicTests} className="w-full">
                <Zap className="mr-2 h-4 w-4" />
                Run Basic Tests
              </Button>

              <div className="space-y-2">
                <Label>Test Custom Input</Label>
                <Input
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                  placeholder="Enter text to test validation..."
                />
                <Button onClick={testCustomInput} variant="outline" size="sm">
                  Test Input
                </Button>
              </div>

              {validationResult && (
                <Alert variant={validationResult.success ? 'default' : 'destructive'}>
                  <AlertDescription>
                    {validationResult.success ? 'Input is valid!' : validationResult.error}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Test Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(testResults).map(([test, result]) => (
                  <div key={test} className="flex items-center gap-2">
                    {result.success ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="text-sm font-medium">{test}:</span>
                    <span className="text-muted-foreground text-sm">{result.message}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // ============================================================================
  // FORM VALIDATION TESTS
  // ============================================================================

  const FormValidationTests = () => {
    const supplierValidation = useValidation({
      schema: supplierSchema,
      validateOnBlur: true,
      showToast: false,
    })

    const shipmentValidation = useValidation({
      schema: shipmentSchema,
      validateOnBlur: true,
      showToast: false,
    })

    const itemValidation = useValidation({
      schema: itemSchema,
      validateOnBlur: true,
      showToast: false,
    })

    const handleSupplierSubmit = async () => {
      const success = await supplierValidation.submit(async (data: Record<string, string>) => {
        console.log('Supplier data:', data)
        toast.success('Supplier validation successful!')
      })

      if (!success) {
        toast.error('Supplier validation failed. Check the form for errors.')
      }
    }

    const handleShipmentSubmit = async () => {
      const success = await shipmentValidation.submit(async (data: Record<string, string>) => {
        console.log('Shipment data:', data)
        toast.success('Shipment validation successful!')
      })

      if (!success) {
        toast.error('Shipment validation failed. Check the form for errors.')
      }
    }

    const handleItemSubmit = async () => {
      const success = await itemValidation.submit(async (data: Record<string, string>) => {
        console.log('Item data:', data)
        toast.success('Item validation successful!')
      })

      if (!success) {
        toast.error('Item validation failed. Check the form for errors.')
      }
    }

    return (
      <div className="space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="supplier">Supplier</TabsTrigger>
            <TabsTrigger value="shipment">Shipment</TabsTrigger>
            <TabsTrigger value="item">Item</TabsTrigger>
          </TabsList>

          <TabsContent value="supplier" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Supplier Validation Test</CardTitle>
                <CardDescription>
                  Test supplier form validation with real-time feedback
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="supplierName">Supplier Name *</Label>
                    <Input
                      id="supplierName"
                      value={supplierValidation.data.supplierName || ''}
                      onChange={(e) => supplierValidation.setField('supplierName', e.target.value)}
                      onBlur={() => supplierValidation.setTouched('supplierName', true)}
                      className={
                        supplierValidation.hasFieldError('supplierName') ? 'border-red-500' : ''
                      }
                    />
                    {supplierValidation.hasFieldError('supplierName') && (
                      <p className="text-sm text-red-500">
                        {supplierValidation.getFieldError('supplierName')}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="country">Country *</Label>
                    <Input
                      id="country"
                      value={supplierValidation.data.country || ''}
                      onChange={(e) => supplierValidation.setField('country', e.target.value)}
                      onBlur={() => supplierValidation.setTouched('country', true)}
                      placeholder="e.g., US, IN, DE"
                      className={
                        supplierValidation.hasFieldError('country') ? 'border-red-500' : ''
                      }
                    />
                    {supplierValidation.hasFieldError('country') && (
                      <p className="text-sm text-red-500">
                        {supplierValidation.getFieldError('country')}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={supplierValidation.data.email || ''}
                      onChange={(e) => supplierValidation.setField('email', e.target.value)}
                      onBlur={() => supplierValidation.setTouched('email', true)}
                      className={supplierValidation.hasFieldError('email') ? 'border-red-500' : ''}
                    />
                    {supplierValidation.hasFieldError('email') && (
                      <p className="text-sm text-red-500">
                        {supplierValidation.getFieldError('email')}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone *</Label>
                    <Input
                      id="phone"
                      value={supplierValidation.data.phone || ''}
                      onChange={(e) => supplierValidation.setField('phone', e.target.value)}
                      onBlur={() => supplierValidation.setTouched('phone', true)}
                      placeholder="+1234567890"
                      className={supplierValidation.hasFieldError('phone') ? 'border-red-500' : ''}
                    />
                    {supplierValidation.hasFieldError('phone') && (
                      <p className="text-sm text-red-500">
                        {supplierValidation.getFieldError('phone')}
                      </p>
                    )}
                  </div>
                </div>

                <Button
                  onClick={handleSupplierSubmit}
                  disabled={supplierValidation.isSubmitting}
                  className="w-full"
                >
                  {supplierValidation.isSubmitting ? 'Validating...' : 'Validate Supplier'}
                </Button>

                <div className="flex items-center gap-2">
                  <Badge variant={supplierValidation.isValid ? 'default' : 'secondary'}>
                    {supplierValidation.isValid ? 'Valid' : 'Invalid'}
                  </Badge>
                  <span className="text-muted-foreground text-sm">
                    {Object.keys(supplierValidation.errors).length} errors
                  </span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="shipment" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Shipment Validation Test</CardTitle>
                <CardDescription>Test shipment form validation</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="invoiceNumber">Invoice Number *</Label>
                    <Input
                      id="invoiceNumber"
                      value={shipmentValidation.data.invoiceNumber || ''}
                      onChange={(e) => shipmentValidation.setField('invoiceNumber', e.target.value)}
                      onBlur={() => shipmentValidation.setTouched('invoiceNumber', true)}
                      className={
                        shipmentValidation.hasFieldError('invoiceNumber') ? 'border-red-500' : ''
                      }
                    />
                    {shipmentValidation.hasFieldError('invoiceNumber') && (
                      <p className="text-sm text-red-500">
                        {shipmentValidation.getFieldError('invoiceNumber')}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="invoiceDate">Invoice Date *</Label>
                    <Input
                      id="invoiceDate"
                      type="date"
                      value={shipmentValidation.data.invoiceDate || ''}
                      onChange={(e) => shipmentValidation.setField('invoiceDate', e.target.value)}
                      onBlur={() => shipmentValidation.setTouched('invoiceDate', true)}
                      className={
                        shipmentValidation.hasFieldError('invoiceDate') ? 'border-red-500' : ''
                      }
                    />
                    {shipmentValidation.hasFieldError('invoiceDate') && (
                      <p className="text-sm text-red-500">
                        {shipmentValidation.getFieldError('invoiceDate')}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="invoiceValue">Invoice Value *</Label>
                    <Input
                      id="invoiceValue"
                      type="number"
                      value={shipmentValidation.data.invoiceValue || ''}
                      onChange={(e) =>
                        shipmentValidation.setField('invoiceValue', parseFloat(e.target.value) || 0)
                      }
                      onBlur={() => shipmentValidation.setTouched('invoiceValue', true)}
                      className={
                        shipmentValidation.hasFieldError('invoiceValue') ? 'border-red-500' : ''
                      }
                    />
                    {shipmentValidation.hasFieldError('invoiceValue') && (
                      <p className="text-sm text-red-500">
                        {shipmentValidation.getFieldError('invoiceValue')}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="invoiceCurrency">Currency *</Label>
                    <Input
                      id="invoiceCurrency"
                      value={shipmentValidation.data.invoiceCurrency || ''}
                      onChange={(e) =>
                        shipmentValidation.setField('invoiceCurrency', e.target.value)
                      }
                      onBlur={() => shipmentValidation.setTouched('invoiceCurrency', true)}
                      placeholder="USD, EUR, INR"
                      className={
                        shipmentValidation.hasFieldError('invoiceCurrency') ? 'border-red-500' : ''
                      }
                    />
                    {shipmentValidation.hasFieldError('invoiceCurrency') && (
                      <p className="text-sm text-red-500">
                        {shipmentValidation.getFieldError('invoiceCurrency')}
                      </p>
                    )}
                  </div>
                </div>

                <Button
                  onClick={handleShipmentSubmit}
                  disabled={shipmentValidation.isSubmitting}
                  className="w-full"
                >
                  {shipmentValidation.isSubmitting ? 'Validating...' : 'Validate Shipment'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="item" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Item Validation Test</CardTitle>
                <CardDescription>Test item form validation</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="partNumber">Part Number *</Label>
                    <Input
                      id="partNumber"
                      value={itemValidation.data.partNumber || ''}
                      onChange={(e) => itemValidation.setField('partNumber', e.target.value)}
                      onBlur={() => itemValidation.setTouched('partNumber', true)}
                      className={itemValidation.hasFieldError('partNumber') ? 'border-red-500' : ''}
                    />
                    {itemValidation.hasFieldError('partNumber') && (
                      <p className="text-sm text-red-500">
                        {itemValidation.getFieldError('partNumber')}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="hsnCode">HSN Code *</Label>
                    <Input
                      id="hsnCode"
                      value={itemValidation.data.hsnCode || ''}
                      onChange={(e) => itemValidation.setField('hsnCode', e.target.value)}
                      onBlur={() => itemValidation.setTouched('hsnCode', true)}
                      placeholder="12345678"
                      className={itemValidation.hasFieldError('hsnCode') ? 'border-red-500' : ''}
                    />
                    {itemValidation.hasFieldError('hsnCode') && (
                      <p className="text-sm text-red-500">
                        {itemValidation.getFieldError('hsnCode')}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="itemDescription">Item Description *</Label>
                    <Textarea
                      id="itemDescription"
                      value={itemValidation.data.itemDescription || ''}
                      onChange={(e) => itemValidation.setField('itemDescription', e.target.value)}
                      onBlur={() => itemValidation.setTouched('itemDescription', true)}
                      className={
                        itemValidation.hasFieldError('itemDescription') ? 'border-red-500' : ''
                      }
                    />
                    {itemValidation.hasFieldError('itemDescription') && (
                      <p className="text-sm text-red-500">
                        {itemValidation.getFieldError('itemDescription')}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="unitPrice">Unit Price *</Label>
                    <Input
                      id="unitPrice"
                      type="number"
                      value={itemValidation.data.unitPrice || ''}
                      onChange={(e) =>
                        itemValidation.setField('unitPrice', parseFloat(e.target.value) || 0)
                      }
                      onBlur={() => itemValidation.setTouched('unitPrice', true)}
                      className={itemValidation.hasFieldError('unitPrice') ? 'border-red-500' : ''}
                    />
                    {itemValidation.hasFieldError('unitPrice') && (
                      <p className="text-sm text-red-500">
                        {itemValidation.getFieldError('unitPrice')}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="currency">Currency *</Label>
                    <Input
                      id="currency"
                      value={itemValidation.data.currency || ''}
                      onChange={(e) => itemValidation.setField('currency', e.target.value)}
                      onBlur={() => itemValidation.setTouched('currency', true)}
                      placeholder="USD, EUR, INR"
                      className={itemValidation.hasFieldError('currency') ? 'border-red-500' : ''}
                    />
                    {itemValidation.hasFieldError('currency') && (
                      <p className="text-sm text-red-500">
                        {itemValidation.getFieldError('currency')}
                      </p>
                    )}
                  </div>
                </div>

                <Button
                  onClick={handleItemSubmit}
                  disabled={itemValidation.isSubmitting}
                  className="w-full"
                >
                  {itemValidation.isSubmitting ? 'Validating...' : 'Validate Item'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    )
  }

  // ============================================================================
  // FILE VALIDATION TESTS
  // ============================================================================

  const FileValidationTests = () => {
    const { validateFile } = useFileValidation({
      maxSize: 5 * 1024 * 1024, // 5MB
      allowedTypes: ['text/csv', 'application/vnd.ms-excel'],
      allowedExtensions: ['csv', 'xlsx'],
      showToast: true,
    })

    const [fileValidationResult, setFileValidationResult] = useState<{
      success: boolean
      file?: File
      error?: string
    } | null>(null)

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (file) {
        const result = validateFile(file)
        setFileValidationResult(result)
      }
    }

    const testFileValidation = () => {
      // Create a mock file for testing
      const mockFile = new File(['test content'], 'test.csv', { type: 'text/csv' })
      const result = validateFile(mockFile)
      setFileValidationResult(result)
    }

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              File Validation Tests
            </CardTitle>
            <CardDescription>Test file upload validation and sanitization</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="file-upload">Upload File (CSV, XLSX, max 5MB)</Label>
              <Input id="file-upload" type="file" accept=".csv,.xlsx" onChange={handleFileChange} />
            </div>

            <Button onClick={testFileValidation} variant="outline">
              Test File Validation
            </Button>

            {fileValidationResult && (
              <Alert variant={fileValidationResult.success ? 'default' : 'destructive'}>
                <AlertDescription>
                  {fileValidationResult.success
                    ? `File "${fileValidationResult.file.name}" is valid!`
                    : fileValidationResult.error}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <h4 className="font-semibold">File Validation Rules:</h4>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>• Maximum file size: 5MB</li>
                <li>• Allowed types: CSV, XLSX</li>
                <li>• Allowed extensions: .csv, .xlsx</li>
                <li>• Content validation for CSV files</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ============================================================================
  // CSV VALIDATION TESTS
  // ============================================================================

  const CsvValidationTests = () => {
    const { validateCsv } = useCsvValidation(supplierSchema)
    const [csvValidationResult, setCsvValidationResult] = useState<{
      valid: Record<string, string>[]
      invalid: { index: number; errors: string[] }[]
    } | null>(null)

    const testCsvValidation = () => {
      const result = validateCsv(sampleCsvData)
      setCsvValidationResult(result)

      if (result.valid.length > 0) {
        toast.success(`${result.valid.length} valid records found`)
      }

      if (result.invalid.length > 0) {
        toast.error(`${result.invalid.length} invalid records found`)
      }
    }

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              CSV Validation Tests
            </CardTitle>
            <CardDescription>Test CSV data validation with sample data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={testCsvValidation} className="w-full">
              Test CSV Validation
            </Button>

            {csvValidationResult && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-green-600">
                        Valid Records ({csvValidationResult.valid.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {csvValidationResult.valid.map(
                          (record: Record<string, string>, index: number) => (
                            <div key={index} className="text-sm">
                              <strong>{record.partNumber}</strong> - {record.itemDescription}
                            </div>
                          )
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-red-600">
                        Invalid Records ({csvValidationResult.invalid.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {csvValidationResult.invalid.map(
                          (record: { index: number; errors: string[] }, index: number) => (
                            <div key={index} className="text-sm">
                              <strong>Row {record.index + 1}:</strong>
                              <ul className="ml-4 text-red-500">
                                {record.errors.map((error: string, errorIndex: number) => (
                                  <li key={errorIndex}>{error}</li>
                                ))}
                              </ul>
                            </div>
                          )
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h4 className="font-semibold">Sample CSV Data:</h4>
              <pre className="bg-muted overflow-auto rounded p-2 text-xs">
                {JSON.stringify(sampleCsvData, null, 2)}
              </pre>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ============================================================================
  // MAIN COMPONENT
  // ============================================================================

  return (
    <div className="container mx-auto space-y-8 py-8">
      <div className="text-center">
        <h1 className="mb-2 text-3xl font-bold">Validation & Sanitization Test Suite</h1>
        <p className="text-muted-foreground">
          Comprehensive testing of the data validation and sanitization system
        </p>
      </div>

      <Separator />

      <Tabs defaultValue="basic" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="basic">Basic Tests</TabsTrigger>
          <TabsTrigger value="forms">Form Validation</TabsTrigger>
          <TabsTrigger value="files">File Validation</TabsTrigger>
          <TabsTrigger value="csv">CSV Validation</TabsTrigger>
        </TabsList>

        <TabsContent value="basic">
          <BasicValidationTests />
        </TabsContent>

        <TabsContent value="forms">
          <FormValidationTests />
        </TabsContent>

        <TabsContent value="files">
          <FileValidationTests />
        </TabsContent>

        <TabsContent value="csv">
          <CsvValidationTests />
        </TabsContent>
      </Tabs>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bug className="h-5 w-5" />
            Validation System Features
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <h4 className="font-semibold">Input Validation</h4>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>• Email format validation</li>
                <li>• Phone number validation</li>
                <li>• Currency code validation</li>
                <li>• Country code validation</li>
                <li>• HSN/SAC code validation</li>
                <li>• Invoice number validation</li>
                <li>• Part number validation</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold">Security Features</h4>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>• SQL injection detection</li>
                <li>• XSS attack prevention</li>
                <li>• Input sanitization</li>
                <li>• HTML content filtering</li>
                <li>• Length restrictions</li>
                <li>• Character filtering</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold">File Validation</h4>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>• File size validation</li>
                <li>• File type validation</li>
                <li>• Extension validation</li>
                <li>• CSV data validation</li>
                <li>• Batch processing</li>
                <li>• Error reporting</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default ValidationTest
