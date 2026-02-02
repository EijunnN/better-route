"use client";

import { ProtectedPage } from "@/components/auth/protected-page";
import { OrdersProvider, OrdersListView } from "@/components/orders";

export default function OrdersPage() {
  return (
    <ProtectedPage requiredPermission="order:read">
      <OrdersProvider>
        <OrdersListView />
      </OrdersProvider>
    </ProtectedPage>
  );
}
