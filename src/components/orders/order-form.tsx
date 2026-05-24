"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  type Order,
  type OrderFormData,
  OrderFormProvider,
  useOrderForm,
} from "./order-form-context";
import {
  OrderFormActions,
  OrderFormBasicInfo,
  OrderFormCapacity,
  OrderFormCustomFields,
  OrderFormLocation,
  OrderFormNotes,
  OrderFormTimeWindow,
} from "./order-form-sections";

export type { Order, OrderFormData };

interface OrderFormProps {
  onSubmit: (data: OrderFormData) => Promise<void>;
  initialData?: Order;
  submitLabel?: string;
  onCancel?: () => void;
}

function OrderFormContent() {
  const { actions, derived, meta } = useOrderForm();
  const { handleSubmit } = actions;
  const { isEditing } = derived;
  const { onCancel } = meta;

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onCancel?.();
      }}
    >
      <SheetContent
        side="right"
        size="lg"
        className="flex flex-col p-0 gap-0"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle>
            {isEditing ? "Editar Pedido" : "Crear Pedido"}
          </SheetTitle>
        </SheetHeader>

        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto px-6 py-4 space-y-4"
        >
          <OrderFormBasicInfo />
          <OrderFormLocation />
          <OrderFormTimeWindow />
          <OrderFormCapacity />
          <OrderFormCustomFields />
          <OrderFormNotes />
          <OrderFormActions />
        </form>
      </SheetContent>
    </Sheet>
  );
}

/**
 * OrderForm - Compound Component Pattern
 *
 * Simple usage:
 * ```tsx
 * {showForm && <OrderForm onSubmit={...} onCancel={closeForm} />}
 * ```
 *
 * Compound usage (skip the Sheet wrapper, render sections directly):
 * ```tsx
 * <OrderForm.Provider onSubmit={handleSubmit}>
 *   <OrderForm.BasicInfo />
 *   <OrderForm.Location />
 *   ...
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

OrderForm.Provider = OrderFormProvider;
OrderForm.BasicInfo = OrderFormBasicInfo;
OrderForm.Location = OrderFormLocation;
OrderForm.TimeWindow = OrderFormTimeWindow;
OrderForm.Capacity = OrderFormCapacity;
OrderForm.CustomFields = OrderFormCustomFields;
OrderForm.Notes = OrderFormNotes;
OrderForm.Actions = OrderFormActions;

export { useOrderForm } from "./order-form-context";
