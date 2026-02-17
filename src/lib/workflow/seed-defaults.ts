import { db } from "@/db";
import {
  companyWorkflowStates,
  companyWorkflowTransitions,
} from "@/db/schema";

export async function seedDefaultWorkflowStates(companyId: string) {
  // Insert 5 default states
  const states = await db
    .insert(companyWorkflowStates)
    .values([
      {
        companyId,
        code: "PENDING",
        label: "Pendiente",
        systemState: "PENDING",
        color: "#6B7280",
        position: 0,
        isDefault: true,
        isTerminal: false,
      },
      {
        companyId,
        code: "IN_PROGRESS",
        label: "En progreso",
        systemState: "IN_PROGRESS",
        color: "#3B82F6",
        position: 1,
        isTerminal: false,
      },
      {
        companyId,
        code: "DELIVERED",
        label: "Entregado",
        systemState: "COMPLETED",
        color: "#16A34A",
        position: 2,
        isTerminal: true,
        requiresPhoto: true,
      },
      {
        companyId,
        code: "NOT_DELIVERED",
        label: "No entregado",
        systemState: "FAILED",
        color: "#DC4840",
        position: 3,
        isTerminal: true,
        requiresReason: true,
        reasonOptions: [
          "Cliente ausente",
          "Direccion incorrecta",
          "Paquete danado",
          "Cliente rechazo",
          "Zona insegura",
          "Reprogramado",
          "Otro",
        ],
      },
      {
        companyId,
        code: "SKIPPED",
        label: "Omitido",
        systemState: "CANCELLED",
        color: "#9CA3AF",
        position: 4,
        isTerminal: true,
      },
    ])
    .returning();

  // Create a map for easy lookup
  const stateMap = new Map(states.map((s) => [s.code, s.id]));

  // Insert default transitions
  const transitions = [
    {
      companyId,
      fromStateId: stateMap.get("PENDING")!,
      toStateId: stateMap.get("IN_PROGRESS")!,
    },
    {
      companyId,
      fromStateId: stateMap.get("PENDING")!,
      toStateId: stateMap.get("NOT_DELIVERED")!,
    },
    {
      companyId,
      fromStateId: stateMap.get("PENDING")!,
      toStateId: stateMap.get("SKIPPED")!,
    },
    {
      companyId,
      fromStateId: stateMap.get("IN_PROGRESS")!,
      toStateId: stateMap.get("DELIVERED")!,
    },
    {
      companyId,
      fromStateId: stateMap.get("IN_PROGRESS")!,
      toStateId: stateMap.get("NOT_DELIVERED")!,
    },
    {
      companyId,
      fromStateId: stateMap.get("IN_PROGRESS")!,
      toStateId: stateMap.get("SKIPPED")!,
    },
    {
      companyId,
      fromStateId: stateMap.get("IN_PROGRESS")!,
      toStateId: stateMap.get("PENDING")!,
    },
    {
      companyId,
      fromStateId: stateMap.get("NOT_DELIVERED")!,
      toStateId: stateMap.get("PENDING")!,
    },
    {
      companyId,
      fromStateId: stateMap.get("NOT_DELIVERED")!,
      toStateId: stateMap.get("SKIPPED")!,
    },
  ];

  await db.insert(companyWorkflowTransitions).values(transitions);

  return { states, transitionCount: transitions.length };
}
