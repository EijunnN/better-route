"use client";

import { List, Map } from "lucide-react";
import { useEffect, useState } from "react";
import { OrderForm, type OrderFormData } from "@/components/orders/order-form";
import { OrderMap } from "@/components/orders/order-map";
import { Button } from "@/components/ui/button";
import type {
  ORDER_STATUS,
  TIME_WINDOW_STRICTNESS,
} from "@/lib/validations/order";

const DEMO_COMPANY_ID = "demo-company-id";

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

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "map">("list");

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.append("status", filterStatus);
      if (searchQuery) params.append("search", searchQuery);

      const response = await fetch(`/api/orders?${params}`, {
        headers: { "x-company-id": DEMO_COMPANY_ID },
      });
      const result = await response.json();
      setOrders(result.data || []);
    } catch (error) {
      console.error("Failed to fetch orders:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [filterStatus, searchQuery]);

  const handleCreate = async (data: OrderFormData) => {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-company-id": DEMO_COMPANY_ID,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to create order");
    }

    await fetchOrders();
    setShowForm(false);
  };

  const handleUpdate = async (data: OrderFormData) => {
    if (!editingOrder) return;

    const response = await fetch(`/api/orders/${editingOrder.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-company-id": DEMO_COMPANY_ID,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to update order");
    }

    await fetchOrders();
    setEditingOrder(null);
    setShowForm(false);
  };

  const handleEdit = (order: Order) => {
    setEditingOrder(order);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this order?")) return;

    const response = await fetch(`/api/orders/${id}`, {
      method: "DELETE",
      headers: { "x-company-id": DEMO_COMPANY_ID },
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || "Failed to delete order");
      return;
    }

    await fetchOrders();
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Orders</h1>
          <p className="text-muted-foreground mt-1">
            Manage delivery orders with time window constraints
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>Create Order</Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search by tracking ID or customer name..."
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
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="ASSIGNED">Assigned</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="COMPLETED">Completed</option>
          <option value="FAILED">Failed</option>
          <option value="CANCELLED">Cancelled</option>
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
            <Map className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12">Loading...</div>
      ) : filteredOrders.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/30">
          <p className="text-muted-foreground">No orders found.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Create your first order to get started.
          </p>
        </div>
      ) : viewMode === "map" ? (
        <OrderMap
          companyId={DEMO_COMPANY_ID}
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
                <th className="text-left p-4 font-medium">Customer</th>
                <th className="text-left p-4 font-medium">Address</th>
                <th className="text-left p-4 font-medium">Time Window</th>
                <th className="text-left p-4 font-medium">Strictness</th>
                <th className="text-left p-4 font-medium">Status</th>
                <th className="text-right p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.id} className="border-t">
                  <td className="p-4 font-medium">{order.trackingId}</td>
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
                  <td className="p-4 max-w-xs truncate">{order.address}</td>
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
                      <span className="text-muted-foreground">No preset</span>
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
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(order.id)}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <OrderForm
          onSubmit={editingOrder ? handleUpdate : handleCreate}
          initialData={editingOrder || undefined}
          submitLabel={editingOrder ? "Update Order" : "Create Order"}
          onCancel={handleCloseForm}
        />
      )}
    </div>
  );
}
