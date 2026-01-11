import { db } from "@/db";
import { 
  users, 
  companies, 
  fleets, 
  vehicles, 
  drivers, 
  orders,
  timeWindowPresets,
  DRIVER_STATUS,
  ORDER_STATUS,
  TIME_WINDOW_TYPES,
  TIME_WINDOW_STRICTNESS,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/password";
import { USER_ROLES } from "@/lib/auth-api";

async function seed() {
  console.log("🌱 Starting database seed...");

  try {
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
          phone: "+1234567890",
          country: "MX",
          timezone: "America/Mexico_City",
          currency: "MXN",
          dateFormat: "DD/MM/YYYY",
          active: true,
        })
        .returning();

      companyId = newCompany.id;
      console.log(`✅ Created company: ${newCompany.legalName} (${companyId})`);
    } else {
      companyId = existingCompany[0].id;
      console.log(`ℹ️  Company already exists: ${existingCompany[0].legalName} (${companyId})`);
    }

    // Create admin user
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, "admin@planeamiento.com"))
      .limit(1);

    if (existingUser.length === 0) {
      const hashedPassword = await hashPassword("admin123");

      await db.insert(users).values({
        companyId,
        email: "admin@planeamiento.com",
        password: hashedPassword,
        name: "Administrador",
        role: USER_ROLES.ADMIN_SISTEMA,
        active: true,
      });

      console.log(`✅ Created admin user: admin@planeamiento.com / admin123`);
    } else {
      console.log(`ℹ️  Admin user already exists`);
    }

    // Create time window presets
    const existingPresets = await db.select().from(timeWindowPresets).where(eq(timeWindowPresets.companyId, companyId)).limit(1);
    
    if (existingPresets.length === 0) {
      await db.insert(timeWindowPresets).values([
        { companyId, name: "Mañana", type: "RANGE" as keyof typeof TIME_WINDOW_TYPES, startTime: "08:00", endTime: "12:00", strictness: "SOFT" as keyof typeof TIME_WINDOW_STRICTNESS, active: true },
        { companyId, name: "Tarde", type: "RANGE" as keyof typeof TIME_WINDOW_TYPES, startTime: "14:00", endTime: "18:00", strictness: "SOFT" as keyof typeof TIME_WINDOW_STRICTNESS, active: true },
        { companyId, name: "Todo el día", type: "RANGE" as keyof typeof TIME_WINDOW_TYPES, startTime: "08:00", endTime: "20:00", strictness: "SOFT" as keyof typeof TIME_WINDOW_STRICTNESS, active: true },
        { companyId, name: "Urgente AM", type: "RANGE" as keyof typeof TIME_WINDOW_TYPES, startTime: "08:00", endTime: "10:00", strictness: "HARD" as keyof typeof TIME_WINDOW_STRICTNESS, active: true },
      ]);
      console.log(`✅ Created time window presets`);
    }

    // Create fleets
    const existingFleets = await db.select().from(fleets).where(eq(fleets.companyId, companyId)).limit(1);
    
    let fleetIds: string[] = [];
    if (existingFleets.length === 0) {
      const newFleets = await db.insert(fleets).values([
        { companyId, name: "Flota Ligera", type: "LIGHT_LOAD", weightCapacity: 500, volumeCapacity: 3, operationStart: "07:00", operationEnd: "19:00", active: true },
        { companyId, name: "Flota Pesada", type: "HEAVY_LOAD", weightCapacity: 2000, volumeCapacity: 15, operationStart: "06:00", operationEnd: "18:00", active: true },
        { companyId, name: "Flota Express", type: "EXPRESS", weightCapacity: 200, volumeCapacity: 1, operationStart: "08:00", operationEnd: "22:00", active: true },
      ]).returning();
      
      fleetIds = newFleets.map(f => f.id);
      console.log(`✅ Created ${newFleets.length} fleets`);
    } else {
      const allFleets = await db.select().from(fleets).where(eq(fleets.companyId, companyId));
      fleetIds = allFleets.map(f => f.id);
      console.log(`ℹ️  Fleets already exist`);
    }

    // Create vehicles
    const existingVehicles = await db.select().from(vehicles).where(eq(vehicles.companyId, companyId)).limit(1);
    
    if (existingVehicles.length === 0 && fleetIds.length > 0) {
      await db.insert(vehicles).values([
        { companyId, fleetId: fleetIds[0], plate: "ABC-123", brand: "Toyota", model: "Hilux", year: 2022, type: "PICKUP", weightCapacity: 500, volumeCapacity: 2, refrigerated: false, heated: false, lifting: false, status: "AVAILABLE", active: true },
        { companyId, fleetId: fleetIds[0], plate: "DEF-456", brand: "Ford", model: "Ranger", year: 2023, type: "PICKUP", weightCapacity: 600, volumeCapacity: 2, refrigerated: false, heated: false, lifting: false, status: "AVAILABLE", active: true },
        { companyId, fleetId: fleetIds[1], plate: "GHI-789", brand: "Mercedes", model: "Sprinter", year: 2021, type: "VAN", weightCapacity: 1500, volumeCapacity: 12, refrigerated: true, heated: false, lifting: true, status: "AVAILABLE", active: true },
        { companyId, fleetId: fleetIds[1], plate: "JKL-012", brand: "Iveco", model: "Daily", year: 2022, type: "TRUCK", weightCapacity: 2000, volumeCapacity: 15, refrigerated: false, heated: false, lifting: true, status: "IN_MAINTENANCE", active: true },
        { companyId, fleetId: fleetIds[2], plate: "MNO-345", brand: "Honda", model: "HR-V", year: 2023, type: "VAN", weightCapacity: 200, volumeCapacity: 1, refrigerated: false, heated: false, lifting: false, status: "AVAILABLE", active: true },
      ]);
      console.log(`✅ Created 5 vehicles`);
    } else {
      console.log(`ℹ️  Vehicles already exist`);
    }

    // Create drivers
    const existingDrivers = await db.select().from(drivers).where(eq(drivers.companyId, companyId)).limit(1);
    
    if (existingDrivers.length === 0 && fleetIds.length > 0) {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 2);
      
      await db.insert(drivers).values([
        { companyId, fleetId: fleetIds[0], name: "Juan Pérez", identification: "CURP001", email: "juan@demo.com", phone: "+521234567890", licenseNumber: "LIC001", licenseExpiry: futureDate, licenseCategories: "B,C", status: "AVAILABLE" as keyof typeof DRIVER_STATUS, active: true },
        { companyId, fleetId: fleetIds[0], name: "María García", identification: "CURP002", email: "maria@demo.com", phone: "+521234567891", licenseNumber: "LIC002", licenseExpiry: futureDate, licenseCategories: "B", status: "AVAILABLE" as keyof typeof DRIVER_STATUS, active: true },
        { companyId, fleetId: fleetIds[1], name: "Carlos López", identification: "CURP003", email: "carlos@demo.com", phone: "+521234567892", licenseNumber: "LIC003", licenseExpiry: futureDate, licenseCategories: "B,C,D", status: "AVAILABLE" as keyof typeof DRIVER_STATUS, active: true },
        { companyId, fleetId: fleetIds[1], name: "Ana Rodríguez", identification: "CURP004", email: "ana@demo.com", phone: "+521234567893", licenseNumber: "LIC004", licenseExpiry: futureDate, licenseCategories: "B,C", status: "IN_ROUTE" as keyof typeof DRIVER_STATUS, active: true },
        { companyId, fleetId: fleetIds[2], name: "Roberto Sánchez", identification: "CURP005", email: "roberto@demo.com", phone: "+521234567894", licenseNumber: "LIC005", licenseExpiry: futureDate, licenseCategories: "B", status: "AVAILABLE" as keyof typeof DRIVER_STATUS, active: true },
      ]);
      console.log(`✅ Created 5 drivers`);
    } else {
      console.log(`ℹ️  Drivers already exist`);
    }

    // Create sample orders
    const existingOrders = await db.select().from(orders).where(eq(orders.companyId, companyId)).limit(1);
    
    if (existingOrders.length === 0) {
      const addresses = [
        { address: "Av. Insurgentes Sur 1234, Col. Del Valle, CDMX", lat: "19.3910", lng: "-99.1775" },
        { address: "Calle Reforma 567, Col. Juárez, CDMX", lat: "19.4285", lng: "-99.1556" },
        { address: "Blvd. Miguel Hidalgo 890, Col. Centro, CDMX", lat: "19.4326", lng: "-99.1332" },
        { address: "Av. Universidad 234, Col. Narvarte, CDMX", lat: "19.3895", lng: "-99.1548" },
        { address: "Calzada de Tlalpan 456, Col. Portales, CDMX", lat: "19.3685", lng: "-99.1423" },
        { address: "Av. Revolución 789, Col. San Ángel, CDMX", lat: "19.3482", lng: "-99.1895" },
        { address: "Periférico Sur 1011, Col. Pedregal, CDMX", lat: "19.3156", lng: "-99.1856" },
        { address: "Av. Chapultepec 321, Col. Roma, CDMX", lat: "19.4152", lng: "-99.1619" },
      ];

      const clients = [
        "Farmacia San Pablo", "OXXO Centro", "Restaurante El Rincón", 
        "Hospital Central", "Supermercado La Comer", "Oficinas Reforma",
        "Hotel Presidente", "Centro Comercial Santa Fe"
      ];

      const getStatus = (i: number): keyof typeof ORDER_STATUS => {
        if (i < 2) return "IN_PROGRESS";
        if (i < 5) return "ASSIGNED";
        return "PENDING";
      };

      const orderValues = addresses.map((addr, i) => ({
        companyId,
        trackingId: `ORD-${String(i + 1).padStart(4, '0')}`,
        customerName: clients[i],
        customerPhone: `+5255${String(10000000 + i).slice(-8)}`,
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
    console.log("   Email: admin@planeamiento.com");
    console.log("   Password: admin123");
    
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  }
}

seed();
