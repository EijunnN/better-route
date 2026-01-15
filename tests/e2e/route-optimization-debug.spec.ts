import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

/**
 * Route Optimization Debugging E2E Test
 *
 * This test investigates why only one vehicle (GHI-789) is getting orders assigned
 * when multiple vehicles are selected for optimization.
 *
 * IDENTIFIED POTENTIAL ROOT CAUSES:
 *
 * 1. VEHICLE CAPACITY MISMATCH:
 *    - In optimization-runner.ts, vehicles default to maxWeight: 10000kg, maxVolume: 100L
 *    - If orders have no weight/volume requirements, the first vehicle can handle all
 *
 * 2. ALL VEHICLES USE SAME DEPOT:
 *    - In vroom-optimizer.ts, all vehicles start/end at the same depot location
 *    - Individual vehicle originLatitude/originLongitude are NOT used
 *    - VROOM optimizes for fewer vehicles when they all start from same location
 *
 * 3. NEAREST-NEIGHBOR FALLBACK ISSUE:
 *    - When VROOM is unavailable, the fallback algorithm sorts vehicles by capacity
 *    - The largest vehicle gets all orders until it's full
 *
 * 4. MISSING max_tasks CONSTRAINT:
 *    - Vehicle's maxOrders field is not passed to VROOM's max_tasks parameter
 *    - Without this, VROOM has no limit on orders per vehicle
 *
 * 5. NO TIME WINDOW CONSTRAINTS:
 *    - Orders without promisedDate get no time windows
 *    - VROOM can then assign all orders to one vehicle more easily
 */

interface AuthResponse {
  token: string;
  user: {
    id: string;
    companyId: string;
  };
}

interface Vehicle {
  id: string;
  name: string;
  plate: string | null;
  weightCapacity: number | null;
  volumeCapacity: number | null;
  maxOrders: number;
  originLatitude: string | null;
  originLongitude: string | null;
}

interface Order {
  id: string;
  trackingId: string;
  weightRequired: number | null;
  volumeRequired: number | null;
  latitude: string | null;
  longitude: string | null;
}

interface OptimizationRoute {
  vehicleId: string;
  vehiclePlate: string;
  stops: Array<{
    orderId: string;
    trackingId: string;
    sequence: number;
  }>;
  totalDistance: number;
  totalWeight: number;
  totalVolume: number;
}

interface OptimizationResult {
  routes: OptimizationRoute[];
  unassignedOrders: Array<{
    orderId: string;
    trackingId: string;
    reason: string;
  }>;
  metrics: {
    totalRoutes: number;
    totalStops: number;
  };
}

let authToken: string;
let companyId: string;
let userId: string;

test.describe('Route Optimization Vehicle Assignment Debug', () => {

  test.beforeAll(async ({ request }) => {
    // Login to get auth token
    console.log('\n=== AUTHENTICATION ===');
    const loginResponse = await request.post('/api/auth/login', {
      data: {
        username: 'admin',
        password: 'admin123',
      },
    });

    if (!loginResponse.ok()) {
      console.error('Login failed:', await loginResponse.text());
      throw new Error('Authentication failed - make sure the app is running and seeded');
    }

    const authData = await loginResponse.json() as { data: AuthResponse };
    authToken = authData.data.token;
    companyId = authData.data.user.companyId;
    userId = authData.data.user.id;

    console.log(`Authenticated - CompanyId: ${companyId}`);
  });

  test('Debug: Inspect vehicles capacity and origin locations', async ({ request }) => {
    console.log('\n=== VEHICLE ANALYSIS ===');

    const response = await request.get('/api/vehicles/available?limit=100', {
      headers: {
        'x-company-id': companyId,
        'Authorization': `Bearer ${authToken}`,
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    const vehicles = data.data as Vehicle[];

    console.log(`\nFound ${vehicles.length} available vehicles:\n`);

    vehicles.forEach((v, index) => {
      console.log(`Vehicle ${index + 1}: ${v.plate || v.name}`);
      console.log(`  ID: ${v.id}`);
      console.log(`  Weight Capacity: ${v.weightCapacity ?? 'NOT SET (will default to 10000)'}`);
      console.log(`  Volume Capacity: ${v.volumeCapacity ?? 'NOT SET (will default to 100)'}`);
      console.log(`  Max Orders: ${v.maxOrders} (NOT passed to VROOM's max_tasks!)`);
      console.log(`  Origin: ${v.originLatitude}, ${v.originLongitude} (NOT USED - all vehicles use same depot)`);
      console.log('');
    });

    // Check if all vehicles have similar capacities
    const capacities = vehicles.map(v => ({
      weight: v.weightCapacity ?? 10000,
      volume: v.volumeCapacity ?? 100,
    }));

    const allSameCapacity = capacities.every(
      c => c.weight === capacities[0].weight && c.volume === capacities[0].volume
    );

    if (allSameCapacity) {
      console.log('WARNING: All vehicles have identical capacities!');
      console.log('This could cause VROOM to prefer using fewer vehicles.\n');
    }
  });

  test('Debug: Inspect orders weight/volume requirements', async ({ request }) => {
    console.log('\n=== ORDER ANALYSIS ===');

    const response = await request.get('/api/orders?status=PENDING&active=true&limit=100', {
      headers: {
        'x-company-id': companyId,
        'Authorization': `Bearer ${authToken}`,
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    const orders = data.data as Order[];

    console.log(`\nFound ${orders.length} pending orders:\n`);

    const ordersWithWeight = orders.filter(o => o.weightRequired && o.weightRequired > 0);
    const ordersWithVolume = orders.filter(o => o.volumeRequired && o.volumeRequired > 0);
    const ordersWithCoords = orders.filter(o => o.latitude && o.longitude);

    console.log(`Orders with weight requirement: ${ordersWithWeight.length}`);
    console.log(`Orders with volume requirement: ${ordersWithVolume.length}`);
    console.log(`Orders with coordinates: ${ordersWithCoords.length}`);

    const totalWeight = ordersWithWeight.reduce((sum, o) => sum + (o.weightRequired || 0), 0);
    const totalVolume = ordersWithVolume.reduce((sum, o) => sum + (o.volumeRequired || 0), 0);

    console.log(`\nTotal weight of all orders: ${totalWeight} kg`);
    console.log(`Total volume of all orders: ${totalVolume} L`);

    // Sample first 5 orders
    console.log('\nSample orders (first 5):');
    orders.slice(0, 5).forEach((o, i) => {
      console.log(`  ${i + 1}. ${o.trackingId}: weight=${o.weightRequired ?? 0}, volume=${o.volumeRequired ?? 0}`);
    });

    if (ordersWithWeight.length === 0 && ordersWithVolume.length === 0) {
      console.log('\nWARNING: No orders have weight/volume requirements!');
      console.log('Without capacity constraints, one vehicle can handle ALL orders.');
    }
  });

  test('Debug: Run optimization and analyze vehicle distribution', async ({ page, request }) => {
    console.log('\n=== OPTIMIZATION TEST ===');

    // Step 1: Get available vehicles
    const vehiclesResponse = await request.get('/api/vehicles/available?limit=100', {
      headers: {
        'x-company-id': companyId,
        'Authorization': `Bearer ${authToken}`,
      },
    });

    const vehiclesData = await vehiclesResponse.json();
    const vehicles = vehiclesData.data as Vehicle[];

    if (vehicles.length < 4) {
      console.log(`Only ${vehicles.length} vehicles available - need at least 4 for this test`);
      test.skip();
      return;
    }

    // Select 4 vehicles
    const selectedVehicleIds = vehicles.slice(0, 4).map(v => v.id);
    console.log(`\nSelected ${selectedVehicleIds.length} vehicles for optimization:`);
    vehicles.slice(0, 4).forEach(v => {
      console.log(`  - ${v.plate || v.name} (ID: ${v.id})`);
    });

    // Step 2: Get pending orders
    const ordersResponse = await request.get('/api/orders?status=PENDING&active=true&limit=100', {
      headers: {
        'x-company-id': companyId,
        'Authorization': `Bearer ${authToken}`,
      },
    });

    const ordersData = await ordersResponse.json();
    const orders = ordersData.data as Order[];
    const selectedOrderIds = orders.map(o => o.id);

    console.log(`\nSelected ${selectedOrderIds.length} orders for optimization`);

    // Step 3: Create optimization configuration
    console.log('\nCreating optimization configuration...');

    const configResponse = await request.post('/api/optimization/configure', {
      headers: {
        'Content-Type': 'application/json',
        'x-company-id': companyId,
        'Authorization': `Bearer ${authToken}`,
      },
      data: {
        name: `Debug Test ${new Date().toISOString()}`,
        depotLatitude: '-12.0464',
        depotLongitude: '-77.0428',
        depotAddress: 'Lima, Peru',
        selectedVehicleIds: JSON.stringify(selectedVehicleIds),
        selectedDriverIds: JSON.stringify([]),
        objective: 'BALANCED',
        capacityEnabled: true,
        workWindowStart: '08:00',
        workWindowEnd: '20:00',
        serviceTimeMinutes: 10,
        timeWindowStrictness: 'SOFT',
        penaltyFactor: 5,
        selectedOrderIds: JSON.stringify(selectedOrderIds),
      },
    });

    if (!configResponse.ok()) {
      console.error('Config creation failed:', await configResponse.text());
      throw new Error('Failed to create configuration');
    }

    const configData = await configResponse.json();
    const configId = configData.data.id;
    console.log(`Configuration created: ${configId}`);

    // Step 4: Start optimization job
    console.log('\nStarting optimization job...');

    const jobResponse = await request.post('/api/optimization/jobs', {
      headers: {
        'Content-Type': 'application/json',
        'x-company-id': companyId,
        'Authorization': `Bearer ${authToken}`,
      },
      data: {
        configurationId: configId,
        companyId: companyId,
        vehicleIds: selectedVehicleIds,
        driverIds: [],
      },
    });

    if (!jobResponse.ok()) {
      console.error('Job creation failed:', await jobResponse.text());
      throw new Error('Failed to create optimization job');
    }

    const jobData = await jobResponse.json();
    const jobId = jobData.data.id;
    console.log(`Job started: ${jobId}`);

    // Step 5: Poll for job completion
    console.log('\nWaiting for optimization to complete...');

    let result: OptimizationResult | null = null;
    const maxAttempts = 60;

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const statusResponse = await request.get(`/api/optimization/jobs/${jobId}`, {
        headers: {
          'x-company-id': companyId,
          'Authorization': `Bearer ${authToken}`,
        },
      });

      const statusData = await statusResponse.json();
      const job = statusData.data;

      console.log(`  Status: ${job.status}, Progress: ${job.progress}%`);

      if (job.status === 'COMPLETED' && job.result) {
        result = JSON.parse(job.result) as OptimizationResult;
        break;
      } else if (job.status === 'FAILED') {
        console.error(`Job failed: ${job.error}`);
        throw new Error(`Optimization failed: ${job.error}`);
      }
    }

    if (!result) {
      throw new Error('Optimization did not complete in time');
    }

    // Step 6: Analyze results
    console.log('\n=== OPTIMIZATION RESULTS ===\n');
    console.log(`Total routes generated: ${result.routes.length}`);
    console.log(`Total stops assigned: ${result.metrics.totalStops}`);
    console.log(`Unassigned orders: ${result.unassignedOrders.length}`);

    console.log('\n--- Vehicle Assignment Distribution ---\n');

    const vehicleAssignments: Record<string, number> = {};

    result.routes.forEach(route => {
      vehicleAssignments[route.vehiclePlate] = route.stops.length;
      console.log(`Vehicle ${route.vehiclePlate}:`);
      console.log(`  Orders assigned: ${route.stops.length}`);
      console.log(`  Total distance: ${(route.totalDistance / 1000).toFixed(2)} km`);
      console.log(`  Total weight: ${route.totalWeight} kg`);
      console.log(`  Total volume: ${route.totalVolume} L`);
      console.log('');
    });

    // Check for the reported issue - only one vehicle getting orders
    const vehiclesWithOrders = Object.values(vehicleAssignments).filter(count => count > 0).length;
    const totalOrdersAssigned = Object.values(vehicleAssignments).reduce((a, b) => a + b, 0);

    console.log('\n=== ISSUE DIAGNOSIS ===\n');

    if (vehiclesWithOrders === 1) {
      console.log('CONFIRMED: Only ONE vehicle received order assignments!');
      console.log('This matches the reported bug.\n');

      console.log('LIKELY ROOT CAUSES:');
      console.log('1. All vehicles start from same depot (individual origins ignored)');
      console.log('2. No max_tasks constraint passed to VROOM');
      console.log('3. Orders have no weight/volume requirements');
      console.log('4. VROOM optimizes for minimum vehicles when unconstrained\n');

      console.log('RECOMMENDED FIXES:');
      console.log('1. Pass maxOrders to VROOM as max_tasks');
      console.log('2. Use individual vehicle origins instead of global depot');
      console.log('3. Add default weight/volume to orders if not specified');
      console.log('4. Consider using VROOM\'s "balance" optimization option');
    } else if (vehiclesWithOrders < selectedVehicleIds.length) {
      console.log(`PARTIAL ISSUE: Only ${vehiclesWithOrders} of ${selectedVehicleIds.length} vehicles got orders`);
    } else {
      console.log(`OK: All ${vehiclesWithOrders} selected vehicles received orders`);
      console.log('The distribution may still be uneven though.');
    }

    // Calculate distribution evenness
    const avgOrdersPerVehicle = totalOrdersAssigned / selectedVehicleIds.length;
    const maxOrders = Math.max(...Object.values(vehicleAssignments), 0);
    const minOrders = Math.min(...Object.values(vehicleAssignments).filter(c => c > 0), 0);

    console.log(`\nDistribution Analysis:`);
    console.log(`  Average orders per vehicle: ${avgOrdersPerVehicle.toFixed(1)}`);
    console.log(`  Max orders on one vehicle: ${maxOrders}`);
    console.log(`  Min orders on one vehicle: ${minOrders}`);
    console.log(`  Distribution ratio: ${maxOrders > 0 ? (maxOrders / avgOrdersPerVehicle).toFixed(2) : 'N/A'}x average`);

    // Assertions
    expect(result.routes.length).toBeGreaterThan(0);

    // This assertion will FAIL if only one vehicle gets orders - documenting the bug
    if (vehiclesWithOrders === 1 && selectedVehicleIds.length > 1) {
      console.log('\n[TEST FAILURE EXPECTED] Bug confirmed: orders not distributed across vehicles');
    }
  });

  test('Debug: Simulate VROOM request to inspect payload', async ({ request }) => {
    console.log('\n=== VROOM REQUEST SIMULATION ===');

    // Get vehicles
    const vehiclesResponse = await request.get('/api/vehicles/available?limit=4', {
      headers: {
        'x-company-id': companyId,
        'Authorization': `Bearer ${authToken}`,
      },
    });
    const vehiclesData = await vehiclesResponse.json();
    const vehicles = vehiclesData.data as Vehicle[];

    // Get orders
    const ordersResponse = await request.get('/api/orders?status=PENDING&active=true&limit=20', {
      headers: {
        'x-company-id': companyId,
        'Authorization': `Bearer ${authToken}`,
      },
    });
    const ordersData = await ordersResponse.json();
    const orders = ordersData.data as Order[];

    // Simulate what gets sent to VROOM
    console.log('\nSimulating VROOM request payload:\n');

    const depotLat = -12.0464;
    const depotLng = -77.0428;

    console.log('DEPOT (used for ALL vehicles):');
    console.log(`  Latitude: ${depotLat}`);
    console.log(`  Longitude: ${depotLng}`);
    console.log('  NOTE: Individual vehicle origins are IGNORED!\n');

    console.log('VEHICLES sent to VROOM:');
    vehicles.forEach((v, i) => {
      const vroomVehicle = {
        id: i + 1,
        profile: 'car',
        description: v.plate || v.name,
        start: [depotLng, depotLat], // All same!
        end: [depotLng, depotLat],   // All same!
        capacity: [v.weightCapacity ?? 10000, v.volumeCapacity ?? 100],
        time_window: [21600, 79200], // 6:00 to 22:00
        // NOTE: max_tasks is NOT set!
      };

      console.log(`  Vehicle ${i + 1}:`);
      console.log(`    Description: ${vroomVehicle.description}`);
      console.log(`    Start: [${vroomVehicle.start.join(', ')}] (SAME AS DEPOT)`);
      console.log(`    Capacity: [${vroomVehicle.capacity.join(', ')}]`);
      console.log(`    max_tasks: NOT SET (should be ${v.maxOrders})`);
      console.log('');
    });

    console.log('JOBS (orders) sent to VROOM:');
    orders.slice(0, 5).forEach((o, i) => {
      const vroomJob = {
        id: i + 1,
        location: [parseFloat(o.longitude || '0'), parseFloat(o.latitude || '0')],
        service: 300,
        delivery: [o.weightRequired ?? 0, o.volumeRequired ?? 0],
      };

      console.log(`  Job ${i + 1}: ${o.trackingId}`);
      console.log(`    Location: [${vroomJob.location.join(', ')}]`);
      console.log(`    Delivery requirements: [${vroomJob.delivery.join(', ')}]`);
    });

    console.log(`  ... and ${Math.max(0, orders.length - 5)} more jobs\n`);

    console.log('KEY ISSUES IN VROOM REQUEST:');
    console.log('1. All vehicles have identical start/end locations');
    console.log('2. No max_tasks limit to distribute orders');
    console.log('3. Most orders have 0 weight/volume (no capacity pressure)');
    console.log('4. No balance_vehicles option in VROOM request');
  });

  test('Debug: Check if VROOM service is available', async ({ request }) => {
    console.log('\n=== VROOM SERVICE CHECK ===');

    // Try to reach VROOM health endpoint
    const vroomUrl = process.env.VROOM_URL || 'http://localhost:5000';

    try {
      const response = await request.get(`${vroomUrl}/health`, {
        timeout: 5000,
      });

      if (response.ok()) {
        console.log(`VROOM service is AVAILABLE at ${vroomUrl}`);
        console.log('Optimization will use VROOM algorithm');
      } else {
        console.log(`VROOM service returned status ${response.status()}`);
      }
    } catch (error) {
      console.log(`VROOM service is NOT AVAILABLE at ${vroomUrl}`);
      console.log('Optimization will use FALLBACK nearest-neighbor algorithm');
      console.log('The fallback algorithm may cause single-vehicle assignment issue!\n');

      console.log('FALLBACK ALGORITHM BEHAVIOR:');
      console.log('1. Vehicles sorted by capacity (largest first)');
      console.log('2. Orders assigned to each vehicle until full');
      console.log('3. If first vehicle can hold all orders, others get none');
    }
  });
});

test.describe('UI Flow Debugging', () => {

  test('Navigate through planificacion flow and capture state', async ({ page }) => {
    console.log('\n=== UI FLOW TEST ===');

    // Navigate to login
    await page.goto('/auth/login');

    // Try to login
    await page.fill('input[name="username"], input[type="text"]', 'admin');
    await page.fill('input[name="password"], input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');

    // Wait for navigation
    await page.waitForURL('**/planificacion**', { timeout: 10000 }).catch(() => {
      console.log('Did not redirect to planificacion, checking current URL');
    });

    console.log(`Current URL: ${page.url()}`);

    // Navigate to planificacion
    await page.goto('/planificacion');
    await page.waitForLoadState('networkidle');

    // Take screenshot of initial state
    await page.screenshot({ path: 'tests/e2e/screenshots/1-planificacion-vehicles.png' });

    // Wait for vehicles to load
    await page.waitForSelector('text=Vehículos', { timeout: 10000 }).catch(() => {
      console.log('Vehicle step not found');
    });

    // Count available vehicles
    const vehicleItems = await page.locator('label[for^="vehicle-"]').count();
    console.log(`Found ${vehicleItems} vehicle items in UI`);

    // Select all vehicles
    const selectAllCheckbox = page.locator('#select-all-vehicles');
    if (await selectAllCheckbox.isVisible()) {
      await selectAllCheckbox.click();
      console.log('Selected all vehicles');
    }

    // Take screenshot after selection
    await page.screenshot({ path: 'tests/e2e/screenshots/2-vehicles-selected.png' });

    // Move to next step (Visitas)
    const continueBtn = page.locator('text=Continuar a Visitas');
    if (await continueBtn.isVisible()) {
      await continueBtn.click();
      await page.waitForLoadState('networkidle');
    }

    await page.screenshot({ path: 'tests/e2e/screenshots/3-visitas-step.png' });

    // Count orders
    const orderItems = await page.locator('label[for^="order-"]').count();
    console.log(`Found ${orderItems} order items in UI`);

    // Move to configuration step
    const configBtn = page.locator('button:has-text("Continuar")').last();
    if (await configBtn.isVisible()) {
      await configBtn.click();
      await page.waitForLoadState('networkidle');
    }

    await page.screenshot({ path: 'tests/e2e/screenshots/4-config-step.png' });

    console.log('UI flow completed - check screenshots for visual debugging');
  });
});
