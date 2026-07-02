/**
 * Schemas Zod de los responses del seam móvil, derivados de
 * docs/API-CONTRACT-MOBILE.md (§2–§4, §9) y del código real de cada
 * handler. Un fixture de src/tests/contract/fixtures/ que deja de
 * validar = drift de shape ⇒ revisar el contrato y bumpear
 * CONTRACT_VERSION (§10).
 *
 * Los objetos son deliberadamente no-strict: campos ADITIVOS no rompen
 * (§9 los tolera); lo que sí rompe es que un campo congelado falte o
 * cambie de tipo.
 */
import { z } from "zod";

const isoDateTime = z.iso.datetime();
const nullableIso = isoDateTime.nullable();
const uuid = z.uuid();

const stopStatus = z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED"]);

// ---------------------------------------------------------------------------
// §2 Auth
// ---------------------------------------------------------------------------

export const loginResponseSchema = z.object({
  user: z.object({
    id: uuid,
    companyId: uuid,
    email: z.string(),
    name: z.string(),
    role: z.string(),
  }),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresIn: z.number().int(),
});

export const refreshResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresIn: z.number().int(),
});

export const logoutResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
});

export const meResponseSchema = z.object({
  id: uuid,
  companyId: uuid,
  email: z.string(),
  name: z.string(),
  role: z.string(),
  active: z.boolean(),
  createdAt: isoDateTime,
  permissions: z.array(z.string().regex(/^[a-z_]+:[a-z_]+$/)),
});

// ---------------------------------------------------------------------------
// §3.5 my-route
// ---------------------------------------------------------------------------

const myRouteStopSchema = z.object({
  id: uuid,
  jobId: uuid,
  sequence: z.number().int(),
  attemptNumber: z.number().int(),
  priorVisitsCount: z.number().int(),
  isRevisit: z.boolean(),
  status: stopStatus,
  address: z.string(),
  latitude: z.string(),
  longitude: z.string(),
  estimatedArrival: nullableIso,
  liveEtaAt: nullableIso,
  estimatedServiceTime: z.number().int().nullable(),
  timeWindow: z.object({ start: nullableIso, end: nullableIso }),
  startedAt: nullableIso,
  completedAt: nullableIso,
  notes: z.string().nullable(),
  failureReason: z.string().nullable(),
  evidenceUrls: z.array(z.string()).nullable(),
  order: z
    .object({
      id: uuid,
      trackingId: z.string(),
      customerName: z.string().nullable(),
      customerPhone: z.string().nullable(),
      customerEmail: z.string().nullable(),
      notes: z.string().nullable(),
      weight: z.number().nullable(),
      volume: z.number().nullable(),
      value: z.number().nullable(),
      units: z.number().nullable(),
      customFields: z.record(z.string(), z.unknown()).nullable(),
    })
    .nullable(),
});

const vehicleSchema = z
  .object({
    id: uuid,
    name: z.string().nullable(),
    plate: z.string().nullable(),
    brand: z.string().nullable(),
    model: z.string().nullable(),
    maxOrders: z.number().int().nullable(),
    origin: z.object({
      address: z.string().nullable(),
      latitude: z.string().nullable(),
      longitude: z.string().nullable(),
    }),
  })
  .nullable();

export const myRouteResponseSchema = z.object({
  data: z.object({
    driver: z.object({
      id: uuid,
      name: z.string(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
      photo: z.string().nullable(),
      identification: z.string().nullable(),
      status: z.string(),
      license: z.object({
        number: z.string().nullable(),
        expiry: nullableIso,
        categories: z.string().nullable(),
      }),
    }),
    vehicle: vehicleSchema,
    route: z
      .object({
        id: z.string(),
        jobId: uuid,
        jobIds: z.array(uuid),
        // Congelado como ISO parseable: Dart usa DateTime.parse (no tryParse).
        jobCreatedAt: isoDateTime,
        geometry: z.string().nullable(),
        stops: z.array(myRouteStopSchema),
      })
      .nullable(),
    // Ints (§3.5): un double en un campo int crashea el cast Dart.
    metrics: z
      .object({
        totalStops: z.number().int(),
        completedStops: z.number().int(),
        pendingStops: z.number().int(),
        inProgressStops: z.number().int(),
        failedStops: z.number().int(),
        progressPercentage: z.number().int(),
        totalDistance: z.number().int(),
        totalDuration: z.number().int(),
        totalWeight: z.number().int(),
        totalVolume: z.number().int(),
        totalValue: z.number().int(),
        totalUnits: z.number().int(),
      })
      .nullable(),
    message: z.string().optional(),
  }),
});

// ---------------------------------------------------------------------------
// §3.6 / §4 col-2 — fila routeStops cruda ($inferSelect serializada)
// ---------------------------------------------------------------------------

export const routeStopRowSchema = z.object({
  id: uuid,
  companyId: uuid,
  jobId: uuid,
  routeId: z.string(),
  userId: uuid,
  vehicleId: uuid,
  orderId: uuid,
  sequence: z.number().int(),
  attemptNumber: z.number().int(),
  address: z.string(),
  latitude: z.string(),
  longitude: z.string(),
  estimatedArrival: nullableIso,
  estimatedServiceTime: z.number().int().nullable(),
  predictedEtaAt: nullableIso,
  etaComputedAt: nullableIso,
  timeWindowStart: nullableIso,
  timeWindowEnd: nullableIso,
  scheduledDate: z.iso.date().nullable(),
  status: stopStatus,
  startedAt: nullableIso,
  completedAt: nullableIso,
  notes: z.string().nullable(),
  failureReason: z.string().nullable(),
  evidenceUrls: z.array(z.string()).nullable(),
  zoneId: uuid.nullable(),
  metadata: z.unknown().nullable(),
  customFields: z.record(z.string(), z.unknown()).nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const routeStopPatchResponseSchema = z.object({
  data: routeStopRowSchema,
});

export const routeStopReopenResponseSchema = z.object({
  data: routeStopRowSchema,
});

const historyRowSchema = z.object({
  id: uuid,
  companyId: uuid,
  routeStopId: uuid,
  previousStatus: stopStatus.nullable(),
  newStatus: stopStatus,
  userId: uuid.nullable(),
  notes: z.string().nullable(),
  metadata: z.unknown().nullable(),
  createdAt: isoDateTime,
});

export const routeStopHistoryResponseSchema = z.object({
  data: z.array(
    historyRowSchema.extend({
      user: z
        .object({ id: uuid, name: z.string(), email: z.string() })
        .nullable(),
    }),
  ),
  total: z.number().int(),
});

export const routeStopGetResponseSchema = z.object({
  data: routeStopRowSchema.extend({
    user: z
      .object({
        id: uuid,
        name: z.string(),
        email: z.string(),
        role: z.string(),
        phone: z.string().nullable(),
      })
      .nullable(),
    vehicle: z
      .object({
        id: uuid,
        name: z.string().nullable(),
        plate: z.string().nullable(),
        status: z.string().nullable(),
      })
      .nullable(),
    order: z
      .object({
        id: uuid,
        trackingId: z.string(),
        customerName: z.string().nullable(),
        address: z.string().nullable(),
        latitude: z.string().nullable(),
        longitude: z.string().nullable(),
        status: z.string(),
      })
      .nullable(),
    job: z
      .object({
        id: uuid,
        companyId: uuid,
        configurationId: uuid,
        status: z.string(),
        progress: z.number().int(),
        result: z.unknown().nullable(),
        error: z.string().nullable(),
        startedAt: nullableIso,
        completedAt: nullableIso,
        cancelledAt: nullableIso,
        timeoutMs: z.number().int(),
        inputHash: z.string().nullable(),
        createdAt: isoDateTime,
        updatedAt: isoDateTime,
      })
      .nullable(),
    history: z.array(
      historyRowSchema.extend({
        user: z
          .object({
            id: uuid,
            name: z.string(),
            email: z.string(),
            role: z.string(),
            phone: z.string().nullable(),
          })
          .nullable(),
      }),
    ),
  }),
});

// ---------------------------------------------------------------------------
// §3.7 location
// ---------------------------------------------------------------------------

export const locationPostResponseSchema = z.object({
  success: z.literal(true),
  locationId: uuid,
  savedAt: isoDateTime,
});

export const locationGetResponseSchema = z.object({
  location: z
    .object({
      id: uuid,
      latitude: z.number(),
      longitude: z.number(),
      accuracy: z.number().int().nullable(),
      altitude: z.number().int().nullable(),
      speed: z.number().int().nullable(),
      heading: z.number().int().nullable(),
      source: z.enum(["GPS", "MANUAL", "GEOFENCE", "NETWORK"]),
      batteryLevel: z.number().int().nullable(),
      isMoving: z.boolean().nullable(),
      recordedAt: isoDateTime,
      savedAt: isoDateTime,
    })
    .nullable(),
  message: z.string().optional(),
});

// ---------------------------------------------------------------------------
// §3.8 delivery-policy
// ---------------------------------------------------------------------------

export const deliveryPolicyResponseSchema = z.object({
  data: z.object({
    // Nunca null: el GET lazy-inserta la fila si falta (§3.8).
    policy: z.object({
      companyId: uuid,
      labelPending: z.string(),
      labelInProgress: z.string(),
      labelCompleted: z.string(),
      labelFailed: z.string(),
      colorPending: z.string(),
      colorInProgress: z.string(),
      colorCompleted: z.string(),
      colorFailed: z.string(),
      completedRequiresPhoto: z.boolean(),
      completedRequiresSignature: z.boolean(),
      completedRequiresNotes: z.boolean(),
      failedRequiresPhoto: z.boolean(),
      failedRequiresNotes: z.boolean(),
      failureReasons: z.array(z.string()),
      createdAt: isoDateTime,
      updatedAt: isoDateTime,
    }),
    stateMachine: z.object({
      states: z.array(stopStatus),
      transitions: z.record(z.string(), z.array(stopStatus)),
    }),
    // FIX-9 (aditivo): catálogo canónico de quick replies (§7).
    quickReplies: z.array(z.object({ code: z.string(), label: z.string() })),
  }),
});

// ---------------------------------------------------------------------------
// §3.9 field-definitions
// ---------------------------------------------------------------------------

export const fieldDefinitionsResponseSchema = z.object({
  data: z.array(
    z.object({
      id: uuid,
      companyId: uuid,
      entity: z.enum(["orders", "route_stops"]),
      code: z.string(),
      label: z.string(),
      fieldType: z.enum([
        "text",
        "number",
        "select",
        "date",
        "currency",
        "phone",
        "email",
        "boolean",
      ]),
      required: z.boolean(),
      placeholder: z.string().nullable(),
      options: z.unknown().nullable(),
      defaultValue: z.string().nullable(),
      position: z.number().int(),
      showInList: z.boolean(),
      showInMobile: z.boolean(),
      showInCsv: z.boolean(),
      validationRules: z.unknown().nullable(),
      active: z.boolean(),
      createdAt: isoDateTime,
      updatedAt: isoDateTime,
    }),
  ),
});

// ---------------------------------------------------------------------------
// §3.9 my-orders (sin consumidor móvil hoy, shape congelado igual)
// ---------------------------------------------------------------------------

export const myOrdersResponseSchema = z.object({
  data: z.object({
    orders: z.array(
      z.object({
        id: uuid,
        trackingId: z.string(),
        status: z.string(),
        customer: z.object({
          name: z.string().nullable(),
          phone: z.string().nullable(),
          email: z.string().nullable(),
        }),
        address: z.string().nullable(),
        latitude: z.string().nullable(),
        longitude: z.string().nullable(),
        capacity: z.object({
          weight: z.number().nullable(),
          volume: z.number().nullable(),
          value: z.number().nullable(),
          units: z.number().nullable(),
        }),
        // Tercer formato de time window (§4): HH:MM[:SS] crudos de la Order.
        timeWindow: z.object({
          presetName: z.string().nullable(),
          start: z.string().nullable(),
          end: z.string().nullable(),
          strictness: z.string(),
        }),
        orderType: z.string().nullable(),
        priority: z.number().int().nullable(),
        promisedDate: nullableIso,
        requiredSkills: z.array(z.string()),
        notes: z.string().nullable(),
        customFields: z.record(z.string(), z.unknown()).nullable(),
        priorVisitsCount: z.number().int(),
        isRevisit: z.boolean(),
        attemptNumber: z.number().int(),
        stop: z
          .object({
            status: stopStatus,
            sequence: z.number().int(),
            attemptNumber: z.number().int(),
            priorVisitsCount: z.number().int(),
            isRevisit: z.boolean(),
            routeId: z.string(),
            estimatedArrival: nullableIso,
            timeWindowStart: nullableIso,
            timeWindowEnd: nullableIso,
          })
          .nullable(),
        createdAt: isoDateTime,
        updatedAt: isoDateTime,
      }),
    ),
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
    summary: z.object({
      pending: z.number().int(),
      assigned: z.number().int(),
      inProgress: z.number().int(),
      completed: z.number().int(),
      failed: z.number().int(),
      cancelled: z.number().int(),
    }),
  }),
});

// ---------------------------------------------------------------------------
// §3.10 presigned-url — los 6 campos son REQ (casts no-nullables en Dart)
// ---------------------------------------------------------------------------

export const presignedUrlResponseSchema = z.object({
  uploadUrl: z.url(),
  publicUrl: z.url(),
  key: z.string().min(1),
  expiresIn: z.number().int(),
  maxFileSize: z.number().int(),
  contentType: z.string(),
});

// ---------------------------------------------------------------------------
// §3.11 chat
// ---------------------------------------------------------------------------

const chatMessageRowSchema = z.object({
  id: uuid,
  companyId: uuid,
  driverId: uuid,
  senderId: uuid,
  direction: z.enum(["TO_DRIVER", "TO_DISPATCH"]),
  kind: z.enum(["TEXT", "TEMPLATE", "BROADCAST"]),
  body: z.string(),
  templateCode: z.string().nullable(),
  readAt: nullableIso,
  createdAt: isoDateTime,
});

export const chatMessagesGetResponseSchema = z.object({
  data: z.array(chatMessageRowSchema),
});

export const chatMessagePostResponseSchema = z.object({
  data: chatMessageRowSchema,
});

export const chatReadResponseSchema = z.object({ ok: z.literal(true) });

export const chatBroadcastResponseSchema = z.object({
  ok: z.literal(true),
  reached: z.number().int(),
});

// ---------------------------------------------------------------------------
// §3.12 realtime
// ---------------------------------------------------------------------------

export const realtimeTokenResponseSchema = z.object({
  token: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Registro fixture-name → schema. La clave es el nombre del archivo en
// fixtures/ (sin .json); el test de fixtures exige biyección exacta.
// ---------------------------------------------------------------------------

export const CONTRACT_SCHEMAS = {
  "auth-login": loginResponseSchema,
  "auth-refresh": refreshResponseSchema,
  "auth-logout": logoutResponseSchema,
  "auth-me": meResponseSchema,
  "my-route": myRouteResponseSchema,
  "my-orders": myOrdersResponseSchema,
  "route-stop-patch": routeStopPatchResponseSchema,
  "route-stop-reopen": routeStopReopenResponseSchema,
  "route-stop-get": routeStopGetResponseSchema,
  "route-stop-history": routeStopHistoryResponseSchema,
  "driver-location-post": locationPostResponseSchema,
  "driver-location-get": locationGetResponseSchema,
  "delivery-policy": deliveryPolicyResponseSchema,
  "field-definitions": fieldDefinitionsResponseSchema,
  "presigned-url": presignedUrlResponseSchema,
  "chat-messages-get": chatMessagesGetResponseSchema,
  "chat-messages-post": chatMessagePostResponseSchema,
  "chat-read": chatReadResponseSchema,
  "chat-broadcast": chatBroadcastResponseSchema,
  "realtime-token": realtimeTokenResponseSchema,
  "realtime-subscription-token": realtimeTokenResponseSchema,
} as const satisfies Record<string, z.ZodType>;

export type ContractFixtureName = keyof typeof CONTRACT_SCHEMAS;
