"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, List, Loader2, Map as MapIcon, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
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
import { OrderForm } from "./order-form";
import { useOrders, type Order } from "./orders-context";

interface ListFieldDefinition {
  id: string;
  code: string;
  label: string;
  fieldType: string;
}

function useListFieldDefinitions(companyId: string | null) {
  const [fields, setFields] = useState<ListFieldDefinition[]>([]);

  const load = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await fetch(
        `/api/companies/${companyId}/field-definitions?entity=orders`,
        { headers: { "x-company-id": companyId } },
      );
      if (res.ok) {
        const data = await res.json();
        setFields(
          (data.data || []).filter(
            (d: { active: boolean; showInList: boolean }) => d.active && d.showInList,
          ),
        );
      }
    } catch {
      // silent
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  return fields;
}

const OrderMap = dynamic(() => import("./order-map").then((mod) => mod.OrderMap), {
  ssr: false,
  loading: () => (
    <div className="h-[500px] bg-muted animate-pulse rounded-lg flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  ),
});

export function OrdersListView() {
  const { state, actions, meta } = useOrders();
  const customFieldDefs = useListFieldDefinitions(meta.companyId);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Pedidos</h1>
          <p className="text-muted-foreground mt-1">Gestiona los pedidos de entrega con restricciones de ventana de tiempo</p>
        </div>
        <div className="flex items-center gap-4">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={state.totalOrders === 0}>
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
                  Esta acción eliminará permanentemente <strong>{state.totalOrders} pedidos</strong>. Esta acción no se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={actions.handleDeleteAll}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={state.isDeleting}
                >
                  {state.isDeleting ? "Eliminando..." : "Sí, eliminar todos"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button onClick={() => actions.setShowForm(true)}>Crear Pedido</Button>
        </div>
      </div>

      <div className="flex gap-4 mb-6">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Buscar por tracking ID o nombre de cliente..."
            value={state.searchQuery}
            onChange={(e) => actions.setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 border rounded-md bg-background"
          />
        </div>
        <select
          value={state.filterStatus}
          onChange={(e) => actions.setFilterStatus(e.target.value)}
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
            variant={state.viewMode === "list" ? "default" : "ghost"}
            size="sm"
            onClick={() => actions.setViewMode("list")}
            className="rounded-r-none"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={state.viewMode === "map" ? "default" : "ghost"}
            size="sm"
            onClick={() => actions.setViewMode("map")}
            className="rounded-l-none"
          >
            <MapIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground border-b pb-3">
        <span>
          Mostrando {state.filteredOrders.length} de {state.totalOrders} pedidos
        </span>
        {state.totalPages > 1 && (
          <span>
            Página {state.currentPage} de {state.totalPages}
          </span>
        )}
      </div>

      {state.isLoading ? (
        <div className="text-center py-12">Cargando...</div>
      ) : state.filteredOrders.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/30">
          <p className="text-muted-foreground">No se encontraron pedidos.</p>
          <p className="text-sm text-muted-foreground mt-1">Crea tu primer pedido para comenzar.</p>
        </div>
      ) : state.viewMode === "map" ? (
        <OrderMap
          companyId={meta.companyId ?? ""}
          statusFilter={state.filterStatus || "ALL"}
          searchQuery={state.searchQuery}
          onOrderClick={(orderId) => {
            const order = state.orders.find((o) => o.id === orderId);
            if (order) actions.handleEdit(order);
          }}
          height="600px"
        />
      ) : (
        <div className="border rounded-lg overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-4 font-medium">Tracking ID</th>
                <th className="text-left p-4 font-medium">Cliente</th>
                <th className="text-left p-4 font-medium">Dirección</th>
                <th className="text-left p-4 font-medium">Ventana Tiempo</th>
                <th className="text-left p-4 font-medium">Strictness</th>
                <th className="text-left p-4 font-medium">Estado</th>
                {customFieldDefs.map((fd) => (
                  <th key={fd.id} className="text-left p-4 font-medium text-sm">
                    {fd.label}
                  </th>
                ))}
                <th className="text-right p-4 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {state.filteredOrders.map((order) => (
                <OrderRow key={order.id} order={order} customFieldDefs={customFieldDefs} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {state.totalPages > 1 && <OrdersPagination />}

      {state.showForm && (
        <OrderForm
          onSubmit={state.editingOrder ? actions.handleUpdate : actions.handleCreate}
          initialData={state.editingOrder || undefined}
          submitLabel={state.editingOrder ? "Actualizar Pedido" : "Crear Pedido"}
          onCancel={actions.handleCloseForm}
        />
      )}
    </div>
  );
}

function OrderRow({ order, customFieldDefs }: { order: Order; customFieldDefs: ListFieldDefinition[] }) {
  const { state, actions } = useOrders();

  return (
    <tr className="border-t hover:bg-muted/30">
      <td className="p-4 font-medium font-mono text-sm">{order.trackingId}</td>
      <td className="p-4">
        <div>
          <div className="font-medium">{order.customerName || "-"}</div>
          {order.customerPhone && <div className="text-sm text-muted-foreground">{order.customerPhone}</div>}
        </div>
      </td>
      <td className="p-4 max-w-xs truncate text-sm">{order.address}</td>
      <td className="p-4">
        {order.presetName ? (
          <div>
            <div className="text-sm">{order.presetName}</div>
            {order.isStrictnessOverridden && <span className="text-xs text-amber-600">(override)</span>}
          </div>
        ) : (
          <span className="text-muted-foreground text-sm">Sin preset</span>
        )}
      </td>
      <td className="p-4">
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${actions.getStrictnessColor(order.effectiveStrictness)}`}>
          {order.effectiveStrictness}
        </span>
      </td>
      <td className="p-4">
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${actions.getStatusColor(order.status)}`}>{order.status}</span>
      </td>
      {customFieldDefs.map((fd) => {
        const cf = order.customFields as Record<string, unknown> | null;
        const val = cf?.[fd.code];
        return (
          <td key={fd.id} className="p-4 text-sm">
            {val != null && val !== "" ? String(val) : <span className="text-muted-foreground">-</span>}
          </td>
        );
      })}
      <td className="p-4 text-right">
        <Button variant="ghost" size="sm" onClick={() => actions.handleEdit(order)} disabled={state.deletingId === order.id}>
          Editar
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={state.deletingId === order.id}>
              {state.deletingId === order.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar pedido?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción eliminará el pedido <strong>{order.trackingId}</strong>. Esta acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => actions.handleDelete(order.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </td>
    </tr>
  );
}

function OrdersPagination() {
  const { state, actions } = useOrders();

  return (
    <div className="flex items-center justify-center gap-2 pt-4">
      <Button
        variant="outline"
        size="sm"
        onClick={() => actions.setCurrentPage(Math.max(1, state.currentPage - 1))}
        disabled={state.currentPage === 1}
      >
        <ChevronLeft className="w-4 h-4 mr-1" />
        Anterior
      </Button>

      <div className="flex items-center gap-1">
        {Array.from({ length: Math.min(5, state.totalPages) }, (_, i) => {
          let pageNum: number;
          if (state.totalPages <= 5) {
            pageNum = i + 1;
          } else if (state.currentPage <= 3) {
            pageNum = i + 1;
          } else if (state.currentPage >= state.totalPages - 2) {
            pageNum = state.totalPages - 4 + i;
          } else {
            pageNum = state.currentPage - 2 + i;
          }
          return (
            <Button
              key={pageNum}
              variant={state.currentPage === pageNum ? "default" : "outline"}
              size="sm"
              className="w-10"
              onClick={() => actions.setCurrentPage(pageNum)}
            >
              {pageNum}
            </Button>
          );
        })}
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => actions.setCurrentPage(Math.min(state.totalPages, state.currentPage + 1))}
        disabled={state.currentPage === state.totalPages}
      >
        Siguiente
        <ChevronRight className="w-4 h-4 ml-1" />
      </Button>
    </div>
  );
}
