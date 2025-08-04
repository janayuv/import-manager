"use client";

import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
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
import type { SavedBoe, Shipment } from "@/types/boe-entry";
import { Toaster, toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

export default function BoeEntryPage() {
  // State for data fetched from backend
  const [shipments, setShipments] = React.useState<Shipment[]>([]);
  const [savedBoes, setSavedBoes] = React.useState<SavedBoe[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  // State for modals/dialogs
  const [viewingBoe, setViewingBoe] = React.useState<SavedBoe | null>(null);
  const [editingBoe, setEditingBoe] = React.useState<SavedBoe | null>(null);
  const [deletingBoe, setDeletingBoe] = React.useState<SavedBoe | null>(null);

  // Function to fetch all necessary data from the backend
  const fetchData = async () => {
    try {
      const [shipmentsData, savedBoesData] = await Promise.all([
        invoke<Shipment[]>("get_shipments_for_boe_entry"),
        invoke<SavedBoe[]>("get_boe_calculations"),
      ]);
      setShipments(shipmentsData);
      setSavedBoes(savedBoesData);
    } catch (error) {
      toast.error("Failed to load data from the database.", {
        description: String(error),
      });
    }
  };

  // Fetch initial data on component mount
  React.useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      await fetchData();
      setIsLoading(false);
    };
    loadInitialData();
  }, []);

  const handleSaveOrUpdateBoe = async (boeData: SavedBoe) => {
    const isEditing = savedBoes.some((b) => b.id === boeData.id);
    const toastId = toast.loading(isEditing ? "Updating BOE..." : "Saving BOE...");

    try {
      if (isEditing) {
        await invoke("update_boe_calculation", { payload: boeData });
      } else {
        await invoke("add_boe_calculation", { payload: boeData });
      }

      await fetchData(); // Refetch data to update the list
      
      toast.success(isEditing ? "BOE Updated Successfully" : "BOE Saved Successfully", {
        id: toastId,
        description: `Calculation for invoice ${boeData.invoiceNumber} has been saved.`,
      });

      setEditingBoe(null); // Exit edit mode after save/update
    } catch (error) {
      toast.error(isEditing ? "Failed to update BOE" : "Failed to save BOE", {
        id: toastId,
        description: String(error),
      });
    }
  };

  const handleViewBoe = (boeId: string) => {
    const boeToView = savedBoes.find((b) => b.id === boeId) || null;
    setViewingBoe(boeToView);
  };

  const handleEditBoe = (boeId: string) => {
    const boeToEdit = savedBoes.find((b) => b.id === boeId) || null;
    setEditingBoe(boeToEdit);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelEdit = () => {
    setEditingBoe(null);
  };

  const handleDeleteBoe = (boeId: string) => {
    const boeToDelete = savedBoes.find((b) => b.id === boeId) || null;
    setDeletingBoe(boeToDelete);
  };

  const handleConfirmDelete = async () => {
    if (!deletingBoe) return;
    const toastId = toast.loading("Deleting BOE...");

    try {
      await invoke("delete_boe_calculation", { id: deletingBoe.id });
      await fetchData(); // Refetch data to update the list

      toast.success("BOE Deleted", {
        id: toastId,
        description: `Calculation for invoice ${deletingBoe.invoiceNumber} has been deleted.`,
      });

      setDeletingBoe(null);
    } catch (error) {
      toast.error("Failed to delete BOE", {
        id: toastId,
        description: String(error),
      });
    }
  };

  if (isLoading) {
      return (
          <div className="p-4 md:p-8 space-y-8">
              <Card>
                  <CardHeader>
                      <Skeleton className="h-8 w-48" />
                      <Skeleton className="h-4 w-96 mt-2" />
                  </CardHeader>
                  <CardContent>
                      <div className="space-y-4">
                          <div className="grid grid-cols-1 gap-6 md:grid-cols-3 lg:grid-cols-6">
                              <Skeleton className="h-10 w-full" />
                              <Skeleton className="h-10 w-full" />
                              <Skeleton className="h-10 w-full" />
                              <Skeleton className="h-10 w-full" />
                              <Skeleton className="h-10 w-full" />
                              <Skeleton className="h-10 w-full" />
                          </div>
                           <div className="flex justify-end">
                               <Skeleton className="h-10 w-32" />
                           </div>
                      </div>
                  </CardContent>
              </Card>
              <Card>
                  <CardHeader>
                      <Skeleton className="h-8 w-64" />
                      <Skeleton className="h-4 w-80 mt-2" />
                  </CardHeader>
                  <CardContent>
                      <Skeleton className="h-40 w-full" />
                  </CardContent>
              </Card>
          </div>
      )
  }

  return (
    <div className="p-4 md:p-8 space-y-8">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>
              {editingBoe
                ? `Editing BOE - ${editingBoe.invoiceNumber}`
                : "BOE Entry"}
            </CardTitle>
            <CardDescription>
              {editingBoe
                ? "Modify the details below and update the calculation."
                : "Select a shipment and enter details to calculate customs duties."}
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
        <ViewBoeDialog boe={viewingBoe} onClose={() => setViewingBoe(null)} />
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
