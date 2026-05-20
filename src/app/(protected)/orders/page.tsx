"use client";

import { ProtectedPage } from "@/components/auth/protected-page";
import { OrdersListView, OrdersProvider } from "@/components/orders";

export default function OrdersPage() {
  return (
    <ProtectedPage requiredPermission="order:read">
      <OrdersProvider>
        <OrdersListView />
      </OrdersProvider>
    </ProtectedPage>
  );
}
