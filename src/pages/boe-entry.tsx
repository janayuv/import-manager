/*
================================================================================
| FILE: src/app/dashboard/boe-entry/page.tsx (MODIFIED)                        |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| 1. Removed unused `setShipments` to fix linting error.                       |
| 2. Removed the ImportDialog logic as it's now integrated into the main form. |
================================================================================
*/
"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BoeEntryForm } from "@/components/boe-entry/form";
import { SavedBoeList } from "@/components/boe-entry/saved-boe-list";
import { ViewBoeDialog } from "@/components/boe-entry/view-boe-dialog";
import { DeleteConfirmDialog } from "@/components/boe-entry/delete-confirm-dialog";
import { dummyShipments } from "@/components/boe-entry/dummy-data";
import type { SavedBoe } from "@/types/boe-entry";
import { Toaster, toast } from "sonner";

export default function BoeEntryPage() {
  const [shipments] = React.useState(dummyShipments);
  const [savedBoes, setSavedBoes] = React.useState<SavedBoe[]>([]);
  
  // State for modals/dialogs
  const [viewingBoe, setViewingBoe] = React.useState<SavedBoe | null>(null);
  const [editingBoe, setEditingBoe] = React.useState<SavedBoe | null>(null);
  const [deletingBoe, setDeletingBoe] = React.useState<SavedBoe | null>(null);

  const handleSaveOrUpdateBoe = (boeData: SavedBoe) => {
    const isEditing = savedBoes.some(b => b.id === boeData.id);

    if (isEditing) {
        setSavedBoes(prevBoes => prevBoes.map(b => b.id === boeData.id ? boeData : b));
        toast.success("BOE Updated Successfully", {
            description: `Calculation for invoice ${boeData.invoiceNumber} has been updated.`,
        });
    } else {
        setSavedBoes(prevBoes => [...prevBoes, boeData]);
        toast.success("BOE Saved Successfully", {
            description: `Calculation for invoice ${boeData.invoiceNumber} has been saved.`,
        });
    }
    setEditingBoe(null); // Exit edit mode after save/update
  };
  
  const handleViewBoe = (boeId: string) => {
    const boeToView = savedBoes.find(b => b.id === boeId) || null;
    setViewingBoe(boeToView);
  };

  const handleEditBoe = (boeId: string) => {
    const boeToEdit = savedBoes.find(b => b.id === boeId) || null;
    setEditingBoe(boeToEdit);
  };

  const handleCancelEdit = () => {
    setEditingBoe(null);
  };

  const handleDeleteBoe = (boeId: string) => {
    const boeToDelete = savedBoes.find(b => b.id === boeId) || null;
    setDeletingBoe(boeToDelete);
  };

  const handleConfirmDelete = () => {
    if (!deletingBoe) return;
    setSavedBoes(prev => prev.filter(b => b.id !== deletingBoe.id));
    toast.error("BOE Deleted", {
        description: `Calculation for invoice ${deletingBoe.invoiceNumber} has been deleted.`,
    });
    setDeletingBoe(null);
  };

  return (
    <div className="p-4 md:p-8 space-y-8">
      <Card>
        <CardHeader>
            <div>
                <CardTitle>{editingBoe ? `Editing BOE - ${editingBoe.invoiceNumber}` : "BOE Entry"}</CardTitle>
                <CardDescription>
                    {editingBoe ? "Modify the details below and update the calculation." : "Select a shipment and enter details to calculate customs duties."}
                </CardDescription>
            </div>
        </CardHeader>
        <CardContent>
          <BoeEntryForm 
            shipments={shipments} 
            onSaveOrUpdate={handleSaveOrUpdateBoe}
            initialData={editingBoe}
            onCancelEdit={handleCancelEdit}
            setEditingBoe={setEditingBoe}
          />
        </CardContent>
      </Card>
      
      <SavedBoeList 
        savedBoes={savedBoes} 
        onView={handleViewBoe} 
        onEdit={handleEditBoe}
        onDelete={handleDeleteBoe}
      />

      {viewingBoe && (
        <ViewBoeDialog 
            boe={viewingBoe}
            onClose={() => setViewingBoe(null)}
        />
      )}

      {deletingBoe && (
        <DeleteConfirmDialog
            boe={deletingBoe}
            onConfirm={handleConfirmDelete}
            onCancel={() => setDeletingBoe(null)}
        />
      )}
      
      <Toaster richColors />
    </div>
  );
}