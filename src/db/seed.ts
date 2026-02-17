import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  alertNotifications,
  alertRules,
  alerts,
  auditLogs,
  companies,
  companyOptimizationProfiles,
  companyWorkflowStates,
  companyWorkflowTransitions,
  csvColumnMappingTemplates,
  driverLocations,
  fleets,
  optimizationConfigurations,
  optimizationJobs,
  optimizationPresets,
  orders,
  outputHistory,
  permissions,
  type PERMISSION_CATEGORIES,
  planMetrics,
  reassignmentsHistory,
  rolePermissions,
  roles,
  routeStopHistory,
  routeStops,
  timeWindowPresets,
  userAvailability,
  userDriverStatusHistory,
  userFleetPermissions,
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
  zoneVehicles,
  zones,
} from "@/db/schema";
import { seedDefaultWorkflowStates } from "@/lib/workflow/seed-defaults";

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
      await db.delete(companyWorkflowTransitions);
      await db.delete(companyWorkflowStates);
      await db.delete(routeStops);
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
      await db.delete(userFleetPermissions);
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

      console.log(
        "✅ Created admin user: admin@planeamiento.com / admin123",
      );
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
        { entity: "orders", action: "VIEW", name: "Ver pedidos", description: "Ver lista de pedidos y detalles", category: "ORDERS", displayOrder: 1 },
        { entity: "orders", action: "CREATE", name: "Crear pedidos", description: "Crear nuevos pedidos", category: "ORDERS", displayOrder: 2 },
        { entity: "orders", action: "EDIT", name: "Editar pedidos", description: "Modificar pedidos existentes", category: "ORDERS", displayOrder: 3 },
        { entity: "orders", action: "DELETE", name: "Eliminar pedidos", description: "Eliminar pedidos", category: "ORDERS", displayOrder: 4 },
        { entity: "orders", action: "IMPORT", name: "Importar pedidos", description: "Importar pedidos desde CSV", category: "ORDERS", displayOrder: 5 },
        { entity: "orders", action: "EXPORT", name: "Exportar pedidos", description: "Exportar pedidos a CSV", category: "ORDERS", displayOrder: 6 },
        // VEHICLES
        { entity: "vehicles", action: "VIEW", name: "Ver vehículos", description: "Ver lista de vehículos y detalles", category: "VEHICLES", displayOrder: 1 },
        { entity: "vehicles", action: "CREATE", name: "Crear vehículos", description: "Registrar nuevos vehículos", category: "VEHICLES", displayOrder: 2 },
        { entity: "vehicles", action: "EDIT", name: "Editar vehículos", description: "Modificar vehículos existentes", category: "VEHICLES", displayOrder: 3 },
        { entity: "vehicles", action: "DELETE", name: "Eliminar vehículos", description: "Eliminar vehículos", category: "VEHICLES", displayOrder: 4 },
        { entity: "vehicles", action: "ASSIGN", name: "Asignar vehículos", description: "Asignar conductores a vehículos", category: "VEHICLES", displayOrder: 5 },
        // DRIVERS
        { entity: "drivers", action: "VIEW", name: "Ver conductores", description: "Ver lista de conductores y detalles", category: "DRIVERS", displayOrder: 1 },
        { entity: "drivers", action: "CREATE", name: "Crear conductores", description: "Registrar nuevos conductores", category: "DRIVERS", displayOrder: 2 },
        { entity: "drivers", action: "EDIT", name: "Editar conductores", description: "Modificar conductores existentes", category: "DRIVERS", displayOrder: 3 },
        { entity: "drivers", action: "DELETE", name: "Eliminar conductores", description: "Eliminar conductores", category: "DRIVERS", displayOrder: 4 },
        { entity: "drivers", action: "MANAGE", name: "Gestionar estado", description: "Cambiar estado de conductores", category: "DRIVERS", displayOrder: 5 },
        // FLEETS
        { entity: "fleets", action: "VIEW", name: "Ver flotas", description: "Ver lista de flotas", category: "FLEETS", displayOrder: 1 },
        { entity: "fleets", action: "CREATE", name: "Crear flotas", description: "Crear nuevas flotas", category: "FLEETS", displayOrder: 2 },
        { entity: "fleets", action: "EDIT", name: "Editar flotas", description: "Modificar flotas existentes", category: "FLEETS", displayOrder: 3 },
        { entity: "fleets", action: "DELETE", name: "Eliminar flotas", description: "Eliminar flotas", category: "FLEETS", displayOrder: 4 },
        { entity: "fleets", action: "MANAGE", name: "Gestionar vehículos", description: "Asignar vehículos a flotas", category: "FLEETS", displayOrder: 5 },
        // ROUTES
        { entity: "routes", action: "VIEW", name: "Ver rutas", description: "Ver rutas planificadas", category: "ROUTES", displayOrder: 1 },
        { entity: "routes", action: "ASSIGN", name: "Asignar rutas", description: "Asignar rutas a conductores", category: "ROUTES", displayOrder: 2 },
        { entity: "routes", action: "EDIT", name: "Modificar rutas", description: "Reasignar paradas de rutas", category: "ROUTES", displayOrder: 3 },
        { entity: "routes", action: "CONFIRM", name: "Confirmar rutas", description: "Confirmar planes de ruta", category: "ROUTES", displayOrder: 4 },
        { entity: "routes", action: "CANCEL", name: "Cancelar rutas", description: "Cancelar rutas planificadas", category: "ROUTES", displayOrder: 5 },
        // OPTIMIZATION
        { entity: "optimization", action: "VIEW", name: "Ver optimización", description: "Ver trabajos de optimización", category: "OPTIMIZATION", displayOrder: 1 },
        { entity: "optimization", action: "CREATE", name: "Crear optimización", description: "Ejecutar optimización de rutas", category: "OPTIMIZATION", displayOrder: 2 },
        { entity: "optimization", action: "MANAGE", name: "Configurar optimización", description: "Configurar parámetros de optimización", category: "OPTIMIZATION", displayOrder: 3 },
        { entity: "optimization", action: "CANCEL", name: "Cancelar optimización", description: "Cancelar trabajos en progreso", category: "OPTIMIZATION", displayOrder: 4 },
        // ALERTS
        { entity: "alerts", action: "VIEW", name: "Ver alertas", description: "Ver alertas del sistema", category: "ALERTS", displayOrder: 1 },
        { entity: "alerts", action: "MANAGE", name: "Gestionar alertas", description: "Reconocer y descartar alertas", category: "ALERTS", displayOrder: 2 },
        { entity: "alerts", action: "CREATE", name: "Configurar reglas", description: "Crear reglas de alertas", category: "ALERTS", displayOrder: 3 },
        { entity: "alerts", action: "DELETE", name: "Eliminar reglas", description: "Eliminar reglas de alertas", category: "ALERTS", displayOrder: 4 },
        // USERS
        { entity: "users", action: "VIEW", name: "Ver usuarios", description: "Ver lista de usuarios", category: "USERS", displayOrder: 1 },
        { entity: "users", action: "CREATE", name: "Crear usuarios", description: "Crear nuevos usuarios", category: "USERS", displayOrder: 2 },
        { entity: "users", action: "EDIT", name: "Editar usuarios", description: "Modificar usuarios existentes", category: "USERS", displayOrder: 3 },
        { entity: "users", action: "DELETE", name: "Eliminar usuarios", description: "Desactivar usuarios", category: "USERS", displayOrder: 4 },
        { entity: "roles", action: "VIEW", name: "Ver roles", description: "Ver lista de roles", category: "USERS", displayOrder: 5 },
        { entity: "roles", action: "MANAGE", name: "Gestionar roles", description: "Crear, editar y eliminar roles", category: "USERS", displayOrder: 6 },
        // SETTINGS
        { entity: "settings", action: "VIEW", name: "Ver configuración", description: "Ver configuración del sistema", category: "SETTINGS", displayOrder: 1 },
        { entity: "settings", action: "EDIT", name: "Editar configuración", description: "Modificar configuración", category: "SETTINGS", displayOrder: 2 },
        { entity: "zones", action: "VIEW", name: "Ver zonas", description: "Ver zonas geográficas", category: "SETTINGS", displayOrder: 3 },
        { entity: "zones", action: "MANAGE", name: "Gestionar zonas", description: "Crear y editar zonas", category: "SETTINGS", displayOrder: 4 },
        { entity: "presets", action: "VIEW", name: "Ver presets", description: "Ver presets de optimización", category: "SETTINGS", displayOrder: 5 },
        { entity: "presets", action: "MANAGE", name: "Gestionar presets", description: "Crear y editar presets", category: "SETTINGS", displayOrder: 6 },
        // REPORTS
        { entity: "reports", action: "VIEW", name: "Ver reportes", description: "Ver reportes y métricas", category: "REPORTS", displayOrder: 1 },
        { entity: "reports", action: "EXPORT", name: "Exportar reportes", description: "Exportar reportes a PDF/CSV", category: "REPORTS", displayOrder: 2 },
        { entity: "metrics", action: "VIEW", name: "Ver métricas", description: "Ver métricas de rendimiento", category: "REPORTS", displayOrder: 3 },
        { entity: "history", action: "VIEW", name: "Ver historial", description: "Ver historial de planificaciones", category: "REPORTS", displayOrder: 4 },
      ];

      await db.insert(permissions).values(systemPermissions);
      console.log(`✅ Created ${systemPermissions.length} system permissions`);
    } else {
      console.log("ℹ️  Permissions already exist");
    }

    // Seed workflow states for all companies
    const allCompanies = await db
      .select({ id: companies.id, name: companies.commercialName })
      .from(companies);
    for (const company of allCompanies) {
      const existingStates = await db
        .select()
        .from(companyWorkflowStates)
        .where(eq(companyWorkflowStates.companyId, company.id))
        .limit(1);
      if (existingStates.length === 0) {
        await seedDefaultWorkflowStates(company.id);
        console.log(`✅ Seeded workflow states for: ${company.name}`);
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
