"use client";

import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  List,
  Loader2,
  Map as MapIcon,
  Trash2,
} from "lucide-react";
import dynamic from "next/dynamic";
import { ProtectedPage } from "@/components/auth/protected-page";
import { useCallback, useEffect, useState } from "react";
import { useCompanyContext } from "@/hooks/use-company-context";
import { CompanySelector } from "@/components/company-selector";
import { useToast } from "@/hooks/use-toast";
import { OrderForm, type OrderFormData } from "@/components/orders/order-form";

// Dynamic import for heavy map component (bundle-dynamic-imports rule)
const OrderMap = dynamic(
  () => import("@/components/orders/order-map").then((mod) => mod.OrderMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[500px] bg-muted animate-pulse rounded-lg flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type {
  ORDER_STATUS,
  TIME_WINDOW_STRICTNESS,
} from "@/lib/validations/order";

const PAGE_SIZE = 20;

interface Order {
  id: string;
  trackingId: string;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  address: string;
  latitude: string;
  longitude: string;
  timeWindowPresetId: string | null;
  strictness: (typeof TIME_WINDOW_STRICTNESS)[number] | null;
  promisedDate: string | null;
  weightRequired: number | null;
  volumeRequired: number | null;
  requiredSkills: string | null;
  notes: string | null;
  status: (typeof ORDER_STATUS)[number];
  active: boolean;
  createdAt: string;
  updatedAt: string;
  presetName: string | null;
  presetStrictness: (typeof TIME_WINDOW_STRICTNESS)[number] | null;
  effectiveStrictness: (typeof TIME_WINDOW_STRICTNESS)[number];
  isStrictnessOverridden: boolean;
}

function OrdersPageContent() {
  const {
    effectiveCompanyId: companyId,
    isReady,
    isSystemAdmin,
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    authCompanyId,
  } = useCompanyContext();
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);

  const fetchOrders = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.append("status", filterStatus);
      if (searchQuery) params.append("search", searchQuery);
      params.append("limit", String(PAGE_SIZE));
      params.append("offset", String((currentPage - 1) * PAGE_SIZE));

      const response = await fetch(`/api/orders?${params}`, {
        headers: { "x-company-id": companyId ?? "" },
      });
      const result = await response.json();
      setOrders(result.data || []);
      setTotalOrders(result.meta?.total || result.data?.length || 0);
    } catch (error) {
      console.error("Failed to fetch orders:", error);
    } finally {
      setIsLoading(false);
    }
  }, [filterStatus, searchQuery, currentPage, companyId]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus, searchQuery]);

  const handleCreate = async (data: OrderFormData) => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId ?? "",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al crear pedido");
      }

      await fetchOrders();
      setShowForm(false);
      toast({
        title: "Pedido creado",
        description: `El pedido "${data.trackingId}" ha sido creado exitosamente.`,
      });
    } catch (err) {
      toast({
        title: "Error al crear pedido",
        description:
          err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleUpdate = async (data: OrderFormData) => {
    if (!editingOrder || !companyId) return;

    try {
      const response = await fetch(`/api/orders/${editingOrder.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId ?? "",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al actualizar pedido");
      }

      await fetchOrders();
      setEditingOrder(null);
      setShowForm(false);
      toast({
        title: "Pedido actualizado",
        description: `El pedido "${data.trackingId}" ha sido actualizado exitosamente.`,
      });
    } catch (err) {
      toast({
        title: "Error al actualizar pedido",
        description:
          err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleEdit = (order: Order) => {
    setEditingOrder(order);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!companyId) return;
    setDeletingId(id);
    const order = orders.find((o) => o.id === id);

    try {
      const response = await fetch(`/api/orders/${id}`, {
        method: "DELETE",
        headers: { "x-company-id": companyId ?? "" },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al eliminar pedido");
      }

      await fetchOrders();
      toast({
        title: "Pedido eliminado",
        description: order
          ? `El pedido "${order.trackingId}" ha sido eliminado.`
          : "El pedido ha sido eliminado.",
      });
    } catch (err) {
      toast({
        title: "Error al eliminar pedido",
        description:
          err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAll = async () => {
    if (!companyId) return;
    setIsDeleting(true);
    try {
      const response = await fetch("/api/orders/batch/delete?hard=true", {
        method: "DELETE",
        headers: { "x-company-id": companyId ?? "" },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Error al eliminar pedidos");
      }

      setCurrentPage(1);
      await fetchOrders();
      toast({
        title: "Pedidos eliminados",
        description: `${result.deleted} pedidos han sido eliminados.`,
      });
    } catch (err) {
      toast({
        title: "Error al eliminar pedidos",
        description:
          err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingOrder(null);
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      PENDING: "bg-gray-500/10 text-gray-600",
      ASSIGNED: "bg-blue-500/10 text-blue-600",
      IN_PROGRESS: "bg-yellow-500/10 text-yellow-600",
      COMPLETED: "bg-green-500/10 text-green-600",
      FAILED: "bg-red-500/10 text-red-600",
      CANCELLED: "bg-gray-500/10 text-gray-600",
    };
    return colors[status] || "bg-gray-500/10 text-gray-600";
  };

  const getStrictnessColor = (strictness: string) => {
    return strictness === "HARD"
      ? "bg-destructive/10 text-destructive"
      : "bg-yellow-500/10 text-yellow-600";
  };

  const filteredOrders = orders.filter((order) => order.active);
  const totalPages = Math.ceil(totalOrders / PAGE_SIZE);

  if (!isReady) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Pedidos</h1>
          <p className="text-muted-foreground mt-1">
            Gestiona los pedidos de entrega con restricciones de ventana de
            tiempo
          </p>
        </div>
        <div className="flex items-center gap-4">
          <CompanySelector
            companies={companies}
            selectedCompanyId={selectedCompanyId}
            authCompanyId={authCompanyId}
            onCompanyChange={setSelectedCompanyId}
            isSystemAdmin={isSystemAdmin}
          />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={totalOrders === 0}>
                <Trash2 className="w-4 h-4 mr-2" />
                Eliminar todos
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                  ¿Eliminar todos los pedidos?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Esta acción eliminará permanentemente{" "}
                  <strong>{totalOrders} pedidos</strong>. Esta acción no se
                  puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAll}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={isDeleting}
                >
                  {isDeleting ? "Eliminando..." : "Sí, eliminar todos"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button onClick={() => setShowForm(true)}>Crear Pedido</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Buscar por tracking ID o nombre de cliente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 border rounded-md bg-background"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 border rounded-md bg-background"
        >
          <option value="">Todos los estados</option>
          <option value="PENDING">Pendiente</option>
          <option value="ASSIGNED">Asignado</option>
          <option value="IN_PROGRESS">En Progreso</option>
          <option value="COMPLETED">Completado</option>
          <option value="FAILED">Fallido</option>
          <option value="CANCELLED">Cancelado</option>
        </select>
        <div className="flex border rounded-md">
          <Button
            variant={viewMode === "list" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("list")}
            className="rounded-r-none"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "map" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("map")}
            className="rounded-l-none"
          >
            <MapIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center justify-between text-sm text-muted-foreground border-b pb-3">
        <span>
          Mostrando {filteredOrders.length} de {totalOrders} pedidos
        </span>
        {totalPages > 1 && (
          <span>
            Página {currentPage} de {totalPages}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-12">Cargando...</div>
      ) : filteredOrders.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/30">
          <p className="text-muted-foreground">No se encontraron pedidos.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Crea tu primer pedido para comenzar.
          </p>
        </div>
      ) : viewMode === "map" ? (
        <OrderMap
          companyId={companyId ?? ""}
          statusFilter={filterStatus || "ALL"}
          searchQuery={searchQuery}
          onOrderClick={(orderId) => {
            const order = orders.find((o) => o.id === orderId);
            if (order) handleEdit(order);
          }}
          height="600px"
        />
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-4 font-medium">Tracking ID</th>
                <th className="text-left p-4 font-medium">Cliente</th>
                <th className="text-left p-4 font-medium">Dirección</th>
                <th className="text-left p-4 font-medium">Ventana Tiempo</th>
                <th className="text-left p-4 font-medium">Strictness</th>
                <th className="text-left p-4 font-medium">Estado</th>
                <th className="text-right p-4 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.id} className="border-t hover:bg-muted/30">
                  <td className="p-4 font-medium font-mono text-sm">
                    {order.trackingId}
                  </td>
                  <td className="p-4">
                    <div>
                      <div className="font-medium">
                        {order.customerName || "-"}
                      </div>
                      {order.customerPhone && (
                        <div className="text-sm text-muted-foreground">
                          {order.customerPhone}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="p-4 max-w-xs truncate text-sm">
                    {order.address}
                  </td>
                  <td className="p-4">
                    {order.presetName ? (
                      <div>
                        <div className="text-sm">{order.presetName}</div>
                        {order.isStrictnessOverridden && (
                          <span className="text-xs text-amber-600">
                            (override)
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">
                        Sin preset
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${getStrictnessColor(
                        order.effectiveStrictness,
                      )}`}
                    >
                      {order.effectiveStrictness}
                    </span>
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                        order.status,
                      )}`}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(order)}
                      disabled={deletingId === order.id}
                    >
                      Editar
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          disabled={deletingId === order.id}
                        >
                          {deletingId === order.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar pedido?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta acción eliminará el pedido{" "}
                            <strong>{order.trackingId}</strong>. Esta acción no
                            se puede deshacer.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(order.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Eliminar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Anterior
          </Button>

          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }

              return (
                <Button
                  key={pageNum}
                  variant={currentPage === pageNum ? "default" : "outline"}
                  size="sm"
                  className="w-10"
                  onClick={() => setCurrentPage(pageNum)}
                >
                  {pageNum}
                </Button>
              );
            })}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            Siguiente
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}

      {showForm && (
        <OrderForm
          onSubmit={editingOrder ? handleUpdate : handleCreate}
          initialData={editingOrder || undefined}
          submitLabel={editingOrder ? "Actualizar Pedido" : "Crear Pedido"}
          onCancel={handleCloseForm}
        />
      )}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <ProtectedPage requiredPermission="orders:VIEW">
      <OrdersPageContent />
    </ProtectedPage>
  );
}
