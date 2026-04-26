import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { AlertCircle, AlertTriangle, Loader2, Upload } from 'lucide-react';

import * as React from 'react';

import { AIExtractionPreviewDialog } from '@/components/ai-invoice/AIExtractionPreviewDialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { isDeepseekApiKeyConfiguredForUi } from '@/lib/ai-invoice-extraction-ui';
import type { AiExtractionConfigHint } from '@/types/ai-provider-settings';
import { formatBatchProgressLine } from '@/lib/ai-invoice-batch-ui';
import { cn } from '@/lib/utils';
import type {
  AiExtractionProvider,
  ExtractInvoiceWithAiRequest,
  ExtractInvoiceResponse,
  ProcessInvoiceBatchResult,
} from '@/types/ai-invoice-extraction';

const MAX_FILE_BYTES = 3 * 1024 * 1024;
const ACCEPT_EXT = new Set(['pdf', 'jpeg', 'jpg', 'png', 'xlsx']);
const ACCEPT_ATTR =
  '.pdf,.jpeg,.jpg,.png,.xlsx,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function validateFileForUpload(file: File): string | null {
  if (file.size > MAX_FILE_BYTES) {
    return 'This file is too large. Please choose a file of 3 MB or smaller.';
  }
  const ext = file.name.includes('.')
    ? file.name.split('.').pop()?.toLowerCase()
    : '';
  if (!ext || !ACCEPT_EXT.has(ext)) {
    return 'That file type is not supported. Please upload a PDF, JPEG, JPG, PNG, or XLSX file.';
  }
  return null;
}

async function fileToByteArray(file: File): Promise<number[]> {
  const buffer = await file.arrayBuffer();
  return Array.from(new Uint8Array(buffer));
}

function extractErrorMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: string }).message;
    if (typeof m === 'string') return m;
  }
  return 'Something went wrong while extracting the invoice. Please try again.';
}

const BATCH_EVENT = 'ai-invoice-batch-progress' as const;

export default function AIInvoicePage() {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = React.useState<File[]>([]);
  const [supplierHint, setSupplierHint] = React.useState('');
  const [provider, setProvider] = React.useState<AiExtractionProvider>('mock');
  const [processing, setProcessing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ExtractInvoiceResponse | null>(
    null
  );
  const [isDragging, setIsDragging] = React.useState(false);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [batchResult, setBatchResult] =
    React.useState<ProcessInvoiceBatchResult | null>(null);
  const [batchProgress, setBatchProgress] = React.useState<{
    current: number;
    total: number;
    fileName: string;
  } | null>(null);
  const [extractionConfigHint, setExtractionConfigHint] =
    React.useState<AiExtractionConfigHint | null>(null);

  React.useEffect(() => {
    let c = false;
    (async () => {
      try {
        const h = await invoke<AiExtractionConfigHint>(
          'get_ai_extraction_config_hint'
        );
        if (c) return;
        setExtractionConfigHint(h);
        const d = h.defaultProvider.trim().toLowerCase();
        if (
          d === 'deepseek' ||
          d === 'mock' ||
          d === 'local' ||
          d === 'ollama'
        ) {
          setProvider(d === 'ollama' ? 'local' : (d as AiExtractionProvider));
        }
      } catch {
        /* use UI defaults if command fails */
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  const applyFiles = React.useCallback((files: File[] | null | undefined) => {
    if (!files?.length) return;
    setError(null);
    setResult(null);
    setBatchResult(null);
    const list = [...files];
    for (const f of list) {
      const msg = validateFileForUpload(f);
      if (msg) {
        setError(msg);
        setSelectedFiles([]);
        return;
      }
    }
    setSelectedFiles(list);
  }, []);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    applyFiles(files);
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (processing) return;
    const files = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    if (files.length) applyFiles(files);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!processing) setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const deepseekEnvOk =
    isDeepseekApiKeyConfiguredForUi() ||
    extractionConfigHint?.deepseekConfigured === true;
  const deepseekBlocked = provider === 'deepseek' && !deepseekEnvOk;

  const buildRequestForFile = React.useCallback(
    async (file: File): Promise<ExtractInvoiceWithAiRequest> => {
      const fileBytes = await fileToByteArray(file);
      return {
        fileBytes,
        fileName: file.name,
        supplierHint: supplierHint.trim() ? supplierHint.trim() : null,
        provider,
      };
    },
    [supplierHint, provider]
  );

  const handleExtractSingle = async () => {
    if (selectedFiles.length !== 1 || processing) return;
    if (provider === 'deepseek' && !deepseekEnvOk) return;
    setError(null);
    setResult(null);
    setBatchResult(null);
    setProcessing(true);
    try {
      const file = selectedFiles[0];
      const fileBytes = await fileToByteArray(file);
      const res = await invoke<ExtractInvoiceResponse>(
        'extract_invoice_with_ai',
        {
          request: {
            fileBytes: fileBytes,
            fileName: file.name,
            supplierHint: supplierHint.trim() ? supplierHint.trim() : null,
            provider,
          },
        }
      );
      setResult(res);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setProcessing(false);
    }
  };

  const handleBatchExtract = async () => {
    if (selectedFiles.length < 2 || processing) return;
    if (provider === 'deepseek' && !deepseekEnvOk) return;
    setError(null);
    setResult(null);
    setBatchResult(null);
    setProcessing(true);
    setBatchProgress({ current: 0, total: selectedFiles.length, fileName: '' });
    let unlisten: UnlistenFn | undefined;
    try {
      unlisten = await listen<{
        current: number;
        total: number;
        fileName: string;
      }>(BATCH_EVENT, e => {
        setBatchProgress(e.payload);
      });
      const files: ExtractInvoiceWithAiRequest[] = await Promise.all(
        selectedFiles.map(f => buildRequestForFile(f))
      );
      const res = await invoke<ProcessInvoiceBatchResult>(
        'process_invoice_batch',
        { files }
      );
      setBatchResult(res);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      unlisten?.();
      setBatchProgress(null);
      setProcessing(false);
    }
  };

  const handleRun = () => {
    if (selectedFiles.length === 1) void handleExtractSingle();
    else if (selectedFiles.length > 1) void handleBatchExtract();
  };

  React.useEffect(() => {
    if (result) {
      setPreviewOpen(true);
    }
  }, [result]);

  const disabledUi = processing;

  const firstFile = selectedFiles[0];
  const canRun = selectedFiles.length > 0 && !disabledUi && !deepseekBlocked;

  return (
    <div className="container mx-auto max-w-5xl py-10" aria-busy={processing}>
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-blue-600">
          AI Invoice Extraction
        </h1>
        <p className="text-muted-foreground mt-1">
          Choose Mock for a local demo, or DeepSeek to call the API when the
          host is configured (V0.2.2). Select one or more invoice files to run
          extraction sequentially.
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Could not complete the request</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-8">
        <div className="space-y-2">
          <Label htmlFor="ai-extraction-provider">AI Provider</Label>
          <Select
            value={provider}
            onValueChange={v => {
              setProvider(v as AiExtractionProvider);
            }}
            disabled={disabledUi}
          >
            <SelectTrigger
              id="ai-extraction-provider"
              className="max-w-md"
              aria-label="AI Provider"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mock">Mock</SelectItem>
              <SelectItem value="deepseek">DeepSeek</SelectItem>
              <SelectItem value="local">Local (Ollama)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {deepseekBlocked && (
          <Alert
            variant="default"
            className="border-amber-500/40 bg-amber-500/5"
          >
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription>
              DeepSeek API key not configured.
            </AlertDescription>
          </Alert>
        )}

        <Card className={cn(disabledUi && 'pointer-events-none opacity-70')}>
          <CardHeader>
            <CardTitle>Upload</CardTitle>
            <CardDescription>
              PDF, JPEG, JPG, PNG, or XLSX — up to 3 MB each. Select multiple
              files to process a batch, or a single file as before. Drag and
              drop is supported.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <input
              ref={inputRef}
              type="file"
              multiple
              className="sr-only"
              accept={ACCEPT_ATTR}
              onChange={onInputChange}
              disabled={disabledUi}
            />

            <div
              role="button"
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (!disabledUi) inputRef.current?.click();
                }
              }}
              onClick={() => !disabledUi && inputRef.current?.click()}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              className={cn(
                'flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors',
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 bg-muted/30',
                disabledUi && 'cursor-not-allowed'
              )}
            >
              <Upload className="text-muted-foreground mb-2 h-8 w-8" />
              <Button
                type="button"
                variant="default"
                disabled={disabledUi}
                onClick={e => {
                  e.stopPropagation();
                  inputRef.current?.click();
                }}
              >
                {selectedFiles.length > 1
                  ? `Select invoice files (${selectedFiles.length} chosen)`
                  : 'Upload invoice(s)'}
              </Button>
              {selectedFiles.length > 0 && (
                <ul className="text-muted-foreground mt-3 max-w-full list-inside list-disc text-center text-sm">
                  {selectedFiles.map(f => (
                    <li key={`${f.name}-${f.size}`} className="text-left">
                      <span className="text-foreground font-medium">
                        {f.name}
                      </span>{' '}
                      <span className="text-muted-foreground">
                        ({(f.size / 1024).toFixed(1)} KB)
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier-hint">Supplier Hint (optional)</Label>
              <Input
                id="supplier-hint"
                value={supplierHint}
                onChange={e => setSupplierHint(e.target.value)}
                placeholder="e.g. known supplier name (applies to all files in the batch)"
                disabled={disabledUi}
                autoComplete="off"
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                type="button"
                onClick={() => void handleRun()}
                disabled={!canRun}
              >
                {selectedFiles.length > 1
                  ? `Process batch (${selectedFiles.length} files)`
                  : 'Extract Invoice Data'}
              </Button>
              {processing && !batchProgress && firstFile && (
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  <span>
                    Processing invoice using{' '}
                    {provider === 'deepseek'
                      ? 'DeepSeek'
                      : provider === 'local'
                        ? 'Ollama'
                        : 'Mock'}
                    {' — '}
                    {firstFile.name}
                    ...
                  </span>
                </div>
              )}
              {processing && batchProgress && batchProgress.total > 0 && (
                <div
                  className="text-muted-foreground flex items-center gap-2 text-sm"
                  role="status"
                  aria-live="polite"
                >
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  <span>
                    {formatBatchProgressLine(
                      Math.max(1, batchProgress.current),
                      batchProgress.total,
                      batchProgress.fileName || '…'
                    )}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {result && !processing && !previewOpen && selectedFiles.length < 2 && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground mb-3 text-sm">
                Extraction log ID: {result.logId} — Confidence:{' '}
                {Math.round((result.confidenceScore ?? 0) * 100)}%
              </p>
              <Button type="button" onClick={() => setPreviewOpen(true)}>
                Open review &amp; save
              </Button>
            </CardContent>
          </Card>
        )}

        {batchResult && !processing && batchResult.total > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Batch results</CardTitle>
              <CardDescription>
                {batchResult.successCount} succeeded, {batchResult.errorCount}{' '}
                failed (of {batchResult.total}).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Errors</TableHead>
                    <TableHead className="w-28">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batchResult.results.map((row, idx) => (
                    <TableRow key={`${row.fileName}-${idx}`}>
                      <TableCell className="max-w-[200px] truncate font-medium">
                        {row.fileName}
                      </TableCell>
                      <TableCell
                        className={cn(
                          row.status === 'success'
                            ? 'text-emerald-700'
                            : 'text-destructive'
                        )}
                      >
                        {row.status}
                      </TableCell>
                      <TableCell>
                        {row.confidenceScore == null
                          ? '—'
                          : `${Math.round(row.confidenceScore * 100)}%`}
                      </TableCell>
                      <TableCell className="wrap-break-word max-w-sm whitespace-pre-wrap text-sm">
                        {row.error ?? '—'}
                      </TableCell>
                      <TableCell>
                        {row.status === 'success' && row.extraction && (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setResult(row.extraction!);
                              setPreviewOpen(true);
                            }}
                          >
                            Review
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <AIExtractionPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        data={result}
        onSaveSuccess={() => {
          setResult(null);
          if (selectedFiles.length < 2) {
            setSelectedFiles([]);
          }
        }}
      />
    </div>
  );
}
