// src/pages/boe/index.tsx (MODIFIED)
import { Download, Loader2, Plus, Upload } from 'lucide-react'
import Papa from 'papaparse'
import { toast } from 'sonner'

import * as React from 'react'

import { getBoeColumns } from '@/components/boe/columns'
import { DataTable } from '@/components/boe/data-table'
import { BoeForm } from '@/components/boe/form'
import { BoeViewDialog } from '@/components/boe/view'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useSettings } from '@/lib/use-settings'
import type { BoeDetails } from '@/types/boe'
import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'

const BoePage = () => {
  const { settings } = useSettings()
  const [boes, setBoes] = React.useState<BoeDetails[]>([])
  const [loading, setLoading] = React.useState(true)
  const [isFormOpen, setFormOpen] = React.useState(false)
  const [isViewOpen, setViewOpen] = React.useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false)
  const [boeToEdit, setBoeToEdit] = React.useState<BoeDetails | null>(null)
  const [boeToView, setBoeToView] = React.useState<BoeDetails | null>(null)
  const [boeToDelete, setBoeToDelete] = React.useState<{ id: string; number: string } | null>(null)
  const [globalFilter, setGlobalFilter] = React.useState('')

  const fetchData = async () => {
    setLoading(true)
    try {
      const fetchedBoes = await invoke<BoeDetails[]>('get_boes')
      setBoes(fetchedBoes)
    } catch (error) {
      console.error('Failed to fetch BOE data:', error)
      toast.error('Failed to load BOE data.')
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    fetchData()
  }, [])

  const handleOpenFormForAdd = () => {
    setBoeToEdit(null)
    setFormOpen(true)
  }

  const handleOpenFormForEdit = React.useCallback((boe: BoeDetails) => {
    setBoeToEdit(boe)
    setFormOpen(true)
  }, [])

  const handleView = React.useCallback((boe: BoeDetails) => {
    setBoeToView(boe)
    setViewOpen(true)
  }, [])

  const handleDeleteRequest = React.useCallback((boe: BoeDetails) => {
    setBoeToDelete({ id: boe.id, number: boe.beNumber })
    setIsDeleteDialogOpen(true)
  }, [])

  const handleDeleteConfirm = async () => {
    if (boeToDelete) {
      try {
        await invoke('delete_boe', { id: boeToDelete.id })
        toast.success(`BOE ${boeToDelete.number} deleted successfully.`)
        fetchData()
      } catch (error) {
        console.error('Failed to delete BOE:', error)
        toast.error('Failed to delete BOE.')
      }
    }
    setIsDeleteDialogOpen(false)
    setBoeToDelete(null)
  }

  const handleSubmit = async (data: Omit<BoeDetails, 'id'>, id?: string) => {
    try {
      if (id) {
        await invoke('update_boe', { boe: { id, ...data } })
        toast.success(`BOE ${data.beNumber} has been updated.`)
      } else {
        // The backend command now expects the payload directly
        await invoke('add_boe', { payload: data })
        toast.success(`BOE ${data.beNumber} has been created.`)
      }
      setFormOpen(false)
      fetchData()
    } catch (error) {
      console.error('Failed to save BOE:', error)
      toast.error(`Failed to save BOE: ${error}`)
    }
  }

  const handleExport = async () => {
    if (boes.length === 0) {
      toast.warning('No data to export.')
      return
    }
    const csv = Papa.unparse(boes)
    try {
      const filePath = await save({
        defaultPath: 'boe_details.csv',
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      })
      if (filePath) {
        await writeTextFile(filePath, csv)
        toast.success('BOE data exported successfully!')
      }
    } catch (error) {
      console.error('Failed to export BOEs:', error)
      toast.error('Failed to export BOEs.')
    }
  }

  const handleDownloadTemplate = async () => {
    const templateData = [
      {
        beNumber: '1234567',
        beDate: '2024-12-31',
        location: 'INMAA1',
        totalAssessmentValue: '10000.50',
        dutyAmount: '2500.75',
        paymentDate: '2025-01-15',
        dutyPaid: '2500.75',
        challanNumber: 'CH123',
        refId: 'REF456',
        transactionId: 'TRN789',
      },
    ]
    const csv = Papa.unparse(templateData)
    try {
      const filePath = await save({
        defaultPath: 'boe_template.csv',
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      })
      if (filePath) {
        await writeTextFile(filePath, csv)
        toast.success('Template downloaded successfully!')
      }
    } catch (error) {
      console.error('Failed to download template:', error)
      toast.error('Failed to download template.')
    }
  }

  type BoeCsvRow = { [key: string]: string }

  const handleImport = async () => {
    try {
      const selectedPath = await open({
        multiple: false,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      })
      if (typeof selectedPath === 'string') {
        const content = await readTextFile(selectedPath)
        Papa.parse<BoeCsvRow>(content, {
          header: true,
          skipEmptyLines: true,
          complete: async (results) => {
            let addedCount = 0
            let skippedCount = 0
            for (const row of results.data) {
              const isDuplicate = boes.some(
                (boe) => boe.beNumber === row.beNumber && boe.beDate === row.beDate
              )
              if (isDuplicate) {
                skippedCount++
                continue
              }
              const newBoe: Omit<BoeDetails, 'id'> = {
                beNumber: row.beNumber || '',
                beDate: row.beDate || '',
                location: row.location || '',
                totalAssessmentValue: parseFloat(row.totalAssessmentValue) || 0,
                dutyAmount: parseFloat(row.dutyAmount) || 0,
                paymentDate: row.paymentDate || undefined,
                dutyPaid: parseFloat(row.dutyPaid) || undefined,
                challanNumber: row.challanNumber || undefined,
                refId: row.refId || undefined,
                transactionId: row.transactionId || undefined,
              }
              try {
                await invoke('add_boe', { payload: newBoe })
                addedCount++
              } catch (e) {
                console.error('Failed to import row:', row, e)
                skippedCount++
              }
            }
            toast.success(`${addedCount} new BOEs imported. ${skippedCount} duplicates skipped.`)
            fetchData()
          },
          error: (err: Error) => {
            toast.error('Failed to parse CSV file.')
            console.error('CSV parsing error:', err)
          },
        })
      }
    } catch (error) {
      console.error('Failed to import BOEs:', error)
      toast.error('Failed to import BOEs.')
    }
  }

  const columns = React.useMemo(
    () =>
      getBoeColumns({
        onView: handleView,
        onEdit: handleOpenFormForEdit,
        onDelete: handleDeleteRequest,
        settings,
      }),
    [handleView, handleOpenFormForEdit, handleDeleteRequest, settings]
  )

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin" />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-10">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Bill of Entry Details</h1>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleDownloadTemplate}
            variant="outline"
            style={{ backgroundColor: '#a855f7', color: 'white' }}
          >
            <Download className="mr-2 h-4 w-4" /> Template
          </Button>
          <Button
            onClick={handleImport}
            variant="outline"
            style={{ backgroundColor: '#22c55e', color: 'white' }}
          >
            <Upload className="mr-2 h-4 w-4" /> Import
          </Button>
          <Button
            onClick={handleExport}
            variant="outline"
            style={{ backgroundColor: '#3b82f6', color: 'white' }}
          >
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <Button
            onClick={handleOpenFormForAdd}
            style={{ backgroundColor: '#e7739e', color: 'white' }}
          >
            <Plus className="mr-2 h-4 w-4" /> Add New BOE
          </Button>
        </div>
      </div>
      <DataTable
        columns={columns}
        data={boes}
        globalFilter={globalFilter}
        setGlobalFilter={setGlobalFilter}
        storageKey="boe-table-page-size"
      />

      <BoeForm
        isOpen={isFormOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
        boeToEdit={boeToEdit}
        existingBoes={boes}
      />
      <BoeViewDialog isOpen={isViewOpen} onOpenChange={setViewOpen} boe={boeToView} />
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete BOE{' '}
              <strong>{boeToDelete?.number}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setBoeToDelete(null)}
              className="custom-alert-action-ok"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="custom-alert-action-orange">
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default BoePage
