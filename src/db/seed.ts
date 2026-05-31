import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  alertNotifications,
  alertRules,
  alerts,
  auditLogs,
  companies,
  companyDeliveryPolicy,
  companyFieldDefinitions,
  companyOptimizationProfiles,
  companyTrackingSettings,
  csvColumnMappingTemplates,
  driverLocations,
  fleets,
  optimizationConfigurations,
  optimizationJobs,
  optimizationPresets,
  orders,
  outputHistory,
  type PERMISSION_CATEGORIES,
  permissions,
  planMetrics,
  reassignmentsHistory,
  rolePermissions,
  roles,
  routeStopHistory,
  routeStops,
  timeWindowPresets,
  trackingTokens,
  userAvailability,
  userDriverStatusHistory,
  userRoles,
  userSecondaryFleets,
  userSkills,
  users,
  vehicleFleetHistory,
  vehicleFleets,
  vehicleSkillAssignments,
  vehicleSkills,
  vehicleStatusHistory,
  vehicles,
  zones,
  zoneVehicles,
} from "@/db/schema";
import { seedDefaultFieldDefinitions } from "@/lib/custom-fields/seed-defaults";
import { seedDefaultDeliveryPolicy } from "@/lib/workflow/seed-defaults";

async function seed() {
  console.log("🌱 Starting database seed...");

  const shouldReset = process.argv.includes("--reset");

  try {
    if (shouldReset) {
      console.log("🗑️  Resetting database...");
      // Delete in correct order to respect foreign keys
      await db.delete(alertNotifications);
      await db.delete(routeStopHistory);
      await db.delete(planMetrics);
      await db.delete(outputHistory);
      await db.delete(reassignmentsHistory);
      await db.delete(companyFieldDefinitions);
      await db.delete(companyDeliveryPolicy);
      await db.delete(routeStops);
      await db.delete(trackingTokens);
      await db.delete(alerts);
      await db.delete(alertRules);
      await db.delete(optimizationJobs);
      await db.delete(optimizationConfigurations);
      await db.delete(auditLogs);
      await db.delete(orders);
      await db.delete(userAvailability);
      await db.delete(userSecondaryFleets);
      await db.delete(userDriverStatusHistory);
      await db.delete(userSkills);
      await db.delete(vehicleStatusHistory);
      await db.delete(vehicleFleetHistory);
      await db.delete(vehicleSkillAssignments);
      await db.delete(vehicleSkills);
      await db.delete(zoneVehicles);
      await db.delete(vehicleFleets);
      await db.delete(driverLocations);
      await db.delete(vehicles);
      await db.delete(zones);
      await db.delete(fleets);
      await db.delete(timeWindowPresets);
      await db.delete(csvColumnMappingTemplates);
      await db.delete(userRoles);
      await db.delete(rolePermissions);
      await db.delete(roles);
      await db.delete(permissions);
      await db.delete(optimizationPresets);
      await db.delete(companyOptimizationProfiles);
      await db.delete(companyTrackingSettings);
      await db.delete(users);
      await db.delete(companies);
      console.log("✅ Database reset complete");
    }

    // Create admin user (ADMIN_SISTEMA without companyId - can manage all companies)
    const existingAdmin = await db
      .select()
      .from(users)
      .where(eq(users.email, "admin@planeamiento.com"))
      .limit(1);

    if (existingAdmin.length === 0) {
      const hashedPassword = await bcrypt.hash("admin123", 10);

      await db.insert(users).values({
        companyId: null,
        email: "admin@planeamiento.com",
        username: "admin",
        password: hashedPassword,
        name: "Administrador del Sistema",
        role: "ADMIN_SISTEMA",
        active: true,
      });

      console.log("✅ Created admin user: admin@planeamiento.com / admin123");
    } else {
      console.log("ℹ️  Admin user already exists");
    }

    // Create system permissions (global - required for RBAC to work)
    const existingPermissions = await db.select().from(permissions).limit(1);

    if (existingPermissions.length === 0) {
      const systemPermissions: Array<{
        entity: string;
        action: string;
        name: string;
        description: string;
        category: keyof typeof PERMISSION_CATEGORIES;
        displayOrder: number;
      }> = [
        // ORDERS
        {
          entity: "orders",
          action: "VIEW",
          name: "Ver pedidos",
          description: "Ver lista de pedidos y detalles",
          category: "ORDERS",
          displayOrder: 1,
        },
        {
          entity: "orders",
          action: "CREATE",
          name: "Crear pedidos",
          description: "Crear nuevos pedidos",
          category: "ORDERS",
          displayOrder: 2,
        },
        {
          entity: "orders",
          action: "EDIT",
          name: "Editar pedidos",
          description: "Modificar pedidos existentes",
          category: "ORDERS",
          displayOrder: 3,
        },
        {
          entity: "orders",
          action: "DELETE",
          name: "Eliminar pedidos",
          description: "Eliminar pedidos",
          category: "ORDERS",
          displayOrder: 4,
        },
        {
          entity: "orders",
          action: "IMPORT",
          name: "Importar pedidos",
          description: "Importar pedidos desde CSV",
          category: "ORDERS",
          displayOrder: 5,
        },
        {
          entity: "orders",
          action: "EXPORT",
          name: "Exportar pedidos",
          description: "Exportar pedidos a CSV",
          category: "ORDERS",
          displayOrder: 6,
        },
        // VEHICLES
        {
          entity: "vehicles",
          action: "VIEW",
          name: "Ver vehículos",
          description: "Ver lista de vehículos y detalles",
          category: "VEHICLES",
          displayOrder: 1,
        },
        {
          entity: "vehicles",
          action: "CREATE",
          name: "Crear vehículos",
          description: "Registrar nuevos vehículos",
          category: "VEHICLES",
          displayOrder: 2,
        },
        {
          entity: "vehicles",
          action: "EDIT",
          name: "Editar vehículos",
          description: "Modificar vehículos existentes",
          category: "VEHICLES",
          displayOrder: 3,
        },
        {
          entity: "vehicles",
          action: "DELETE",
          name: "Eliminar vehículos",
          description: "Eliminar vehículos",
          category: "VEHICLES",
          displayOrder: 4,
        },
        {
          entity: "vehicles",
          action: "ASSIGN",
          name: "Asignar vehículos",
          description: "Asignar conductores a vehículos",
          category: "VEHICLES",
          displayOrder: 5,
        },
        // DRIVERS
        {
          entity: "drivers",
          action: "VIEW",
          name: "Ver conductores",
          description: "Ver lista de conductores y detalles",
          category: "DRIVERS",
          displayOrder: 1,
        },
        {
          entity: "drivers",
          action: "CREATE",
          name: "Crear conductores",
          description: "Registrar nuevos conductores",
          category: "DRIVERS",
          displayOrder: 2,
        },
        {
          entity: "drivers",
          action: "EDIT",
          name: "Editar conductores",
          description: "Modificar conductores existentes",
          category: "DRIVERS",
          displayOrder: 3,
        },
        {
          entity: "drivers",
          action: "DELETE",
          name: "Eliminar conductores",
          description: "Eliminar conductores",
          category: "DRIVERS",
          displayOrder: 4,
        },
        {
          entity: "drivers",
          action: "MANAGE",
          name: "Gestionar estado",
          description: "Cambiar estado de conductores",
          category: "DRIVERS",
          displayOrder: 5,
        },
        // FLEETS
        {
          entity: "fleets",
          action: "VIEW",
          name: "Ver flotas",
          description: "Ver lista de flotas",
          category: "FLEETS",
          displayOrder: 1,
        },
        {
          entity: "fleets",
          action: "CREATE",
          name: "Crear flotas",
          description: "Crear nuevas flotas",
          category: "FLEETS",
          displayOrder: 2,
        },
        {
          entity: "fleets",
          action: "EDIT",
          name: "Editar flotas",
          description: "Modificar flotas existentes",
          category: "FLEETS",
          displayOrder: 3,
        },
        {
          entity: "fleets",
          action: "DELETE",
          name: "Eliminar flotas",
          description: "Eliminar flotas",
          category: "FLEETS",
          displayOrder: 4,
        },
        {
          entity: "fleets",
          action: "MANAGE",
          name: "Gestionar vehículos",
          description: "Asignar vehículos a flotas",
          category: "FLEETS",
          displayOrder: 5,
        },
        // ROUTES
        {
          entity: "routes",
          action: "VIEW",
          name: "Ver rutas",
          description: "Ver rutas planificadas",
          category: "ROUTES",
          displayOrder: 1,
        },
        {
          entity: "routes",
          action: "ASSIGN",
          name: "Asignar rutas",
          description: "Asignar rutas a conductores",
          category: "ROUTES",
          displayOrder: 2,
        },
        {
          entity: "routes",
          action: "EDIT",
          name: "Modificar rutas",
          description: "Reasignar paradas de rutas",
          category: "ROUTES",
          displayOrder: 3,
        },
        {
          entity: "routes",
          action: "CONFIRM",
          name: "Confirmar rutas",
          description: "Confirmar planes de ruta",
          category: "ROUTES",
          displayOrder: 4,
        },
        {
          entity: "routes",
          action: "CANCEL",
          name: "Cancelar rutas",
          description: "Cancelar rutas planificadas",
          category: "ROUTES",
          displayOrder: 5,
        },
        // OPTIMIZATION — split into optimization_job, optimization_config and plan
        {
          entity: "optimization_job",
          action: "VIEW",
          name: "Ver optimización",
          description: "Ver trabajos de optimización",
          category: "OPTIMIZATION",
          displayOrder: 1,
        },
        {
          entity: "optimization_job",
          action: "CREATE",
          name: "Crear optimización",
          description: "Ejecutar optimización de rutas",
          category: "OPTIMIZATION",
          displayOrder: 2,
        },
        {
          entity: "optimization_job",
          action: "CANCEL",
          name: "Cancelar optimización",
          description: "Cancelar trabajos en progreso",
          category: "OPTIMIZATION",
          displayOrder: 3,
        },
        {
          entity: "optimization_config",
          action: "VIEW",
          name: "Ver configuración de optimización",
          description: "Ver parámetros de optimización",
          category: "OPTIMIZATION",
          displayOrder: 4,
        },
        {
          entity: "optimization_config",
          action: "CREATE",
          name: "Configurar optimización",
          description: "Configurar parámetros de optimización",
          category: "OPTIMIZATION",
          displayOrder: 5,
        },
        {
          entity: "plan",
          action: "VIEW",
          name: "Ver planes",
          description: "Ver planes de ruta",
          category: "OPTIMIZATION",
          displayOrder: 6,
        },
        {
          entity: "plan",
          action: "CREATE",
          name: "Crear planes",
          description: "Crear planes de ruta",
          category: "OPTIMIZATION",
          displayOrder: 7,
        },
        {
          entity: "plan",
          action: "EDIT",
          name: "Editar planes",
          description: "Modificar planes (reasignar, intercambiar vehículos)",
          category: "OPTIMIZATION",
          displayOrder: 8,
        },
        {
          entity: "plan",
          action: "CONFIRM",
          name: "Confirmar planes",
          description: "Confirmar planes de ruta",
          category: "OPTIMIZATION",
          displayOrder: 9,
        },
        {
          entity: "plan",
          action: "CANCEL",
          name: "Cancelar planes",
          description: "Cancelar planes de ruta",
          category: "OPTIMIZATION",
          displayOrder: 10,
        },
        // ALERTS — alert (instances) vs alert_rule (rule CRUD)
        {
          entity: "alert",
          action: "VIEW",
          name: "Ver alertas",
          description: "Ver alertas del sistema",
          category: "ALERTS",
          displayOrder: 1,
        },
        {
          entity: "alert",
          action: "MANAGE",
          name: "Gestionar alertas",
          description: "Reconocer y descartar alertas",
          category: "ALERTS",
          displayOrder: 2,
        },
        {
          entity: "alert_rule",
          action: "VIEW",
          name: "Ver reglas de alertas",
          description: "Ver reglas de alertas",
          category: "ALERTS",
          displayOrder: 3,
        },
        {
          entity: "alert_rule",
          action: "CREATE",
          name: "Crear reglas de alertas",
          description: "Crear reglas de alertas",
          category: "ALERTS",
          displayOrder: 4,
        },
        {
          entity: "alert_rule",
          action: "EDIT",
          name: "Editar reglas de alertas",
          description: "Modificar reglas de alertas",
          category: "ALERTS",
          displayOrder: 5,
        },
        {
          entity: "alert_rule",
          action: "DELETE",
          name: "Eliminar reglas de alertas",
          description: "Eliminar reglas de alertas",
          category: "ALERTS",
          displayOrder: 6,
        },
        // USERS
        {
          entity: "users",
          action: "VIEW",
          name: "Ver usuarios",
          description: "Ver lista de usuarios",
          category: "USERS",
          displayOrder: 1,
        },
        {
          entity: "users",
          action: "CREATE",
          name: "Crear usuarios",
          description: "Crear nuevos usuarios",
          category: "USERS",
          displayOrder: 2,
        },
        {
          entity: "users",
          action: "EDIT",
          name: "Editar usuarios",
          description: "Modificar usuarios existentes",
          category: "USERS",
          displayOrder: 3,
        },
        {
          entity: "users",
          action: "DELETE",
          name: "Eliminar usuarios",
          description: "Desactivar usuarios",
          category: "USERS",
          displayOrder: 4,
        },
        {
          entity: "roles",
          action: "VIEW",
          name: "Ver roles",
          description: "Ver lista de roles",
          category: "USERS",
          displayOrder: 5,
        },
        {
          entity: "roles",
          action: "MANAGE",
          name: "Gestionar roles",
          description: "Crear, editar y eliminar roles",
          category: "USERS",
          displayOrder: 6,
        },
        {
          entity: "role",
          action: "ASSIGN",
          name: "Asignar roles",
          description: "Asignar y quitar roles a usuarios",
          category: "USERS",
          displayOrder: 7,
        },
        // SETTINGS — company config (delivery policy, tracking, custom fields),
        // zones (modeled as route), optimization presets and time-window presets.
        {
          entity: "company",
          action: "VIEW",
          name: "Ver configuración de empresa",
          description:
            "Ver configuración de la empresa (políticas, seguimiento, campos personalizados)",
          category: "SETTINGS",
          displayOrder: 1,
        },
        {
          entity: "company",
          action: "EDIT",
          name: "Editar configuración de empresa",
          description:
            "Modificar configuración de la empresa (políticas, seguimiento, campos personalizados)",
          category: "SETTINGS",
          displayOrder: 2,
        },
        {
          entity: "zones",
          action: "VIEW",
          name: "Ver zonas",
          description: "Ver zonas geográficas",
          category: "SETTINGS",
          displayOrder: 3,
        },
        {
          entity: "zones",
          action: "MANAGE",
          name: "Gestionar zonas",
          description: "Crear y editar zonas",
          category: "SETTINGS",
          displayOrder: 4,
        },
        {
          entity: "optimization_preset",
          action: "VIEW",
          name: "Ver presets de optimización",
          description: "Ver presets de optimización",
          category: "SETTINGS",
          displayOrder: 5,
        },
        {
          entity: "optimization_preset",
          action: "CREATE",
          name: "Crear presets de optimización",
          description: "Crear presets de optimización",
          category: "SETTINGS",
          displayOrder: 6,
        },
        {
          entity: "optimization_preset",
          action: "MANAGE",
          name: "Editar presets de optimización",
          description: "Modificar presets de optimización",
          category: "SETTINGS",
          displayOrder: 7,
        },
        {
          entity: "optimization_preset",
          action: "DELETE",
          name: "Eliminar presets de optimización",
          description: "Eliminar presets de optimización",
          category: "SETTINGS",
          displayOrder: 8,
        },
        {
          entity: "time_window_preset",
          action: "VIEW",
          name: "Ver presets de ventanas horarias",
          description: "Ver presets de ventanas de tiempo",
          category: "SETTINGS",
          displayOrder: 9,
        },
        {
          entity: "time_window_preset",
          action: "CREATE",
          name: "Crear presets de ventanas horarias",
          description: "Crear presets de ventanas de tiempo",
          category: "SETTINGS",
          displayOrder: 10,
        },
        {
          entity: "time_window_preset",
          action: "MANAGE",
          name: "Editar presets de ventanas horarias",
          description: "Modificar presets de ventanas de tiempo",
          category: "SETTINGS",
          displayOrder: 11,
        },
        {
          entity: "time_window_preset",
          action: "DELETE",
          name: "Eliminar presets de ventanas horarias",
          description: "Eliminar presets de ventanas de tiempo",
          category: "SETTINGS",
          displayOrder: 12,
        },
        // REPORTS — outputs (reports/exports) + metrics
        {
          entity: "output",
          action: "VIEW",
          name: "Ver reportes",
          description: "Ver reportes y salidas generadas",
          category: "REPORTS",
          displayOrder: 1,
        },
        {
          entity: "output",
          action: "EXPORT",
          name: "Exportar reportes",
          description: "Exportar reportes a PDF/CSV",
          category: "REPORTS",
          displayOrder: 2,
        },
        {
          entity: "metrics",
          action: "VIEW",
          name: "Ver métricas",
          description: "Ver métricas de rendimiento",
          category: "REPORTS",
          displayOrder: 3,
        },
        // VEHICLE SKILLS
        {
          entity: "vehicle_skill",
          action: "VIEW",
          name: "Ver habilidades de vehículos",
          description: "Ver catálogo de habilidades de vehículos",
          category: "VEHICLES",
          displayOrder: 6,
        },
        {
          entity: "vehicle_skill",
          action: "CREATE",
          name: "Crear habilidades de vehículos",
          description: "Crear habilidades de vehículos",
          category: "VEHICLES",
          displayOrder: 7,
        },
        {
          entity: "vehicle_skill",
          action: "EDIT",
          name: "Editar habilidades de vehículos",
          description: "Modificar habilidades de vehículos",
          category: "VEHICLES",
          displayOrder: 8,
        },
        {
          entity: "vehicle_skill",
          action: "DELETE",
          name: "Eliminar habilidades de vehículos",
          description: "Eliminar habilidades de vehículos",
          category: "VEHICLES",
          displayOrder: 9,
        },
        // DRIVER SKILLS
        {
          entity: "driver_skill",
          action: "VIEW",
          name: "Ver habilidades de conductores",
          description: "Ver catálogo de habilidades de conductores",
          category: "DRIVERS",
          displayOrder: 6,
        },
        {
          entity: "driver_skill",
          action: "CREATE",
          name: "Crear habilidades de conductores",
          description: "Crear habilidades de conductores",
          category: "DRIVERS",
          displayOrder: 7,
        },
        {
          entity: "driver_skill",
          action: "EDIT",
          name: "Editar habilidades de conductores",
          description: "Modificar habilidades de conductores",
          category: "DRIVERS",
          displayOrder: 8,
        },
        {
          entity: "driver_skill",
          action: "DELETE",
          name: "Eliminar habilidades de conductores",
          description: "Eliminar habilidades de conductores",
          category: "DRIVERS",
          displayOrder: 9,
        },
        {
          entity: "driver_skill",
          action: "ASSIGN",
          name: "Asignar habilidades de conductores",
          description: "Asignar habilidades a conductores",
          category: "DRIVERS",
          displayOrder: 10,
        },
        // ROUTE STOPS (parada de ruta) — gestión de paradas y estados
        {
          entity: "route_stop",
          action: "VIEW",
          name: "Ver paradas",
          description: "Ver paradas de ruta e historial",
          category: "ROUTES",
          displayOrder: 6,
        },
        {
          entity: "route_stop",
          action: "EDIT",
          name: "Editar paradas",
          description: "Modificar y reabrir paradas de ruta",
          category: "ROUTES",
          displayOrder: 7,
        },
        {
          entity: "route_stop",
          action: "CHANGE_STATUS",
          name: "Cambiar estado de paradas",
          description: "Marcar paradas como completadas, fallidas u omitidas",
          category: "ROUTES",
          displayOrder: 8,
        },
        // REASSIGNMENT — reasignación de paradas entre rutas
        {
          entity: "reassignment",
          action: "VIEW",
          name: "Ver reasignaciones",
          description: "Ver opciones, impacto e historial de reasignación",
          category: "ROUTES",
          displayOrder: 9,
        },
        {
          entity: "reassignment",
          action: "EXECUTE",
          name: "Ejecutar reasignaciones",
          description: "Ejecutar reasignación de paradas",
          category: "ROUTES",
          displayOrder: 10,
        },
        // CHAT — mensajería conductor / despacho
        {
          entity: "chat",
          action: "VIEW",
          name: "Ver chat",
          description: "Ver conversaciones y mensajes",
          category: "DRIVERS",
          displayOrder: 11,
        },
        {
          entity: "chat",
          action: "CREATE",
          name: "Enviar mensajes",
          description: "Enviar mensajes y difusiones",
          category: "DRIVERS",
          displayOrder: 12,
        },
      ];

      await db.insert(permissions).values(systemPermissions);
      console.log(`✅ Created ${systemPermissions.length} system permissions`);
    } else {
      console.log("ℹ️  Permissions already exist");
    }

    // Seed delivery policy and field definitions for all companies
    const allCompanies = await db
      .select({ id: companies.id, name: companies.commercialName })
      .from(companies);
    for (const company of allCompanies) {
      await seedDefaultDeliveryPolicy(company.id);

      const existingFields = await db
        .select()
        .from(companyFieldDefinitions)
        .where(eq(companyFieldDefinitions.companyId, company.id))
        .limit(1);
      if (existingFields.length === 0) {
        await seedDefaultFieldDefinitions(company.id);
        console.log(`✅ Seeded field definitions for: ${company.name}`);
      }
    }

    console.log("\n🎉 Seed completed successfully!");
    console.log("\n📋 Login credentials:");
    console.log("   Admin: admin@planeamiento.com / admin123");
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  }
}

seed();
