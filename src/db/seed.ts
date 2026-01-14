import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLogs,
  companies,
  fleets,
  type ORDER_STATUS,
  optimizationConfigurations,
  optimizationJobs,
  orders,
  type TIME_WINDOW_STRICTNESS,
  type TIME_WINDOW_TYPES,
  timeWindowPresets,
  userAvailability,
  userDriverStatusHistory,
  userFleetPermissions,
  userSecondaryFleets,
  userSkills,
  users,
  vehicleFleetHistory,
  vehicleFleets,
  vehicleSkills,
  vehicleStatusHistory,
  vehicles,
} from "@/db/schema";

async function seed() {
  console.log("🌱 Starting database seed...");

  // Check for --reset flag to clean existing data
  const shouldReset = process.argv.includes("--reset");

  try {
    if (shouldReset) {
      console.log("🗑️  Resetting database...");
      // Delete in correct order to respect foreign keys
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
      await db.delete(vehicleFleets);
      await db.delete(vehicles);
      await db.delete(fleets);
      await db.delete(timeWindowPresets);
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

    // Create admin user
    const existingAdmin = await db
      .select()
      .from(users)
      .where(eq(users.email, "admin@planeamiento.com"))
      .limit(1);

    if (existingAdmin.length === 0) {
      const hashedPassword = await bcrypt.hash("admin123", 10);

      await db.insert(users).values({
        companyId,
        email: "admin@planeamiento.com",
        username: "admin",
        password: hashedPassword,
        name: "Administrador del Sistema",
        role: "ADMIN",
        active: true,
      });

      console.log(`✅ Created admin user: admin@planeamiento.com / admin123`);
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

    // Create agente de seguimiento user
    const existingAgente = await db
      .select()
      .from(users)
      .where(eq(users.role, "AGENTE_SEGUIMIENTO"))
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
          role: "AGENTE_SEGUIMIENTO",
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
