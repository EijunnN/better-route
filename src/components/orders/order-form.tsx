"use client";

import {
  OrderFormProvider,
  useOrderForm,
  type Order,
  type OrderFormData,
} from "./order-form-context";
import {
  OrderFormActions,
  OrderFormBasicInfo,
  OrderFormCapacity,
  OrderFormLocation,
  OrderFormNotes,
  OrderFormTimeWindow,
} from "./order-form-sections";

// Re-export types for convenience
export type { Order, OrderFormData };

interface OrderFormProps {
  onSubmit: (data: OrderFormData) => Promise<void>;
  initialData?: Order;
  submitLabel?: string;
  onCancel?: () => void;
}

function OrderFormContent() {
  const { actions, derived } = useOrderForm();
  const { handleSubmit } = actions;
  const { isEditing } = derived;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto py-8">
      <div className="bg-background rounded-lg shadow-lg max-w-2xl w-full p-6 my-auto">
        <h2 className="text-xl font-semibold mb-4">
          {isEditing ? "Editar Pedido" : "Crear Pedido"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <OrderFormBasicInfo />
          <OrderFormLocation />
          <OrderFormTimeWindow />
          <OrderFormCapacity />
          <OrderFormNotes />
          <OrderFormActions />
        </form>
      </div>
    </div>
  );
}

/**
 * OrderForm - Compound Component Pattern
 *
 * Can be used in two ways:
 *
 * 1. Simple usage (default layout with modal):
 * ```tsx
 * <OrderForm onSubmit={handleSubmit} />
 * ```
 *
 * 2. Compound usage (custom layout):
 * ```tsx
 * <OrderForm.Provider onSubmit={handleSubmit}>
 *   <OrderForm.BasicInfo />
 *   <OrderForm.Location />
 *   <OrderForm.TimeWindow />
 *   <OrderForm.Capacity />
 *   <OrderForm.Notes />
 *   <OrderForm.Actions />
 * </OrderForm.Provider>
 * ```
 */
export function OrderForm({
  onSubmit,
  initialData,
  submitLabel = "Crear Pedido",
  onCancel,
}: OrderFormProps) {
  return (
    <OrderFormProvider
      onSubmit={onSubmit}
      initialData={initialData}
      submitLabel={submitLabel}
      onCancel={onCancel}
    >
      <OrderFormContent />
    </OrderFormProvider>
  );
}

// Compound component exports
OrderForm.Provider = OrderFormProvider;
OrderForm.BasicInfo = OrderFormBasicInfo;
OrderForm.Location = OrderFormLocation;
OrderForm.TimeWindow = OrderFormTimeWindow;
OrderForm.Capacity = OrderFormCapacity;
OrderForm.Notes = OrderFormNotes;
OrderForm.Actions = OrderFormActions;

// Hook export for custom implementations
export { useOrderForm } from "./order-form-context";
