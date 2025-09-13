// src/components/shipment/view-professional.tsx - Professional CRM-style Shipment View
import {
  Building,
  Calendar,
  DollarSign,
  FileText,
  Globe,
  Hash,
  Package,
  Settings,
  Ship,
  Tag,
  Truck,
  X,
} from 'lucide-react';

import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Option } from '@/types/options';
import type { Shipment } from '@/types/shipment';

interface ProfessionalShipmentViewProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  shipment: Shipment | null;
  suppliers: Option[];
}

const getSupplierName = (suppliers: Option[], supplierId?: string): string => {
  if (!supplierId) return 'Not specified';
  const supplier = suppliers.find(s => s.value === supplierId);
  return supplier?.label || supplierId;
};

const formatCurrency = (amount?: number, currency?: string): string => {
  if (!amount && amount !== 0) return 'Not specified';
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return currency ? `${currency} ${formatted}` : formatted;
};

const getStatusColor = (status?: string) => {
  if (!status) return 'secondary';
  const statusLower = status.toLowerCase();
  if (statusLower.includes('delivered') || statusLower.includes('completed'))
    return 'default';
  if (statusLower.includes('in-transit') || statusLower.includes('shipped'))
    return 'default';
  if (statusLower.includes('docs-rcvd') || statusLower.includes('pending'))
    return 'secondary';
  return 'secondary';
};

const formatDate = (dateString?: string): string => {
  if (!dateString) return 'Not specified';
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
};

export function ProfessionalShipmentViewDialog({
  isOpen,
  onOpenChange,
  shipment,
  suppliers,
}: ProfessionalShipmentViewProps) {
  const [activeTab, setActiveTab] = React.useState('overview');

  React.useEffect(() => {
    if (isOpen) {
      setActiveTab('overview'); // Reset to first tab when opening
    }
  }, [isOpen]);

  // Calculate transit days
  const transitDays = React.useMemo(() => {
    if (!shipment?.etd || !shipment?.eta) {
      return null;
    }
    const etdDate = new Date(shipment.etd);
    const etaDate = new Date(shipment.eta);
    const diffTime = etaDate.getTime() - etdDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : null;
  }, [shipment?.etd, shipment?.eta]);

  if (!shipment) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95vh] overflow-hidden sm:max-w-5xl">
        <DialogHeader className="border-b pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 rounded-lg p-2">
                <Ship className="text-primary h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold">
                  {shipment.invoiceNumber}
                </DialogTitle>
                <DialogDescription>
                  Shipment from{' '}
                  {getSupplierName(suppliers, shipment.supplierId)}
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={getStatusColor(shipment.status)}>
                {shipment.status?.replace(/-/g, ' ').toUpperCase() || 'PENDING'}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="h-full"
          >
            <TabsList className="mb-4 grid w-full grid-cols-3">
              <TabsTrigger value="overview" className="flex items-center gap-2">
                <Ship className="h-4 w-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="commercial"
                className="flex items-center gap-2"
              >
                <DollarSign className="h-4 w-4" />
                Commercial
              </TabsTrigger>
              <TabsTrigger
                value="logistics"
                className="flex items-center gap-2"
              >
                <Truck className="h-4 w-4" />
                Logistics
              </TabsTrigger>
            </TabsList>

            <div className="max-h-[calc(95vh-200px)] overflow-y-auto">
              {/* Overview Tab */}
              <TabsContent value="overview" className="mt-0 space-y-6">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {/* Basic Information */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <FileText className="h-4 w-4" />
                        Basic Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-start gap-3">
                        <Building className="text-muted-foreground mt-1 h-4 w-4" />
                        <div className="flex-1">
                          <Label className="text-muted-foreground text-sm font-medium">
                            Supplier
                          </Label>
                          <p className="mt-1 text-sm">
                            {getSupplierName(suppliers, shipment.supplierId)}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-start gap-3">
                          <Hash className="text-muted-foreground mt-1 h-4 w-4" />
                          <div className="flex-1">
                            <Label className="text-muted-foreground text-sm font-medium">
                              Invoice Number
                            </Label>
                            <p className="bg-muted mt-1 rounded px-2 py-1 font-mono text-sm">
                              {shipment.invoiceNumber}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-start gap-3">
                          <Calendar className="text-muted-foreground mt-1 h-4 w-4" />
                          <div className="flex-1">
                            <Label className="text-muted-foreground text-sm font-medium">
                              Invoice Date
                            </Label>
                            <p className="mt-1 text-sm">
                              {formatDate(shipment.invoiceDate)}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <Tag className="text-muted-foreground mt-1 h-4 w-4" />
                        <div className="flex-1">
                          <Label className="text-muted-foreground text-sm font-medium">
                            Goods Category
                          </Label>
                          <p className="mt-1 text-sm">
                            {shipment.goodsCategory || 'Not specified'}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Status & Classification */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Settings className="h-4 w-4" />
                        Status & Classification
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-start gap-3">
                        <Settings className="text-muted-foreground mt-1 h-4 w-4" />
                        <div className="flex-1">
                          <Label className="text-muted-foreground text-sm font-medium">
                            Status
                          </Label>
                          <div className="mt-1">
                            <Badge variant={getStatusColor(shipment.status)}>
                              {shipment.status
                                ?.replace(/-/g, ' ')
                                .toUpperCase() || 'PENDING'}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <Package className="text-muted-foreground mt-1 h-4 w-4" />
                        <div className="flex-1">
                          <Label className="text-muted-foreground text-sm font-medium">
                            Shipment Type
                          </Label>
                          <p className="mt-1 text-sm">
                            {shipment.shipmentType || 'Not specified'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <Truck className="text-muted-foreground mt-1 h-4 w-4" />
                        <div className="flex-1">
                          <Label className="text-muted-foreground text-sm font-medium">
                            Mode of Transport
                          </Label>
                          <p className="mt-1 text-sm">
                            {shipment.shipmentMode || 'Not specified'}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Commercial Tab */}
              <TabsContent value="commercial" className="mt-0 space-y-6">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-1">
                  {/* Invoice Details */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <DollarSign className="h-4 w-4" />
                        Invoice Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-start gap-3">
                        <DollarSign className="text-muted-foreground mt-1 h-4 w-4" />
                        <div className="flex-1">
                          <Label className="text-muted-foreground text-sm font-medium">
                            Invoice Value
                          </Label>
                          <p className="mt-1 text-lg font-semibold">
                            {formatCurrency(
                              shipment.invoiceValue,
                              shipment.invoiceCurrency
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <Globe className="text-muted-foreground mt-1 h-4 w-4" />
                        <div className="flex-1">
                          <Label className="text-muted-foreground text-sm font-medium">
                            Incoterm
                          </Label>
                          <p className="mt-1 text-sm">
                            {shipment.incoterm || 'Not specified'}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Logistics Tab */}
              <TabsContent value="logistics" className="mt-0 space-y-6">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {/* Shipping Documents */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <FileText className="h-4 w-4" />
                        Shipping Documents
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-3">
                        <div>
                          <Label className="text-muted-foreground text-sm font-medium">
                            BL/AWB Number
                          </Label>
                          <p className="bg-muted mt-1 rounded px-2 py-1 font-mono text-sm">
                            {shipment.blAwbNumber || 'Not specified'}
                          </p>
                        </div>

                        <div>
                          <Label className="text-muted-foreground text-sm font-medium">
                            BL/AWB Date
                          </Label>
                          <p className="mt-1 text-sm">
                            {formatDate(shipment.blAwbDate)}
                          </p>
                        </div>

                        <div>
                          <Label className="text-muted-foreground text-sm font-medium">
                            Vessel Name
                          </Label>
                          <p className="mt-1 text-sm">
                            {shipment.vesselName || 'Not specified'}
                          </p>
                        </div>

                        <div>
                          <Label className="text-muted-foreground text-sm font-medium">
                            Container Number
                          </Label>
                          <p className="bg-muted mt-1 rounded px-2 py-1 font-mono text-sm">
                            {shipment.containerNumber || 'Not specified'}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Shipping Schedule & Weight */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Calendar className="h-4 w-4" />
                        Schedule & Weight
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-muted/50 rounded-lg p-3 text-center">
                          <Label className="text-muted-foreground text-xs font-medium">
                            ETD
                          </Label>
                          <p className="mt-1 text-sm font-semibold">
                            {formatDate(shipment.etd)}
                          </p>
                        </div>

                        <div className="bg-muted/50 rounded-lg p-3 text-center">
                          <Label className="text-muted-foreground text-xs font-medium">
                            ETA
                          </Label>
                          <p className="mt-1 text-sm font-semibold">
                            {formatDate(shipment.eta)}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-muted/50 rounded-lg p-3 text-center">
                          <Label className="text-muted-foreground text-xs font-medium">
                            Gross Weight (KG)
                          </Label>
                          <p className="mt-1 text-sm font-semibold">
                            {shipment.grossWeightKg
                              ? `${shipment.grossWeightKg} kg`
                              : 'Not specified'}
                          </p>
                        </div>

                        <div className="bg-muted/50 rounded-lg p-3 text-center">
                          <Label className="text-muted-foreground text-xs font-medium">
                            Delivery Date
                          </Label>
                          <p className="mt-1 text-sm font-semibold">
                            {formatDate(shipment.dateOfDelivery)}
                          </p>
                        </div>
                      </div>

                      {transitDays && (
                        <div className="bg-primary/10 rounded-lg p-3 text-center">
                          <Label className="text-muted-foreground text-xs font-medium">
                            Transit Time
                          </Label>
                          <p className="text-primary mt-1 text-lg font-bold">
                            {transitDays} days
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Shipment Status */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-1">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Settings className="h-4 w-4" />
                        Shipment Status
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="bg-muted/50 flex items-center justify-between rounded-lg p-3">
                        <Label className="text-muted-foreground text-sm font-medium">
                          Frozen Status
                        </Label>
                        <div className="flex items-center gap-2">
                          {shipment.isFrozen ? (
                            <>
                              <div className="h-2 w-2 rounded-full bg-yellow-500" />
                              <span className="text-sm font-semibold text-yellow-700">
                                Frozen
                              </span>
                            </>
                          ) : (
                            <>
                              <div className="h-2 w-2 rounded-full bg-green-500" />
                              <span className="text-sm font-semibold text-green-700">
                                Active
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {shipment.isFrozen && (
                        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                          <div className="flex items-center gap-2 text-yellow-800">
                            <Settings className="h-4 w-4" />
                            <span className="text-sm font-medium">
                              Shipment Frozen
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-yellow-700">
                            This shipment is locked and cannot be modified
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        <Separator />

        {/* Footer */}
        <div className="flex items-center justify-between pt-4">
          <div className="text-muted-foreground flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className={`bg-primary h-2 w-2 rounded-full`} />
              Shipment ID: {shipment.id}
            </div>
          </div>

          <Button type="button" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
