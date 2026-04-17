import { z } from "zod";
import { mapCSVRow } from "@/lib/orders/csv-column-mapping";
import { orderSchema } from "@/lib/validations/order";
import { createValidationError } from "./errors";
import { mapCSVRowToOrder } from "./mapping";
import {
  type CSVRow,
  type CSVValidationError,
  ERROR_TYPES,
} from "./types";

/**
 * Validate order data from CSV row with enhanced error categorization
 */
export function validateOrderRow(
  row: CSVRow,
  rowIndex: number,
  existingTrackingIds: Set<string>,
  mapping: Record<string, string> = {},
): CSVValidationError[] {
  const errors: CSVValidationError[] = [];
  // Use the provided mapping or fall back to default
  const orderData =
    Object.keys(mapping).length > 0
      ? mapCSVRow(row, mapping)
      : mapCSVRowToOrder(row);

  try {
    // Check for missing required fields first (highest priority errors)
    if (!orderData.trackingId) {
      errors.push(
        createValidationError(
          rowIndex,
          "trackingId",
          "Tracking ID is required",
          "critical",
          ERROR_TYPES.REQUIRED_FIELD,
        ),
      );
    }

    if (!orderData.address) {
      errors.push(
        createValidationError(
          rowIndex,
          "address",
          "Address is required",
          "critical",
          ERROR_TYPES.REQUIRED_FIELD,
        ),
      );
    }

    if (!orderData.latitude) {
      errors.push(
        createValidationError(
          rowIndex,
          "latitude",
          "Latitude is required",
          "critical",
          ERROR_TYPES.REQUIRED_FIELD,
        ),
      );
    }

    if (!orderData.longitude) {
      errors.push(
        createValidationError(
          rowIndex,
          "longitude",
          "Longitude is required",
          "critical",
          ERROR_TYPES.REQUIRED_FIELD,
        ),
      );
    }

    // Parse and validate with Zod schema for format validation
    try {
      orderSchema.parse(orderData);
    } catch (zodError) {
      if (zodError instanceof z.ZodError) {
        zodError.issues.forEach((err) => {
          const field = err.path.join(".") as string;
          // Determine error type based on field
          let errorType: string = ERROR_TYPES.VALIDATION;
          if (field === "customerEmail") errorType = ERROR_TYPES.FORMAT;
          if (field === "latitude" || field === "longitude")
            errorType = ERROR_TYPES.RANGE;

          errors.push(
            createValidationError(
              rowIndex,
              field,
              err.message,
              "critical",
              errorType,
              field === "latitude"
                ? orderData.latitude
                : field === "longitude"
                  ? orderData.longitude
                  : undefined,
            ),
          );
        });
      }
    }

    // Only continue validation if required fields are present
    if (
      orderData.trackingId &&
      orderData.address &&
      orderData.latitude &&
      orderData.longitude
    ) {
      // Check for duplicate tracking IDs (within CSV)
      if (existingTrackingIds.has(orderData.trackingId)) {
        errors.push(
          createValidationError(
            rowIndex,
            "trackingId",
            `Duplicate tracking ID within CSV: ${orderData.trackingId}`,
            "critical",
            ERROR_TYPES.DUPLICATE,
            orderData.trackingId,
          ),
        );
      } else {
        existingTrackingIds.add(orderData.trackingId);
      }

      // Validate coordinate ranges (explicit checks for clarity)
      const lat = parseFloat(orderData.latitude);
      const lng = parseFloat(orderData.longitude);

      if (Number.isNaN(lat) || lat < -90 || lat > 90) {
        errors.push(
          createValidationError(
            rowIndex,
            "latitude",
            "Latitude must be between -90 and 90",
            "critical",
            ERROR_TYPES.RANGE,
            orderData.latitude,
          ),
        );
      }

      if (Number.isNaN(lng) || lng < -180 || lng > 180) {
        errors.push(
          createValidationError(
            rowIndex,
            "longitude",
            "Longitude must be between -180 and 180",
            "critical",
            ERROR_TYPES.RANGE,
            orderData.longitude,
          ),
        );
      }

      // Validate coordinates are not (0, 0) - treat as warning (can be overridden)
      if (orderData.latitude === "0" && orderData.longitude === "0") {
        errors.push(
          createValidationError(
            rowIndex,
            "latitude",
            "Coordinates (0, 0) are likely invalid. Please verify the address.",
            "warning",
            ERROR_TYPES.RANGE,
            "0, 0",
          ),
        );
      }

      // Validate email format if provided
      if (orderData.customerEmail && orderData.customerEmail !== "") {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(orderData.customerEmail)) {
          errors.push(
            createValidationError(
              rowIndex,
              "customerEmail",
              "Invalid email format",
              "warning",
              ERROR_TYPES.FORMAT,
              orderData.customerEmail,
            ),
          );
        }
      }

      // Validate numeric fields
      if (orderData.weightRequired) {
        const weight = parseFloat(orderData.weightRequired);
        if (Number.isNaN(weight) || weight <= 0) {
          errors.push(
            createValidationError(
              rowIndex,
              "weightRequired",
              "Weight must be a positive number",
              "critical",
              ERROR_TYPES.RANGE,
              orderData.weightRequired,
            ),
          );
        }
      }

      if (orderData.volumeRequired) {
        const volume = parseFloat(orderData.volumeRequired);
        if (Number.isNaN(volume) || volume <= 0) {
          errors.push(
            createValidationError(
              rowIndex,
              "volumeRequired",
              "Volume must be a positive number",
              "critical",
              ERROR_TYPES.RANGE,
              orderData.volumeRequired,
            ),
          );
        }
      }

      // Validate strictness if provided
      if (
        orderData.strictness &&
        orderData.strictness !== "HARD" &&
        orderData.strictness !== "SOFT"
      ) {
        errors.push(
          createValidationError(
            rowIndex,
            "strictness",
            "Strictness must be HARD or SOFT",
            "critical",
            ERROR_TYPES.FORMAT,
            orderData.strictness,
          ),
        );
      }
    }
  } catch (error) {
    errors.push(
      createValidationError(
        rowIndex,
        "general",
        error instanceof Error ? error.message : "Unknown validation error",
        "critical",
        ERROR_TYPES.VALIDATION,
      ),
    );
  }

  return errors;
}
