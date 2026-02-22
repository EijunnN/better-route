"use client";

import { createContext, use, useCallback, useEffect, useState, type ReactNode } from "react";
import { useCompanyContext } from "@/hooks/use-company-context";
import { useToast } from "@/hooks/use-toast";
import type { OrderFormData } from "./order-form";
import type { ORDER_STATUS, TIME_WINDOW_STRICTNESS } from "@/lib/validations/order";

const PAGE_SIZE = 20;

export interface Order {
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
  orderValue: number | null;
  unitsRequired: number | null;
  orderType: string | null;
  priority: number | null;
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
  customFields: Record<string, unknown> | null;
}

export interface OrdersState {
  orders: Order[];
  filteredOrders: Order[];
  totalOrders: number;
  totalPages: number;
  currentPage: number;
  isLoading: boolean;
  showForm: boolean;
  editingOrder: Order | null;
  filterStatus: string;
  searchQuery: string;
  viewMode: "list" | "map";
  isDeleting: boolean;
  deletingId: string | null;
  trackingLink: { trackingId: string; url: string } | null;
  isGeneratingLink: boolean;
}

export interface OrdersActions {
  handleCreate: (data: OrderFormData) => Promise<void>;
  handleUpdate: (data: OrderFormData) => Promise<void>;
  handleEdit: (order: Order) => void;
  handleDelete: (id: string) => Promise<void>;
  handleDeleteAll: () => Promise<void>;
  handleCloseForm: () => void;
  setShowForm: (show: boolean) => void;
  setFilterStatus: (status: string) => void;
  setSearchQuery: (query: string) => void;
  setViewMode: (mode: "list" | "map") => void;
  setCurrentPage: (page: number) => void;
  getStatusColor: (status: string) => string;
  getStrictnessColor: (strictness: string) => string;
  handleGenerateTrackingLink: (orderId: string) => Promise<void>;
  clearTrackingLink: () => void;
}

export interface OrdersMeta {
  companyId: string | null;
  isReady: boolean;
  isSystemAdmin: boolean;
  companies: Array<{ id: string; commercialName: string }>;
  selectedCompanyId: string | null;
  setSelectedCompanyId: (id: string | null) => void;
  authCompanyId: string | null;
}

interface OrdersContextValue {
  state: OrdersState;
  actions: OrdersActions;
  meta: OrdersMeta;
}

const OrdersContext = createContext<OrdersContextValue | undefined>(undefined);

export function OrdersProvider({ children }: { children: ReactNode }) {
  const { effectiveCompanyId: companyId, isReady, isSystemAdmin, companies, selectedCompanyId, setSelectedCompanyId, authCompanyId } =
    useCompanyContext();
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
  const [currentPage, setCurrentPage] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const [trackingLink, setTrackingLink] = useState<{ trackingId: string; url: string } | null>(null);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);

  const fetchOrders = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.append("status", filterStatus);
      if (searchQuery) params.append("search", searchQuery);
      params.append("limit", String(PAGE_SIZE));
      params.append("offset", String((currentPage - 1) * PAGE_SIZE));

      const response = await fetch(`/api/orders?${params}`, { headers: { "x-company-id": companyId } });
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

  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus, searchQuery]);

  const handleCreate = useCallback(
    async (data: OrderFormData) => {
      if (!companyId) return;
      try {
        const response = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-company-id": companyId },
          body: JSON.stringify(data),
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Error al crear pedido");
        }
        await fetchOrders();
        setShowForm(false);
        toast({ title: "Pedido creado", description: `El pedido "${data.trackingId}" ha sido creado exitosamente.` });
      } catch (err) {
        toast({
          title: "Error al crear pedido",
          description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
          variant: "destructive",
        });
        throw err;
      }
    },
    [companyId, fetchOrders, toast]
  );

  const handleUpdate = useCallback(
    async (data: OrderFormData) => {
      if (!editingOrder || !companyId) return;
      try {
        const response = await fetch(`/api/orders/${editingOrder.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-company-id": companyId },
          body: JSON.stringify(data),
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Error al actualizar pedido");
        }
        await fetchOrders();
        setEditingOrder(null);
        setShowForm(false);
        toast({ title: "Pedido actualizado", description: `El pedido "${data.trackingId}" ha sido actualizado exitosamente.` });
      } catch (err) {
        toast({
          title: "Error al actualizar pedido",
          description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
          variant: "destructive",
        });
        throw err;
      }
    },
    [editingOrder, companyId, fetchOrders, toast]
  );

  const handleEdit = useCallback((order: Order) => {
    setEditingOrder(order);
    setShowForm(true);
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!companyId) return;
      setDeletingId(id);
      const order = orders.find((o) => o.id === id);
      try {
        const response = await fetch(`/api/orders/${id}`, {
          method: "DELETE",
          headers: { "x-company-id": companyId },
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Error al eliminar pedido");
        }
        await fetchOrders();
        toast({
          title: "Pedido eliminado",
          description: order ? `El pedido "${order.trackingId}" ha sido eliminado.` : "El pedido ha sido eliminado.",
        });
      } catch (err) {
        toast({
          title: "Error al eliminar pedido",
          description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
          variant: "destructive",
        });
      } finally {
        setDeletingId(null);
      }
    },
    [companyId, orders, fetchOrders, toast]
  );

  const handleDeleteAll = useCallback(async () => {
    if (!companyId) return;
    setIsDeleting(true);
    try {
      const response = await fetch("/api/orders/batch/delete?hard=true", {
        method: "DELETE",
        headers: { "x-company-id": companyId },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Error al eliminar pedidos");
      setCurrentPage(1);
      await fetchOrders();
      toast({ title: "Pedidos eliminados", description: `${result.deleted} pedidos han sido eliminados.` });
    } catch (err) {
      toast({
        title: "Error al eliminar pedidos",
        description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  }, [companyId, fetchOrders, toast]);

  const handleCloseForm = useCallback(() => {
    setShowForm(false);
    setEditingOrder(null);
  }, []);

  const handleGenerateTrackingLink = useCallback(
    async (orderId: string) => {
      if (!companyId) return;
      setIsGeneratingLink(true);
      try {
        const response = await fetch("/api/tracking/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-company-id": companyId },
          body: JSON.stringify({ orderIds: [orderId] }),
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Error al generar enlace");
        }
        const result = await response.json();
        if (result.data?.[0]) {
          const { trackingId, url } = result.data[0];
          const fullUrl = `${window.location.origin}${url}`;
          setTrackingLink({ trackingId, url: fullUrl });
        }
      } catch (err) {
        toast({
          title: "Error al generar enlace",
          description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
          variant: "destructive",
        });
      } finally {
        setIsGeneratingLink(false);
      }
    },
    [companyId, toast]
  );

  const clearTrackingLink = useCallback(() => {
    setTrackingLink(null);
  }, []);

  const getStatusColor = useCallback((status: string) => {
    const colors: Record<string, string> = {
      PENDING: "bg-gray-500/10 text-gray-600",
      ASSIGNED: "bg-blue-500/10 text-blue-600",
      IN_PROGRESS: "bg-yellow-500/10 text-yellow-600",
      COMPLETED: "bg-green-500/10 text-green-600",
      FAILED: "bg-red-500/10 text-red-600",
      CANCELLED: "bg-gray-500/10 text-gray-600",
    };
    return colors[status] || "bg-gray-500/10 text-gray-600";
  }, []);

  const getStrictnessColor = useCallback((strictness: string) => {
    return strictness === "HARD" ? "bg-destructive/10 text-destructive" : "bg-yellow-500/10 text-yellow-600";
  }, []);

  const filteredOrders = orders.filter((order) => order.active);
  const totalPages = Math.ceil(totalOrders / PAGE_SIZE);

  const state: OrdersState = {
    orders,
    filteredOrders,
    totalOrders,
    totalPages,
    currentPage,
    isLoading,
    showForm,
    editingOrder,
    filterStatus,
    searchQuery,
    viewMode,
    isDeleting,
    deletingId,
    trackingLink,
    isGeneratingLink,
  };

  const actions: OrdersActions = {
    handleCreate,
    handleUpdate,
    handleEdit,
    handleDelete,
    handleDeleteAll,
    handleCloseForm,
    setShowForm,
    setFilterStatus,
    setSearchQuery,
    setViewMode,
    setCurrentPage,
    getStatusColor,
    getStrictnessColor,
    handleGenerateTrackingLink,
    clearTrackingLink,
  };

  const meta: OrdersMeta = { companyId, isReady, isSystemAdmin, companies, selectedCompanyId, setSelectedCompanyId, authCompanyId };

  return <OrdersContext value={{ state, actions, meta }}>{children}</OrdersContext>;
}

export function useOrders(): OrdersContextValue {
  const context = use(OrdersContext);
  if (context === undefined) {
    throw new Error("useOrders must be used within an OrdersProvider");
  }
  return context;
}
