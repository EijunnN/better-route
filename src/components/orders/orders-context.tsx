"use client";

import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useCompanyContext } from "@/hooks/use-company-context";
import type {
  ORDER_STATUS,
  TIME_WINDOW_STRICTNESS,
} from "@/lib/validations/order";
import type { OrderFormData } from "./order-form";

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
  timeWindowStart: string | null;
  timeWindowEnd: string | null;
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
  setCurrentPage: (page: number) => void;
  getStatusColor: (status: string) => string;
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
  const {
    effectiveCompanyId: companyId,
    isReady,
    isSystemAdmin,
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    authCompanyId,
  } = useCompanyContext();

  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const [trackingLink, setTrackingLink] = useState<{
    trackingId: string;
    url: string;
  } | null>(null);
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

      const response = await fetch(`/api/orders?${params}`, {
        headers: { "x-company-id": companyId },
      });
      const result = await response.json();
      setOrders(result.data || []);
      setTotalOrders(result.meta?.total || result.data?.length || 0);
    } catch (error) {
      console.error("Failed to fetch orders:", error);
    } finally {
      setIsLoading(false);
    }
  }, [companyId, filterStatus, searchQuery, currentPage]);
  const apiMutate = useApiMutation(fetchOrders);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleCreate = async (data: OrderFormData) => {
    await apiMutate("/api/orders", {
      body: data,
      errorTitle: "Error al crear pedido",
      success: {
        title: "Pedido creado",
        description: `El pedido "${data.trackingId}" ha sido creado exitosamente.`,
      },
    });
    setShowForm(false);
  };

  const handleUpdate = async (data: OrderFormData) => {
    if (!editingOrder) return;
    await apiMutate(`/api/orders/${editingOrder.id}`, {
      method: "PATCH",
      body: data,
      errorTitle: "Error al actualizar pedido",
      success: {
        title: "Pedido actualizado",
        description: `El pedido "${data.trackingId}" ha sido actualizado exitosamente.`,
      },
    });
    setEditingOrder(null);
    setShowForm(false);
  };

  const handleEdit = (order: Order) => {
    setEditingOrder(order);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    const order = orders.find((o) => o.id === id);
    setDeletingId(id);
    await apiMutate(`/api/orders/${id}`, {
      method: "DELETE",
      rethrow: false,
      errorTitle: "Error al eliminar pedido",
      success: {
        title: "Pedido eliminado",
        description: order
          ? `El pedido "${order.trackingId}" ha sido eliminado.`
          : "El pedido ha sido eliminado.",
      },
    });
    setDeletingId(null);
  };

  const handleDeleteAll = async () => {
    setIsDeleting(true);
    await apiMutate<{ deleted: number }>("/api/orders/batch/delete?hard=true", {
      method: "DELETE",
      rethrow: false,
      errorTitle: "Error al eliminar pedidos",
      revalidate: async () => {
        setCurrentPage(1);
        await fetchOrders();
      },
      success: (result) => ({
        title: "Pedidos eliminados",
        description: `${result?.deleted} pedidos han sido eliminados.`,
      }),
    });
    setIsDeleting(false);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingOrder(null);
  };

  const handleGenerateTrackingLink = async (orderId: string) => {
    setIsGeneratingLink(true);
    const result = await apiMutate<{
      data?: Array<{ trackingId: string; url: string }>;
    }>("/api/tracking/generate", {
      body: { orderIds: [orderId] },
      rethrow: false,
      revalidate: null,
      errorTitle: "Error al generar enlace",
    });
    const link = result?.data?.[0];
    if (link) {
      setTrackingLink({
        trackingId: link.trackingId,
        url: `${window.location.origin}${link.url}`,
      });
    }
    setIsGeneratingLink(false);
  };

  const clearTrackingLink = () => {
    setTrackingLink(null);
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

  // Server already filters active=true, no client-side filter needed
  const filteredOrders = orders;
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
    setCurrentPage,
    getStatusColor,
    handleGenerateTrackingLink,
    clearTrackingLink,
  };

  const meta: OrdersMeta = {
    companyId,
    isReady,
    isSystemAdmin,
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    authCompanyId,
  };

  return (
    <OrdersContext value={{ state, actions, meta }}>{children}</OrdersContext>
  );
}

export function useOrders(): OrdersContextValue {
  const context = use(OrdersContext);
  if (context === undefined) {
    throw new Error("useOrders must be used within an OrdersProvider");
  }
  return context;
}
