import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  alertNotifications,
  alertRules,
  alerts,
  auditLogs,
  companies,
  csvColumnMappingTemplates,
  fleets,
  type ORDER_STATUS,
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
  type TIME_WINDOW_STRICTNESS,
  type TIME_WINDOW_TYPES,
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
  vehicleSkills,
  vehicleStatusHistory,
  vehicles,
  zoneVehicles,
  zones,
} from "@/db/schema";

async function seed() {
  console.log("🌱 Starting database seed...");

  // Check for --reset flag to clean existing data
  const shouldReset = process.argv.includes("--reset");

  try {
    if (shouldReset) {
      console.log("🗑️  Resetting database...");
      // Delete in correct order to respect foreign keys
      // First: tables that reference other non-company tables
      await db.delete(alertNotifications);
      await db.delete(routeStopHistory);
      await db.delete(planMetrics);
      await db.delete(outputHistory);
      await db.delete(reassignmentsHistory);
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
      await db.delete(vehicleSkills);
      await db.delete(zoneVehicles);
      await db.delete(vehicleFleets);
      await db.delete(vehicles);
      await db.delete(zones);
      await db.delete(fleets);
      await db.delete(timeWindowPresets);
      await db.delete(csvColumnMappingTemplates);
      // Delete roles and permissions (must come before users and companies)
      await db.delete(userRoles);
      await db.delete(rolePermissions);
      await db.delete(roles);
      await db.delete(permissions);
      await db.delete(optimizationPresets);
      await db.delete(users);
      await db.delete(companies);
      console.log("✅ Database reset complete");
    }

    // Check if default company exists
    const existingCompany = await db
      .select()
      .from(companies)
      .where(eq(companies.legalName, "Sistema Demo"))
      .limit(1);

    let companyId: string;

    if (existingCompany.length === 0) {
      const [newCompany] = await db
        .insert(companies)
        .values({
          legalName: "Sistema Demo",
          commercialName: "Demo Company",
          email: "admin@demo.com",
          phone: "+51123456789",
          country: "PE",
          timezone: "America/Lima",
          currency: "PEN",
          dateFormat: "DD/MM/YYYY",
          active: true,
        })
        .returning();

      companyId = newCompany.id;
      console.log(`✅ Created company: ${newCompany.legalName} (${companyId})`);
    } else {
      companyId = existingCompany[0].id;
      console.log(
        `ℹ️  Company already exists: ${existingCompany[0].legalName} (${companyId})`,
      );
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
        // No companyId for ADMIN_SISTEMA - they can switch between all companies
        companyId: null,
        email: "admin@planeamiento.com",
        username: "admin",
        password: hashedPassword,
        name: "Administrador del Sistema",
        role: "ADMIN_SISTEMA",
        active: true,
      });

      console.log(`✅ Created admin user: admin@planeamiento.com / admin123 (no company - system admin)`);
    } else {
      console.log(`ℹ️  Admin user already exists`);
    }

    // Create time window presets
    const existingPresets = await db
      .select()
      .from(timeWindowPresets)
      .where(eq(timeWindowPresets.companyId, companyId))
      .limit(1);

    if (existingPresets.length === 0) {
      await db.insert(timeWindowPresets).values([
        {
          companyId,
          name: "Mañana",
          type: "RANGE" as keyof typeof TIME_WINDOW_TYPES,
          startTime: "08:00",
          endTime: "12:00",
          strictness: "SOFT" as keyof typeof TIME_WINDOW_STRICTNESS,
          active: true,
        },
        {
          companyId,
          name: "Tarde",
          type: "RANGE" as keyof typeof TIME_WINDOW_TYPES,
          startTime: "14:00",
          endTime: "18:00",
          strictness: "SOFT" as keyof typeof TIME_WINDOW_STRICTNESS,
          active: true,
        },
        {
          companyId,
          name: "Todo el día",
          type: "RANGE" as keyof typeof TIME_WINDOW_TYPES,
          startTime: "08:00",
          endTime: "20:00",
          strictness: "SOFT" as keyof typeof TIME_WINDOW_STRICTNESS,
          active: true,
        },
        {
          companyId,
          name: "Urgente AM",
          type: "RANGE" as keyof typeof TIME_WINDOW_TYPES,
          startTime: "08:00",
          endTime: "10:00",
          strictness: "HARD" as keyof typeof TIME_WINDOW_STRICTNESS,
          active: true,
        },
      ]);
      console.log(`✅ Created time window presets`);
    }

    // Create fleets
    const existingFleets = await db
      .select()
      .from(fleets)
      .where(eq(fleets.companyId, companyId))
      .limit(1);

    let fleetIds: string[] = [];
    if (existingFleets.length === 0) {
      const newFleets = await db
        .insert(fleets)
        .values([
          {
            companyId,
            name: "Flota Ligera",
            description: "Vehículos para entregas pequeñas",
            active: true,
          },
          {
            companyId,
            name: "Flota Pesada",
            description: "Camiones y vehículos de carga",
            active: true,
          },
          {
            companyId,
            name: "Flota Express",
            description: "Entregas rápidas y urgentes",
            active: true,
          },
        ])
        .returning();

      fleetIds = newFleets.map((f) => f.id);
      console.log(`✅ Created ${newFleets.length} fleets`);
    } else {
      const allFleets = await db
        .select()
        .from(fleets)
        .where(eq(fleets.companyId, companyId));
      fleetIds = allFleets.map((f) => f.id);
      console.log(`ℹ️  Fleets already exist`);
    }

    // Create conductor users (drivers) - Lima, Perú
    const existingConductors = await db
      .select()
      .from(users)
      .where(eq(users.role, "CONDUCTOR"))
      .limit(1);

    let conductorIds: string[] = [];
    if (existingConductors.length === 0 && fleetIds.length > 0) {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 2);
      const hashedPassword = await bcrypt.hash("conductor123", 10);

      const newConductors = await db
        .insert(users)
        .values([
          {
            companyId,
            name: "Juan Pérez Huamán",
            email: "juan@demo.com",
            username: "juan_perez",
            password: hashedPassword,
            role: "CONDUCTOR",
            phone: "+51912345670",
            identification: "DNI70123456",
            licenseNumber: "A-I-70123456",
            licenseExpiry: futureDate,
            licenseCategories: "A-IIa,A-IIb",
            driverStatus: "AVAILABLE",
            primaryFleetId: fleetIds[0],
            active: true,
          },
          {
            companyId,
            name: "María García Quispe",
            email: "maria@demo.com",
            username: "maria_garcia",
            password: hashedPassword,
            role: "CONDUCTOR",
            phone: "+51912345671",
            identification: "DNI70123457",
            licenseNumber: "A-I-70123457",
            licenseExpiry: futureDate,
            licenseCategories: "A-IIa",
            driverStatus: "AVAILABLE",
            primaryFleetId: fleetIds[0],
            active: true,
          },
          {
            companyId,
            name: "Carlos López Mamani",
            email: "carlos@demo.com",
            username: "carlos_lopez",
            password: hashedPassword,
            role: "CONDUCTOR",
            phone: "+51912345672",
            identification: "DNI70123458",
            licenseNumber: "A-I-70123458",
            licenseExpiry: futureDate,
            licenseCategories: "A-IIb,A-IIIa",
            driverStatus: "AVAILABLE",
            primaryFleetId: fleetIds[1],
            active: true,
          },
          {
            companyId,
            name: "Ana Rodríguez Flores",
            email: "ana@demo.com",
            username: "ana_rodriguez",
            password: hashedPassword,
            role: "CONDUCTOR",
            phone: "+51912345673",
            identification: "DNI70123459",
            licenseNumber: "A-I-70123459",
            licenseExpiry: futureDate,
            licenseCategories: "A-IIa,A-IIb",
            driverStatus: "IN_ROUTE",
            primaryFleetId: fleetIds[1],
            active: true,
          },
          {
            companyId,
            name: "Roberto Sánchez Torres",
            email: "roberto@demo.com",
            username: "roberto_sanchez",
            password: hashedPassword,
            role: "CONDUCTOR",
            phone: "+51912345674",
            identification: "DNI70123460",
            licenseNumber: "A-I-70123460",
            licenseExpiry: futureDate,
            licenseCategories: "A-IIa",
            driverStatus: "AVAILABLE",
            primaryFleetId: fleetIds[2],
            active: true,
          },
        ])
        .returning();

      conductorIds = newConductors.map((c) => c.id);
      console.log(
        `✅ Created ${newConductors.length} conductors (users with role CONDUCTOR)`,
      );
    } else {
      const allConductors = await db
        .select()
        .from(users)
        .where(eq(users.role, "CONDUCTOR"));
      conductorIds = allConductors.map((c) => c.id);
      console.log(`ℹ️  Conductors already exist`);
    }

    // Create monitor user
    const existingAgente = await db
      .select()
      .from(users)
      .where(eq(users.role, "MONITOR"))
      .limit(1);

    if (existingAgente.length === 0) {
      const hashedPassword = await bcrypt.hash("agente123", 10);

      const [agente] = await db
        .insert(users)
        .values({
          companyId,
          name: "Pedro Agente Monitoreo",
          email: "agente@demo.com",
          username: "agente_pedro",
          password: hashedPassword,
          role: "MONITOR",
          phone: "+51912345680",
          active: true,
        })
        .returning();

      // Assign fleet permissions to agente
      if (fleetIds.length > 0) {
        await db.insert(userFleetPermissions).values(
          fleetIds.map((fleetId) => ({
            companyId,
            userId: agente.id,
            fleetId,
            active: true,
          })),
        );
      }

      console.log(
        `✅ Created agente de seguimiento: agente@demo.com / agente123`,
      );
    } else {
      console.log(`ℹ️  Agente de seguimiento already exists`);
    }

    // Create planificador user
    const existingPlanificador = await db
      .select()
      .from(users)
      .where(eq(users.role, "PLANIFICADOR"))
      .limit(1);

    if (existingPlanificador.length === 0) {
      const hashedPassword = await bcrypt.hash("planificador123", 10);

      await db.insert(users).values({
        companyId,
        name: "Laura Planificadora",
        email: "planificador@demo.com",
        username: "planificador_laura",
        password: hashedPassword,
        role: "PLANIFICADOR",
        phone: "+51912345681",
        active: true,
      });

      console.log(
        `✅ Created planificador: planificador@demo.com / planificador123`,
      );
    } else {
      console.log(`ℹ️  Planificador already exists`);
    }

    // Create vehicles
    const existingVehicles = await db
      .select()
      .from(vehicles)
      .where(eq(vehicles.companyId, companyId))
      .limit(1);

    let vehicleIds: string[] = [];
    if (existingVehicles.length === 0 && fleetIds.length > 0) {
      const newVehicles = await db
        .insert(vehicles)
        .values([
          {
            companyId,
            name: "Camioneta Toyota 01",
            plate: "ABC-123",
            useNameAsPlate: false,
            brand: "Toyota",
            model: "Hilux",
            year: 2022,
            type: "PICKUP",
            loadType: "PACKAGES",
            maxOrders: 15,
            weightCapacity: 500,
            volumeCapacity: 2,
            originAddress: "Av. Javier Prado Este 1234, San Isidro, Lima",
            originLatitude: "-12.0897",
            originLongitude: "-77.0089",
            workdayStart: "07:00",
            workdayEnd: "18:00",
            assignedDriverId: conductorIds[0] || null,
            refrigerated: false,
            heated: false,
            lifting: false,
            status: "AVAILABLE",
            active: true,
          },
          {
            companyId,
            name: "Ford Ranger 02",
            plate: "DEF-456",
            useNameAsPlate: false,
            brand: "Ford",
            model: "Ranger",
            year: 2023,
            type: "PICKUP",
            loadType: "PACKAGES",
            maxOrders: 15,
            weightCapacity: 600,
            volumeCapacity: 2,
            originAddress: "Av. Arequipa 2500, Lince, Lima",
            originLatitude: "-12.0856",
            originLongitude: "-77.0367",
            workdayStart: "08:00",
            workdayEnd: "19:00",
            assignedDriverId: conductorIds[1] || null,
            refrigerated: false,
            heated: false,
            lifting: false,
            status: "AVAILABLE",
            active: true,
          },
          {
            companyId,
            name: "Sprinter Refrigerada",
            plate: "GHI-789",
            useNameAsPlate: false,
            brand: "Mercedes",
            model: "Sprinter",
            year: 2021,
            type: "VAN",
            loadType: "REFRIGERATED",
            maxOrders: 25,
            weightCapacity: 1500,
            volumeCapacity: 12,
            originAddress: "Av. Colonial 1500, Callao, Lima",
            originLatitude: "-12.0567",
            originLongitude: "-77.1234",
            workdayStart: "06:00",
            workdayEnd: "17:00",
            hasBreakTime: true,
            breakDuration: 60,
            breakTimeStart: "12:00",
            breakTimeEnd: "13:00",
            assignedDriverId: conductorIds[2] || null,
            refrigerated: true,
            heated: false,
            lifting: true,
            status: "AVAILABLE",
            active: true,
          },
          {
            companyId,
            name: "Iveco Daily Carga",
            plate: "JKL-012",
            useNameAsPlate: false,
            brand: "Iveco",
            model: "Daily",
            year: 2022,
            type: "TRUCK",
            loadType: "PALLETS",
            maxOrders: 30,
            weightCapacity: 2000,
            volumeCapacity: 15,
            originAddress: "Av. Argentina 3000, Callao, Lima",
            originLatitude: "-12.0456",
            originLongitude: "-77.1345",
            workdayStart: "05:00",
            workdayEnd: "16:00",
            assignedDriverId: conductorIds[3] || null,
            refrigerated: false,
            heated: false,
            lifting: true,
            status: "IN_MAINTENANCE",
            active: true,
          },
          {
            companyId,
            name: "Express Moto 01",
            plate: "MNO-345",
            useNameAsPlate: true,
            brand: "Honda",
            model: "PCX",
            year: 2023,
            type: "MOTORCYCLE",
            loadType: "PACKAGES",
            maxOrders: 8,
            weightCapacity: 50,
            volumeCapacity: 1,
            originAddress: "Av. Larco 500, Miraflores, Lima",
            originLatitude: "-12.1234",
            originLongitude: "-77.0289",
            workdayStart: "08:00",
            workdayEnd: "22:00",
            assignedDriverId: conductorIds[4] || null,
            refrigerated: false,
            heated: false,
            lifting: false,
            status: "AVAILABLE",
            active: true,
          },
        ])
        .returning();

      vehicleIds = newVehicles.map((v) => v.id);
      console.log(`✅ Created ${newVehicles.length} vehicles`);

      // Create vehicle-fleet relationships (M:N)
      const vehicleFleetRelations = [
        { vehicleId: vehicleIds[0], fleetId: fleetIds[0] },
        { vehicleId: vehicleIds[1], fleetId: fleetIds[0] },
        { vehicleId: vehicleIds[2], fleetId: fleetIds[1] },
        { vehicleId: vehicleIds[3], fleetId: fleetIds[1] },
        { vehicleId: vehicleIds[4], fleetId: fleetIds[2] },
        // Some vehicles in multiple fleets
        { vehicleId: vehicleIds[0], fleetId: fleetIds[2] },
        { vehicleId: vehicleIds[1], fleetId: fleetIds[2] },
      ];

      await db.insert(vehicleFleets).values(
        vehicleFleetRelations.map((rel) => ({
          companyId,
          vehicleId: rel.vehicleId,
          fleetId: rel.fleetId,
          active: true,
        })),
      );
      console.log(`✅ Created vehicle-fleet relationships`);
    } else {
      console.log(`ℹ️  Vehicles already exist`);
    }

    // Create sample orders - Lima, Perú
    const existingOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.companyId, companyId))
      .limit(1);

    if (existingOrders.length === 0) {
      // Direcciones reales de Lima, Perú
      const addresses = [
        {
          address: "Av. Javier Prado Este 4200, Surco, Lima",
          lat: "-12.0847",
          lng: "-76.9716",
        },
        {
          address: "Av. Larco 345, Miraflores, Lima",
          lat: "-12.1219",
          lng: "-77.0308",
        },
        {
          address: "Jr. de la Unión 450, Centro Histórico, Lima",
          lat: "-12.0464",
          lng: "-77.0327",
        },
        {
          address: "Av. La Marina 2000, San Miguel, Lima",
          lat: "-12.0769",
          lng: "-77.0940",
        },
        {
          address: "Av. Salaverry 3250, San Isidro, Lima",
          lat: "-12.0983",
          lng: "-77.0487",
        },
        {
          address: "Av. Brasil 2850, Pueblo Libre, Lima",
          lat: "-12.0750",
          lng: "-77.0590",
        },
        {
          address: "Av. Angamos Este 1550, Surquillo, Lima",
          lat: "-12.1139",
          lng: "-77.0140",
        },
        {
          address: "Av. Arequipa 4545, Miraflores, Lima",
          lat: "-12.1145",
          lng: "-77.0278",
        },
        {
          address: "Av. Universitaria 1801, San Miguel, Lima",
          lat: "-12.0670",
          lng: "-77.0830",
        },
        {
          address: "Av. Petit Thouars 5050, Miraflores, Lima",
          lat: "-12.1190",
          lng: "-77.0340",
        },
      ];

      const clients = [
        "Wong Javier Prado",
        "Metro Larco",
        "Farmacia Inkafarma Centro",
        "Plaza San Miguel",
        "Clínica San Isidro",
        "Supermercado Tottus",
        "Real Plaza Surquillo",
        "CC Larcomar",
        "PUCP Entregas",
        "Vivanda Miraflores",
      ];

      const getStatus = (i: number): keyof typeof ORDER_STATUS => {
        if (i < 2) return "IN_PROGRESS";
        if (i < 5) return "ASSIGNED";
        return "PENDING";
      };

      const orderValues = addresses.map((addr, i) => ({
        companyId,
        trackingId: `ORD-${String(i + 1).padStart(4, "0")}`,
        customerName: clients[i % clients.length],
        customerPhone: `+519${String(10000000 + i).slice(-8)}`,
        address: addr.address,
        latitude: addr.lat,
        longitude: addr.lng,
        weightRequired: Math.floor(Math.random() * 50) + 5,
        volumeRequired: Math.floor(Math.random() * 5) + 1,
        status: getStatus(i),
        active: true,
      }));

      await db.insert(orders).values(orderValues);
      console.log(`✅ Created ${orderValues.length} orders`);
    } else {
      console.log(`ℹ️  Orders already exist`);
    }

    // ============================================
    // SEED PERMISSIONS AND ROLES
    // ============================================

    // Check if permissions exist
    const existingPermissions = await db
      .select()
      .from(permissions)
      .limit(1);

    if (existingPermissions.length === 0) {
      // Define all system permissions
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
      console.log(`ℹ️  Permissions already exist`);
    }

    // Create system roles for the company
    const existingRoles = await db
      .select()
      .from(roles)
      .where(eq(roles.companyId, companyId))
      .limit(1);

    if (existingRoles.length === 0) {
      // Get all permissions for role assignment
      const allPermissions = await db.select().from(permissions);
      const permissionsByEntity = allPermissions.reduce((acc, p) => {
        if (!acc[p.entity]) acc[p.entity] = [];
        acc[p.entity].push(p);
        return acc;
      }, {} as Record<string, typeof allPermissions>);

      // Create system roles
      const systemRolesData = [
        {
          name: "Administrador del Sistema",
          description: "Acceso completo a todas las funcionalidades",
          code: "ADMIN_SISTEMA",
          isSystem: true,
          allPermissions: true,
        },
        {
          name: "Planificador",
          description: "Gestión de pedidos, optimización y rutas",
          code: "PLANIFICADOR",
          isSystem: true,
          entities: ["orders", "optimization", "routes", "reports", "metrics", "history"],
        },
        {
          name: "Monitor",
          description: "Visualización y seguimiento de operaciones",
          code: "MONITOR",
          isSystem: true,
          entities: ["orders", "routes", "alerts", "reports", "metrics"],
          actionsOnly: ["VIEW", "MANAGE"], // Solo ver y gestionar alertas
        },
        {
          name: "Administrador de Flota",
          description: "Gestión de vehículos, conductores y flotas",
          code: "ADMIN_FLOTA",
          isSystem: true,
          entities: ["vehicles", "drivers", "fleets"],
        },
      ];

      for (const roleData of systemRolesData) {
        const [newRole] = await db
          .insert(roles)
          .values({
            companyId,
            name: roleData.name,
            description: roleData.description,
            code: roleData.code,
            isSystem: roleData.isSystem,
            active: true,
          })
          .returning();

        // Assign permissions to role
        const permissionsToAssign: Array<{ roleId: string; permissionId: string; enabled: boolean }> = [];

        for (const perm of allPermissions) {
          let enabled = false;

          if (roleData.allPermissions) {
            enabled = true;
          } else if (roleData.entities?.includes(perm.entity)) {
            if (roleData.actionsOnly) {
              enabled = roleData.actionsOnly.includes(perm.action);
            } else {
              enabled = true;
            }
          }

          permissionsToAssign.push({
            roleId: newRole.id,
            permissionId: perm.id,
            enabled,
          });
        }

        if (permissionsToAssign.length > 0) {
          await db.insert(rolePermissions).values(permissionsToAssign);
        }

        console.log(`✅ Created role: ${roleData.name}`);
      }

      // Assign admin role to admin user
      const adminUser = await db
        .select()
        .from(users)
        .where(eq(users.email, "admin@planeamiento.com"))
        .limit(1);

      const adminRole = await db
        .select()
        .from(roles)
        .where(eq(roles.code, "ADMIN_SISTEMA"))
        .limit(1);

      if (adminUser.length > 0 && adminRole.length > 0) {
        await db.insert(userRoles).values({
          userId: adminUser[0].id,
          roleId: adminRole[0].id,
          isPrimary: true,
          active: true,
        });
        console.log(`✅ Assigned admin role to admin user`);
      }

      // Create custom roles (non-system roles that can be assigned additionally)
      const customRolesData = [
        {
          name: "Jefe de Operaciones",
          description: "Supervisor con capacidad de configurar el sistema además de planificar",
          code: "JEFE_OPERACIONES",
          isSystem: false,
          permissionCodes: [
            "alerts:CREATE",
            "alerts:DELETE",
            "settings:VIEW",
            "settings:EDIT",
            "presets:MANAGE",
            "zones:MANAGE",
            "users:VIEW",
          ],
        },
        {
          name: "Analista",
          description: "Acceso de solo lectura para reportes y análisis de datos",
          code: "ANALISTA",
          isSystem: false,
          permissionCodes: [
            "reports:VIEW",
            "reports:EXPORT",
            "metrics:VIEW",
            "history:VIEW",
            "orders:VIEW",
            "routes:VIEW",
            "optimization:VIEW",
          ],
        },
        {
          name: "Operador Turno",
          description: "Monitor con capacidad de replanificar en ausencia del planificador",
          code: "OPERADOR_TURNO",
          isSystem: false,
          permissionCodes: [
            "optimization:VIEW",
            "optimization:CREATE",
            "routes:EDIT",
            "routes:ASSIGN",
          ],
        },
      ];

      for (const roleData of customRolesData) {
        const [newRole] = await db
          .insert(roles)
          .values({
            companyId,
            name: roleData.name,
            description: roleData.description,
            code: roleData.code,
            isSystem: roleData.isSystem,
            active: true,
          })
          .returning();

        // Find and assign specific permissions
        const permissionsToAssign: Array<{ roleId: string; permissionId: string; enabled: boolean }> = [];

        for (const perm of allPermissions) {
          const permCode = `${perm.entity}:${perm.action}`;
          const enabled = roleData.permissionCodes.includes(permCode);

          permissionsToAssign.push({
            roleId: newRole.id,
            permissionId: perm.id,
            enabled,
          });
        }

        if (permissionsToAssign.length > 0) {
          await db.insert(rolePermissions).values(permissionsToAssign);
        }

        console.log(`✅ Created custom role: ${roleData.name}`);
      }
    } else {
      console.log(`ℹ️  Roles already exist for this company`);
    }

    console.log("\n🎉 Seed completed successfully!");
    console.log("\n📋 Login credentials:");
    console.log("   Admin:        admin@planeamiento.com / admin123");
    console.log("   Conductor:    juan@demo.com / conductor123");
    console.log("   Agente:       agente@demo.com / agente123");
    console.log("   Planificador: planificador@demo.com / planificador123");
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  }
}

seed();
