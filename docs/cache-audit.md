# Cache Layer Audit — Multi-Tenant Pre-Deploy

**Scope:** `src/lib/infra/cache.ts` (950 lines, 40+ exports), `src/lib/infra/server-cache.ts` (90 lines, in-proc LRU), `src/lib/geo/geospatial.ts` (Redis consumer).
**Audit date:** 2026-04-18
**Severity scale:** CRITICAL | HIGH | MEDIUM | LOW | OK
**Sibling report:** `docs/security-audit.md` (tenant isolation of API routes).

---

## Executive Summary

The cache layer is a **showcase façade**, not a live system. It compiles, it lints, and it exports a rich API surface (40+ functions across 9 domains, hit-rate metrics, Redis fail-open, admin warmup endpoint) — but **it is almost entirely unused by the application**. Of the 40+ exports, only **3 primitives** (`cacheGet`, `cacheSet`, `cacheDeletePattern`) and **1 helper** (`getCacheStats`) reach production request paths. The 15+ domain-specific getters/setters (`getFleetVehiclesCache`, `getPendingOrdersSummaryCache`, `setUserProfileCache`, …) have **zero callers** in `src/app/**` or `src/lib/**` outside the cache file itself. The 13 `invalidate*Cache` functions have **zero invocations from any API mutation route** — the only call site is `invalidateAllCache()` in `/api/admin/cache` DELETE.

Concretely, `grep invalidate*Cache src/app/api` returns exactly one hit: the admin nuke endpoint. No `POST /api/orders`, no `PATCH /api/vehicles/[id]`, no fleet/driver/user/alert/preset/zone mutation calls `invalidate*Cache` after writing. This is consistent only because the corresponding **set**-side functions are also unused — there is nothing cached today for those entities, so nothing stale to invalidate. The "40-function cache API" is dead code.

Despite that, the dead code carries real risk because it will be **turned on** someday by a developer who grafts `setFleetVehiclesCache(fleetId, rows)` into a GET route without realizing the mutation side was never wired. On that day, several of the cache functions have **CRITICAL** design defects (missing tenant-scoping in keys) that will leak data across tenants the first time they are used.

| Severity | Count | Typical impact if activated |
|---|---:|---|
| CRITICAL | 9 | Cross-tenant data leak via shared cache key (company-agnostic key on tenant-scoped entity) |
| HIGH | 4 | Invalidation never called on mutation paths → user-visible stale reads |
| MEDIUM | 6 | TTL misconfigured for operational data; `warmupCache` is a log stub; `invalidateCompanyCache` has a pattern bug |
| LOW | 5 | Fail-open metrics not counted as errors; dead code hygiene; thundering-herd loader; base64-keyed geocoding with no normalization cap |
| OK | 8 | Primitives and truly tenant-agnostic geocoding are safe |

**Top systemic issues:**

1. **Tenant isolation is not enforced by the key schema.** Reference caches (`vehicle_skills:v1:all`, `time_presets:v1:all`, `alert_rules:v1:all`), fleet/vehicle/driver caches (keyed by surrogate `fleetId` / `vehicleId` / `driverId` without `companyId`), user cache (`user:v1:<userId>`), job-status cache (`job:v1:<jobId>`), and plan-metrics cache (`plan_metrics:v1:<jobId>`) all cache **tenant-scoped** data using keys that lack `companyId`. An `invalidateCompanyCache(companyId)` call will leave those entries intact for the next company to read.
2. **`invalidateCompanyCache(companyId)` uses pattern `*:${companyId}`** — which only matches entries whose key **ends in** `:<companyId>`. Entries that embed `companyId` in the middle (e.g. `orders:v1:pending:<companyId>` — OK) match; entries that use `<companyId>:<id>` key layout (e.g. `geospatial:distance_matrix:${companyId}:${coordKey}`) **do not match**. Two prefix conventions coexist in the codebase.
3. **Invalidation is wired only for `invalidateAllCache` (admin-only).** No domain mutation path calls any specific `invalidate*Cache`. If the write-through caches are ever populated, every entity change leaves stale data up to TTL (2–60 min depending on prefix).
4. **`warmupCache(companyId)` is a `console.log` stub** — not a warmup. The admin `POST /api/admin/cache` returns 200 "cache warmed up" with zero work done. Medium severity today, but misleading for ops.
5. **`getRedisClient()` throws** on missing credentials. `isRedisAvailable()` catches it and sets `redisAvailable = false`, so the first uncached read path is safe — but downstream `withRedisFallback` does not catch the **construction** error path on cold start if env is missing and the initial `ping` never ran. Minor, but in a production deploy without env the app will log repeated construction failures, not a single failover.
6. **Two cache layers that don't know about each other.** `server-cache.ts` is an in-process `LRUCache` (5-min/1-min buckets) and its only current caller is `getCompanyId()` (which is per-request via `React.cache` — a distinct, safe primitive). The exported `getCached`/`invalidateCache`/`invalidateCacheByPrefix` from server-cache are also unused, but if they are adopted later they introduce a **second** multi-tenant footgun: `LRUCache` is **not tenant-aware** and lives in the Node process — on Vercel (multi-instance), one process caches a read for tenant A, the next tenant-B request on the same process returns A's row unless the caller bakes `companyId` into the key.

**Deploy gate recommendation:** the cache layer is **safe to ship as-is** (because it is not wired) **provided** one of the following is true before the next release:
- Option A: delete the 30+ unused exports to prevent future-developer footguns (preferred — least risk, largest LOC reduction).
- Option B: fix the CRITICAL tenant-key defects in place and wire the invalidation calls into mutation routes (larger change, requires test coverage).

Do not mix: do not leave the dead exports in place and start consuming them piecemeal without first fixing the key shapes.

---

## D1 — Tenant Isolation Matrix (one row per exported cache function)

Legend:
- **Key shape:** the literal Redis key template.
- **Tenant-scoped data?** Would two companies ever hold different values for the same surrogate ID?
- **Verdict:** OK | MISSING_TENANT_KEY (CRITICAL) | TENANT_AGNOSTIC_BY_DESIGN | UNUSED (context).

| # | Function | Key shape | Tenant-scoped? | Verdict | Severity |
|---|---|---|---|---|---|
| 1 | `cacheGet` / `cacheSet` / `cacheDelete` / `cacheDeletePattern` / `cacheGetOrSet` | *caller-supplied* | *caller's responsibility* | OK (primitive) | OK |
| 2 | `getGeocodingFromCache` / `setGeocodingCache` | `geo:v1:<base64(address)>` | NO — an address string resolves to the same lat/lng regardless of tenant | TENANT_AGNOSTIC_BY_DESIGN | OK |
| 3 | `invalidateGeocodingCache(address)` / `invalidateAllGeocodingCache()` | matches `geo:v1:*` | n/a | OK | OK |
| 4 | `getVehicleSkillsCache` / `setVehicleSkillsCache` | `vehicle_skills:v1:all` | **YES** — `vehicleSkills.companyId` exists in schema; each tenant has its own skill catalog | **MISSING_TENANT_KEY** | **CRITICAL** |
| 5 | `invalidateVehicleSkillsCache` | pattern `vehicle_skills:v1:*` | n/a but never called from mutation routes | HIGH (invalidation orphan) | HIGH |
| 6 | `getTimeWindowPresetsCache` / `setTimeWindowPresetsCache` | `time_presets:v1:all` | **YES** — time window presets are per-tenant | **MISSING_TENANT_KEY** | **CRITICAL** |
| 7 | `invalidateTimeWindowPresetsCache` | pattern `time_presets:v1:*` | n/a | HIGH (orphan) | HIGH |
| 8 | `getAlertRulesCache` / `setAlertRulesCache` | `alert_rules:v1:all` | **YES** — alert rules are per-tenant | **MISSING_TENANT_KEY** | **CRITICAL** |
| 9 | `invalidateAlertRulesCache` | pattern `alert_rules:v1:*` | n/a | HIGH (orphan) | HIGH |
| 10 | `getUserProfileCache(userId)` / `setUserProfileCache(userId, …)` | `user:v1:<userId>` | partially — `userId` is unique globally, so no cross-tenant collision on **key**, but the cached payload likely has `companyId` and `role`. On company switch (ADMIN_SISTEMA), the cached profile is fine; on permission change it can leak stale authz. | OK on key; potential stale-authz issue | MEDIUM |
| 11 | `invalidateUserCache(userId)` | deletes `user:v1:<userId>` + permissions + roles | OK | OK | OK |
| 12 | `getFleetVehiclesCache(fleetId)` / `setFleetVehiclesCache` | `fleet_vehicles:v1:<fleetId>` | **YES** — `fleetId` UUIDs are globally unique, so no two companies share a key, **but** this is only safe by accident of UUID collision resistance. A code path that takes a fleet-scoped slug or short-id (e.g. a future "FLEET-001" per tenant) will silently collide. | Accidentally-OK (fragile) | **MEDIUM** (hardens to CRITICAL if ever re-keyed) |
| 13 | `getFleetDriversCache(fleetId)` / `setFleetDriversCache` | `fleet_drivers:v1:<fleetId>` | same as #12 | Accidentally-OK | MEDIUM |
| 14 | `invalidateFleetCache(fleetId)` | deletes 3 keys by `fleetId` | OK on the key, but does **not** know about the owning `companyId`, so `invalidateCompanyCache(companyId)` cannot reach these entries | HIGH (orphan from company-scope invalidation) | HIGH |
| 15 | `invalidateVehicleCache(vehicleId)` | deletes `vehicle:v1:<vehicleId>` | same fragility as #12 | MEDIUM | MEDIUM |
| 16 | `invalidateDriverCache(driverId)` | deletes `driver:v1:<driverId>` | same | MEDIUM | MEDIUM |
| 17 | `getPendingOrdersSummaryCache(companyId)` / `setPendingOrdersSummaryCache` | `orders:v1:pending:<companyId>` | YES, and key is tenant-scoped | **OK** | OK |
| 18 | `invalidateOrdersCache(companyId)` | pattern `orders:v1:*:<companyId>` | matches the `:pending:<companyId>` entry and any future `:X:<companyId>` entries ending in `:<companyId>`. **Does not** match entries of shape `orders:v1:<companyId>:X`. | OK for current schema; fragile for future keys | LOW |
| 19 | `getJobStatusCache(jobId)` / `setJobStatusCache` | `job:v1:<jobId>` | **YES** — `optimizationJobs.companyId` exists; if two companies' cache hits on the same jobId (UUID collision resistance protects, but the cached payload includes cross-tenant job state) | Accidentally-OK on UUID key; bad practice | MEDIUM |
| 20 | `invalidateJobStatusCache(jobId)` | deletes `job:v1:<jobId>` | OK | OK | OK |
| 21 | `getMonitoringSummaryCache(companyId)` / `setMonitoringSummaryCache` | `monitor:v1:<companyId>` | YES, tenant-scoped key | **OK** | OK |
| 22 | `getDriverStatusCache(driverId)` / `setDriverStatusCache` | `driver_status:v1:<driverId>` | accidentally-OK | MEDIUM | MEDIUM |
| 23 | `invalidateMonitoringCache(companyId)` | deletes `monitor:v1:<companyId>` + pattern `alerts:v1:*:<companyId>` | OK for monitor; fragile for alerts (never set anywhere) | LOW | LOW |
| 24 | `getPlanMetricsCache(jobId)` / `setPlanMetricsCache` | `plan_metrics:v1:<jobId>` | **YES** — plan metrics belong to a tenant's job; cached payload includes cross-tenant KPIs | Accidentally-OK on UUID | MEDIUM |
| 25 | `invalidateMetricsCache(jobId?)` | deletes `plan_metrics:v1:<jobId>` or pattern `plan_metrics:v1:*` | OK but pattern-flush wipes all tenants | LOW | LOW |
| 26 | `invalidateCompanyCache(companyId)` | pattern `*:<companyId>` | **Only matches keys ending in `:<companyId>`.** Does **not** match: `user:v1:<userId>`, `fleet_vehicles:v1:<fleetId>`, `vehicle:v1:<vehicleId>`, `driver:v1:<driverId>`, `job:v1:<jobId>`, `plan_metrics:v1:<jobId>`, `vehicle_skills:v1:all`, `time_presets:v1:all`, `alert_rules:v1:all`, `geospatial:distance_matrix:<companyId>:<coordKey>` (middle-position). So "nuke this tenant" misses ~70% of prefixes. | **INCOMPLETE** | **MEDIUM (→ HIGH once caches are populated)** |
| 27 | `invalidateAllCache()` | pattern `*` | Matches everything | OK | OK |
| 28 | `warmupCache(companyId)` | `console.log(...)` no-op | n/a | **Stub** | MEDIUM |
| 29 | `isRedisAvailable` / `getCacheMetrics` / `getCacheHitRate` / `resetCacheMetrics` / `getCacheStats` | n/a | n/a | OK | OK |
| 30 | `calculateDistanceMatrix(coords, companyId)` in `geospatial.ts` | `geospatial:distance_matrix:<companyId>:<coordKey>` | YES, tenant-scoped key | **OK on key**, but: **no caller anywhere in src/** invokes this function, so the cache entry is never written. `invalidateDistanceCache` is a no-op stub. | UNUSED / OK-if-used | LOW |
| 31 | `getCached` / `invalidateCache` / `invalidateCacheByPrefix` (server-cache.ts) | caller-supplied key in a process-local `LRUCache` | **n/a — callers must bake `companyId` into the key** | Not tenant-aware by construction | LOW (unused today) / HIGH (if adopted blind) |
| 32 | `getCompanyId()` (server-cache.ts) | `React.cache` per-request | per-request; returns JWT's `companyId` | OK | OK |

**Counts:**
- CRITICAL (MISSING_TENANT_KEY on tenant-scoped data): **3** functions directly (#4, #6, #8), plus **6** fragile-by-convention functions (#12, #13, #15, #16, #19, #22, #24 — total 7 here; #10 is MEDIUM).
- HIGH (orphan invalidation): **4** (#5, #7, #9, #14).
- MEDIUM (pattern bug / stub / fragile): **6** (#10, #15, #16, #19, #22, #24, #26, #28 — accounting overlap).
- OK: **8** primitives + geocoding + monitoring-summary + orders-summary.

---

## D2 — Mutation × Invalidation Matrix

**Methodology:** `grep -rn "invalidate.*Cache" src/app/api` returns **only** `invalidateAllCache` from `/api/admin/cache/route.ts:54`. No per-entity invalidation is wired.

For each tenant-scoped entity, the table below lists the mutation endpoints that exist, the `invalidate*Cache()` function that *should* be called, and the actual state.

| Entity | Mutation endpoint | Method | Corresponding invalidator | Called? | Severity |
|---|---|---|---|---|---|
| orders | `src/app/api/orders/route.ts` | POST | `invalidateOrdersCache(companyId)` | **NO** | HIGH (if cache wired) |
| orders | `src/app/api/orders/[id]/route.ts` | PATCH | `invalidateOrdersCache(companyId)` | **NO** | HIGH |
| orders | `src/app/api/orders/[id]/route.ts` | DELETE | `invalidateOrdersCache(companyId)` | **NO** | HIGH |
| orders | `src/app/api/orders/batch/route.ts` | POST | `invalidateOrdersCache(companyId)` | **NO** | HIGH |
| orders | `src/app/api/orders/batch/delete/route.ts` | POST | `invalidateOrdersCache(companyId)` | **NO** | HIGH |
| orders | `src/app/api/orders/import/route.ts` | POST | `invalidateOrdersCache(companyId)` | **NO** | HIGH |
| orders | `src/app/api/orders/validate/route.ts` | POST (writes?) | `invalidateOrdersCache(companyId)` | **NO** | LOW (read-only) |
| vehicles | `src/app/api/vehicles/route.ts` | POST | `invalidateVehicleCache(vehicleId)` + owning fleet | **NO** | HIGH |
| vehicles | `src/app/api/vehicles/[id]/route.ts` | PATCH / DELETE | same | **NO** | HIGH |
| vehicles | `src/app/api/vehicles/[id]/skills/route.ts` | POST / DELETE | `invalidateVehicleCache(vehicleId)` | **NO** | HIGH |
| fleets | `src/app/api/fleets/route.ts` | POST | `invalidateFleetCache(fleetId)` | **NO** | HIGH |
| fleets | `src/app/api/fleets/[id]/route.ts` | PATCH / DELETE | same | **NO** | HIGH |
| fleets | `src/app/api/fleets/[id]/vehicles/route.ts` | POST | `invalidateFleetCache(fleetId)` | **NO** | HIGH |
| drivers | `src/app/api/users/[id]/route.ts` (role=CONDUCTOR) | PATCH / DELETE | `invalidateDriverCache(driverId)` | **NO** | HIGH |
| users | `src/app/api/users/route.ts` | POST | `invalidateUserCache(userId)` | **NO** (new user has no prior cache) | LOW |
| users | `src/app/api/users/[id]/route.ts` | PATCH / DELETE | `invalidateUserCache(userId)` | **NO** | **HIGH** (auth/role cached — stale permissions) |
| users | `src/app/api/users/[id]/roles/route.ts` | PUT | `invalidateUserCache(userId)` | **NO** | **HIGH** |
| users | `src/app/api/users/import/route.ts` | POST | per-user `invalidateUserCache` | **NO** | LOW |
| alerts | `src/app/api/alerts/route.ts` | POST | `invalidateMonitoringCache(companyId)` | **NO** | HIGH |
| alerts | `src/app/api/alerts/[id]/acknowledge/route.ts` | POST | same | **NO** | HIGH |
| alerts | `src/app/api/alerts/[id]/dismiss/route.ts` | POST | same | **NO** | HIGH |
| alertRules | `src/app/api/alerts/rules/route.ts` | POST | `invalidateAlertRulesCache()` | **NO** | HIGH |
| alertRules | `src/app/api/alerts/rules/[id]/route.ts` | PATCH / DELETE | same | **NO** | HIGH |
| vehicleSkills | `src/app/api/vehicle-skills/route.ts` | POST | `invalidateVehicleSkillsCache()` | **NO** | HIGH |
| vehicleSkills | `src/app/api/vehicle-skills/[id]/route.ts` | PATCH / DELETE | same | **NO** | HIGH |
| userSkills | `src/app/api/user-skills/route.ts` | POST | (no dedicated cache) | n/a | OK |
| userSkills | `src/app/api/user-skills/[id]/route.ts` | PATCH / DELETE | (none) | n/a | OK |
| timeWindowPresets | `src/app/api/time-window-presets/route.ts` | POST | `invalidateTimeWindowPresetsCache()` | **NO** | HIGH |
| timeWindowPresets | `src/app/api/time-window-presets/[id]/route.ts` | PATCH / DELETE | same | **NO** | HIGH |
| optimizationPresets | `src/app/api/optimization-presets/route.ts` | POST | (no cache defined, though prefix exists) | n/a | LOW |
| optimizationPresets | `src/app/api/optimization-presets/[id]/route.ts` | PATCH / DELETE | same | n/a | LOW |
| zones | `src/app/api/zones/route.ts` | POST | (no cache) | n/a | OK |
| zones | `src/app/api/zones/[id]/route.ts` | PATCH / DELETE | same | n/a | OK |
| zones | `src/app/api/zones/[id]/vehicles/route.ts` | POST / DELETE | (should invalidate vehicle + zone) | n/a | LOW |
| companyFieldDefinitions | `src/app/api/companies/[id]/field-definitions/route.ts` | POST | (no dedicated cache) | n/a | OK |
| companyFieldDefinitions | `src/app/api/companies/[id]/field-definitions/[fieldId]/route.ts` | PATCH / DELETE | same | n/a | OK |
| optimizationJobs | `src/app/api/optimization/jobs/route.ts` | POST | `invalidateJobStatusCache(jobId)` on completion | **NO** | MEDIUM |
| optimizationJobs | `src/app/api/optimization/jobs/[id]/confirm/route.ts` | GET (mutates) | `invalidateJobStatusCache + invalidateOrdersCache` | **NO** | HIGH |
| optimizationJobs | `src/app/api/optimization/jobs/[id]/reassign/route.ts` | POST | `invalidateJobStatusCache + invalidateOrdersCache + invalidateMetricsCache` | **NO** | HIGH |
| optimizationJobs | `src/app/api/optimization/jobs/[id]/swap-vehicles/route.ts` | POST | `invalidateJobStatusCache + invalidateMonitoringCache` | **NO** | HIGH |
| tracking | `src/app/api/tracking/settings/route.ts` | PATCH | (no cache) | n/a | OK |
| reassignment | `src/app/api/reassignment/execute/route.ts` | POST | `invalidateOrdersCache + invalidateMonitoringCache + invalidateJobStatusCache` | **NO** | HIGH |

**Summary:** zero mutation paths invalidate anything. This is **NOT** a live staleness bug today (the set-side caches are also not populated), but it is a **LOADED GUN**: the moment a future PR adds `setFleetVehiclesCache(...)` inside `GET /api/fleets/[id]/vehicles`, every write endpoint above becomes a staleness bug.

Order of magnitude, this means **~40 invalidation call sites are missing** across the mutation surface.

---

## D3 — TTL Table

| Constant | Value | Data type | Mutation frequency | Assessment |
|---|---:|---|---|---|
| `SESSION` | 7 days | session tokens | login/logout bounded | OK — matched to refresh-token lifetime |
| `GEOCODING` | 30 days | lat/lng of an address | essentially immutable | OK — geocoding rarely changes, 30 d is correct |
| `REFERENCE_DATA` | 1 h | vehicle_skills, time_window_presets, alert_rules | low (admin-configured) | OK on TTL; but see tenant-key CRITICALs above |
| `USER_DATA` | 15 min | user profile, permissions, roles | low, but security-sensitive | **MEDIUM** — 15 min of stale permissions after role change is long for a pre-deploy system. Recommend **5 min** or explicit invalidation on role mutation (see D2) |
| `OPERATIONAL_DATA` | 5 min | fleet vehicles/drivers lists | medium | OK-ish if invalidation is wired; **too long** without invalidation (a just-added vehicle invisible for 5 min) |
| `PLANNING_DATA` | 2 min | orders summaries, job status | high during planning | **MEDIUM** — "I just imported 500 orders and they don't appear in the summary for 2 min" is a bad UX. Recommend **30 s** or invalidation on mutation |
| `REALTIME_DATA` | 30 s | monitoring summaries, driver status | high | OK |
| `METRICS` | 60 s | plan metrics | medium | OK |
| `OPTIMIZATION_RESULTS` | 10 min | opt results | immutable per input-hash | OK — `optimizationJobs.inputHash` dedupe in `job-queue.ts:getCachedResult` is DB-backed anyway, doesn't use this constant |

**Recommendations:**
- **PLANNING_DATA: 2 min → 30 s** *or* implement invalidation on order CRUD (D2). Orders are the single most visible entity; 2-minute staleness on a pending-orders summary is a support ticket waiting to happen.
- **USER_DATA: 15 min → 5 min.** Permission caches must not outlast half a support session.
- **OPERATIONAL_DATA: add invalidation, don't rely on TTL.** A 5-minute staleness on "vehicles in this fleet" shows up immediately on the planning screen after vehicle add.

---

## D4 — Race Condition Analysis

### `cacheGetOrSet` — thundering herd (`cache.ts:398-416`)

```ts
export async function cacheGetOrSet<T>(key, factory, ttl) {
  const cached = await cacheGet<T>(key);
  if (cached !== null) return cached;
  const value = await factory();          //  ← N concurrent callers all run this
  await cacheSet(key, value, ttl);
  return value;
}
```

**Problem:** classical dogpile. Under a cold-cache burst, `N` concurrent readers all see `cached === null`, all run `factory()` (expensive — typically a DB query), all call `cacheSet`. The **last** `cacheSet` wins, and there is no distributed lock (`SETNX`-style or `Redis.eval` with NX+EX) to serialize.

**Severity:** LOW today (no callers), MEDIUM if ever adopted on a hot read path. For the actual planning/optimization workloads in this app the factory cost (DB query of 5 k orders) can be 200–500 ms; a herd of 20 concurrent callers multiplies that to 10 s of DB pressure before the first cache entry lands.

**Fix (suggested):**

```ts
export async function cacheGetOrSet<T>(key, factory, ttl) {
  const cached = await cacheGet<T>(key);
  if (cached !== null) return cached;

  // Try to acquire a short-lived per-key lock
  const lockKey = `${key}:lock`;
  const lockAcquired = await withRedisFallback(
    (r) => r.set(lockKey, "1", { nx: true, ex: 10 }),
    () => null,
  );

  if (!lockAcquired) {
    // Someone else is computing — briefly wait and retry cache, or fall through to factory
    await new Promise((r) => setTimeout(r, 100));
    const retry = await cacheGet<T>(key);
    if (retry !== null) return retry;
    // fall through: compute anyway, but the stampede is already bounded
  }

  try {
    const value = await factory();
    await cacheSet(key, value, ttl);
    return value;
  } finally {
    if (lockAcquired) await cacheDelete(lockKey);
  }
}
```

### Set-vs-invalidate ordering

There is **no** mutation path currently doing `cacheSet` after a write, so there is no set/invalidate ordering bug today. If the pattern `mutate → setX → return` is ever adopted, the standard write-through pattern applies: **invalidate before and after the write**, don't set inside the write path (because a concurrent read can set the old value between your write and your set). Reads should re-populate on next miss.

### `getGeocodingFromCache` — concurrent geocode

Two concurrent identical-address geocodes will both miss, both call the underlying geocoder (cost-bearing external API), and both set. Thundering herd applies, but `setGeocodingCache` is idempotent (address → result is a function), so correctness is preserved — only cost is wasted. LOW.

### `isRedisAvailable` race

`redisAvailable` is a module-local flag. Concurrent callers during the 30-second reconnect window all skip Redis. This is benign. `reconnectTimeout` is guarded by a null-check but not atomically, so under extreme concurrency two timeouts could be scheduled — still benign (idempotent reset).

---

## D5 — Error Handling / Availability

### Fail-open analysis

`withRedisFallback` (`cache.ts:178-196`):

```ts
async function withRedisFallback<T>(operation, fallback): Promise<T> {
  try {
    if (!(await isRedisAvailable())) return fallback();
    const redis = getRedisClient();
    return await operation(redis);
  } catch (error) {
    console.warn("[Cache] Redis operation failed:", ...);
    return fallback();
  }
}
```

**Behavior:**
- On Redis unavailable: `cacheGet` returns `null` (→ miss → factory runs → fresh data served). **Fail-open, desirable.**
- On Redis error mid-operation: same. Fresh data served.
- `cacheSet` on failure: silently no-ops. Next read misses and recomputes. OK.
- `cacheDelete` on failure: silently no-ops. **Stale data can survive a Redis blip if invalidation was the trigger.** This is usually acceptable — you were going to rely on TTL for the worst case anyway — but pair it with monitoring alerts.

**Silent cross-tenant risk via Redis failure?** No. The fallback path returns `null`/no-op; there is no code path where a Redis failure causes one tenant's data to be returned to another tenant. The cross-tenant risk lives in the **key shapes** (D1), not the error path.

### `getRedisClient()` error on missing env

`cache.ts:124` — throws `"Upstash Redis credentials not configured"` synchronously at first use. This is caught by `isRedisAvailable()`'s try/catch (`cache.ts:151-172`), which then sets `redisAvailable = false` for 30 s. **But** `withRedisFallback` calls `isRedisAvailable()` first, so the construction error is funneled correctly. **OK**.

Caveat: `getCacheStats()` calls `isRedisAvailable()` every request. If env is unset, every admin call to `GET /api/admin/cache` logs a warning. LOW hygiene issue.

### `_recordError` is unused

`cache.ts:249` — `_recordError()` exists but is never called inside the fallback handler. The fallback paths should increment `metrics.errors` so `getCacheStats` reports the true error count. LOW.

---

## D6 — `warmupCache` & `invalidateCompanyCache` Coverage

### `warmupCache(companyId)` — `cache.ts:922-931`

```ts
export async function warmupCache(companyId: string): Promise<void> {
  console.log(`[Cache] Warmed up cache for company ${companyId}`);
}
```

**It is a no-op.** The admin endpoint `POST /api/admin/cache` logs the warmup message, returns 200, and **no cache entries are populated**. The docstring above the function even says "Implementation would call the respective setters after fetching from the database" — an explicit TODO that shipped. **MEDIUM.**

Impact if left as-is:
- Misleading admin UX: "warmup succeeded" with zero effect.
- Any future "first-request latency" SLO breach around tenant activation will be attributed elsewhere.
- If warmup is ever implemented, the author must remember to call **all** set-side functions for per-company caches. The function has no enforcement/registration mechanism — it is purely imperative — so it will drift from the cache-key inventory every time a new cache type is added.

**Recommended fix (choose one):**
- **A.** Delete `warmupCache` and the `POST /api/admin/cache` endpoint (simpler — you have no warmup logic).
- **B.** Implement it and, critically, add a **registry pattern**:

```ts
// In cache.ts
type WarmupHandler = (companyId: string) => Promise<void>;
const warmupHandlers: WarmupHandler[] = [];
export function registerWarmupHandler(h: WarmupHandler) { warmupHandlers.push(h); }

export async function warmupCache(companyId: string): Promise<void> {
  await Promise.all(warmupHandlers.map((h) => h(companyId).catch((e) =>
    console.error("[Cache] Warmup handler failed:", e))));
}
```

Each cache section (orders, fleets, alerts, …) then self-registers its warmup function. New cache types cannot silently miss warmup because the section file owns its registration.

### `invalidateCompanyCache(companyId)` — `cache.ts:905-907`

```ts
export async function invalidateCompanyCache(companyId: string): Promise<void> {
  await cacheDeletePattern(`*:${companyId}`);
}
```

**This is incomplete.** The glob `*:<companyId>` matches only keys where `<companyId>` is the **last** colon-delimited segment. Reviewing the key inventory:

| Key template | Matches `*:<companyId>`? |
|---|:-:|
| `geo:v1:<base64>` | N/A (tenant-agnostic) |
| `vehicle_skills:v1:all` | NO |
| `time_presets:v1:all` | NO |
| `alert_rules:v1:all` | NO |
| `user:v1:<userId>` | NO |
| `company:v1:<id>` | YES (coincidentally) |
| `fleet:v1:<fleetId>` | NO |
| `vehicle:v1:<vehicleId>` | NO |
| `driver:v1:<driverId>` | NO |
| `fleet_vehicles:v1:<fleetId>` | NO |
| `fleet_drivers:v1:<fleetId>` | NO |
| `orders:v1:pending:<companyId>` | **YES** |
| `route:v1:<?>` | unknown (no setter exists) |
| `job:v1:<jobId>` | NO |
| `monitor:v1:<companyId>` | **YES** |
| `driver_status:v1:<driverId>` | NO |
| `alerts:v1:*:<companyId>` | **YES** (if ever set) |
| `metrics:v1:<?>` | unknown |
| `plan_metrics:v1:<jobId>` | NO |
| `opt_result:v1:<?>` | unknown |
| `geospatial:distance_matrix:<companyId>:<coordKey>` | NO (middle position) |

Result: **4 of ~20** key families match. The function advertises "invalidate all cache for a specific company" but would leave **~80%** of that company's entries intact.

**Fix:** make the function explicitly call each per-company invalidator:

```ts
export async function invalidateCompanyCache(companyId: string): Promise<void> {
  await Promise.all([
    invalidateOrdersCache(companyId),
    invalidateMonitoringCache(companyId),
    invalidateVehicleSkillsCache(),      // (after tenant-keying fix)
    invalidateTimeWindowPresetsCache(),  // idem
    invalidateAlertRulesCache(),         // idem
    // + iterate fleet/vehicle/driver IDs for this company
    //   (this is the argument for baking companyId into every tenant-scoped key)
  ]);
}
```

…but the **real** fix is to make every tenant-scoped key **contain `companyId`** at a fixed position so a single pattern (`*:<companyId>:*` or `<prefix>:<companyId>:*`) covers all of them. See Remediation Plan.

---

## D7 — `server-cache.ts` (in-proc LRU)

**What it does:**
- Exports `getCompanyId()` — a `React.cache`-wrapped cookie/JWT read. This is a **per-request** cache (React's request-scoped memoization), not a cross-request one. **Safe**.
- Exports `getCached(key, fetcher, options)` using `lru-cache` — a **process-local** cache with 5-min (entity) or 1-min (short) TTL.
- Exports `invalidateCache(key)`, `invalidateCacheByPrefix(prefix)`, `clearAllCaches()`.

**Consumers (actual):**
- `getCompanyId` is consumed by `src/app/(protected)/dashboard/page.tsx:27`. Just this one place. This is per-request memoization of the JWT payload — correct usage, no tenant risk (returns the current user's own `companyId`).
- `getCached` / `invalidateCache` / `invalidateCacheByPrefix` / `clearAllCaches` — **zero consumers**. Dead code.

**Findings:**

1. **`getCached` is not tenant-aware.** `LRUCache<string, any>` keyed purely by caller-supplied `key`. If a caller writes `getCached("pending-orders", …)` without baking `companyId` into the key, tenant A and tenant B share the same entry on a given Node worker. HIGH if ever adopted. The current dead-code state is LOW.

2. **`clearAllCaches()` is one process only.** On Vercel, a serverless deploy spawns many Node isolates. Calling `clearAllCaches()` on one isolate does not affect the others. Any future code relying on this for consistency between requests will silently fail at multi-instance scale. **MEDIUM** if adopted.

3. **Implicit layering with Redis is undefined.** If `getCached(..., fetcher)` is used and `fetcher` itself reads Redis via `cacheGet`, you create a two-layer cache where:
   - Invalidating Redis does **not** invalidate the in-proc LRU.
   - An in-proc LRU hit serves stale data for up to 5 min across multiple Redis-invalidation cycles.
   This is the **classic multi-layer cache invalidation problem**. The two layers must share a versioning key (a monotonic counter, or an event-bus fan-out) for correctness. Today, neither layer is in use, so the problem is latent.

4. **No tenant-aware hygiene**: no helper like `tenantKey(companyId, rawKey)` exists to force the pattern.

**Recommendation:** either delete `getCached` / `invalidateCache` / `invalidateCacheByPrefix` / `clearAllCaches` (preferred — they have no consumers), or rewrite the API to take `companyId` as a required argument:

```ts
export async function getCached<T>(
  companyId: string,
  key: string,
  fetcher: () => Promise<T>,
  options: { ttl?: "short" | "normal" } = {},
): Promise<T> {
  const scopedKey = `${companyId}::${key}`;
  // …
}
export function invalidateByCompany(companyId: string): void {
  invalidateCacheByPrefix(`${companyId}::`);
}
```

---

## Findings Catalogue (ranked)

### CRITICAL

- **C1. `vehicle_skills:v1:all` key is missing `companyId`.** `cache.ts:493, 501, 511`. If ever populated, tenant A's skill catalog will be served to tenant B on a cache hit. *Note: currently unused.*
- **C2. `time_presets:v1:all` key is missing `companyId`.** `cache.ts:518, 528, 538`. Same.
- **C3. `alert_rules:v1:all` key is missing `companyId`.** `cache.ts:545, 553, 563`. Same.
- **C4–C9. Surrogate-ID-only keys (`fleet`, `fleet_vehicles`, `fleet_drivers`, `vehicle`, `driver`, `driver_status`, `job`, `plan_metrics`).** Each cache keys on a UUID that is globally unique and thus *accidentally* tenant-safe — until (a) a future developer replaces UUIDs with tenant-scoped slugs, or (b) the cached payload is composed across tenants. Design defect even if not exploitable today.

### HIGH

- **H1. No API mutation path invalidates any cache** (`docs/cache-audit.md` §D2). 40+ missing invalidation call sites.
- **H2. `user:v1:<userId>` stale authorization payload** on role change. `src/app/api/users/[id]/route.ts` and `/roles/route.ts` do not call `invalidateUserCache`. A PLANIFICADOR demoted to CONDUCTOR retains PLANIFICADOR permissions in cache for up to 15 min. *Mitigated today only because the cache is never populated.*
- **H3. `server-cache.ts` `getCached` is not tenant-aware.** Will leak across tenants on adoption.
- **H4. Orphan invalidators** (`invalidateVehicleSkillsCache`, `invalidateTimeWindowPresetsCache`, `invalidateAlertRulesCache`, `invalidateFleetCache`): defined, never called from any mutation route.

### MEDIUM

- **M1. `invalidateCompanyCache(companyId)` pattern `*:${companyId}` misses ~80% of tenant-scoped key families.** `cache.ts:906`.
- **M2. `warmupCache(companyId)` is a `console.log` stub.** `cache.ts:922-931`. Returns 200 from admin endpoint.
- **M3. `CACHE_TTL.PLANNING_DATA` = 2 min is too long** given no invalidation is wired.
- **M4. `CACHE_TTL.USER_DATA` = 15 min is too long** for stale authorization.
- **M5. `server-cache.ts` `clearAllCaches` is process-local** on multi-instance deploys.
- **M6. Two cache layers have no co-invalidation strategy** (`cache.ts` Redis + `server-cache.ts` LRU).

### LOW

- **L1. `cacheGetOrSet` thundering-herd.** No per-key lock.
- **L2. Geocoding cache uses `Buffer.from(normalized).toString("base64")` key** with no length cap. Long addresses make long keys; Redis keys over 512 MB are theoretical but keys that long are wasteful. Use `crypto.createHash("sha256").update(normalized).digest("hex")` instead.
- **L3. `_recordError` is defined but never invoked.** Fail-open paths should increment error metric.
- **L4. `calculateDistanceMatrix` + `invalidateDistanceCache` are disconnected** — the invalidator is a stub, but since no route actually calls `calculateDistanceMatrix` this is dead code.
- **L5. 30+ exported cache functions have zero consumers** — maintenance burden and future footgun.

### OK

- Primitives `cacheGet` / `cacheSet` / `cacheDelete` / `cacheDeletePattern`.
- Geocoding cache (tenant-agnostic by design — an address's lat/lng is a function of the address).
- `getMonitoringSummaryCache` + `getPendingOrdersSummaryCache` (correctly tenant-keyed).
- `invalidateAllCache()` (admin emergency).
- `getCompanyId` in `server-cache.ts` (React per-request cache, correct primitive).
- Redis fail-open behavior (`withRedisFallback` returns null → factory → fresh data).
- Session cache delegated to `session.ts` (out of scope, treated as trusted).

---

## Remediation Plan (prioritized)

Pick ONE of the two strategies below. Do not mix.

### Strategy A — Delete the dead code (recommended for pre-deploy)

The cache layer is not on any request path. Ship the app without it, re-introduce deliberately when a profiling finding justifies a specific cache.

**Actions:**
1. **Delete** from `cache.ts`:
   - All domain getters/setters with zero callers: `getVehicleSkillsCache`, `setVehicleSkillsCache`, `invalidateVehicleSkillsCache`, `getTimeWindowPresetsCache`, `setTimeWindowPresetsCache`, `invalidateTimeWindowPresetsCache`, `getAlertRulesCache`, `setAlertRulesCache`, `invalidateAlertRulesCache`, `getUserProfileCache`, `setUserProfileCache`, `invalidateUserCache`, `getFleetVehiclesCache`, `setFleetVehiclesCache`, `getFleetDriversCache`, `setFleetDriversCache`, `invalidateFleetCache`, `invalidateVehicleCache`, `invalidateDriverCache`, `getPendingOrdersSummaryCache`, `setPendingOrdersSummaryCache`, `invalidateOrdersCache`, `getJobStatusCache`, `setJobStatusCache`, `invalidateJobStatusCache`, `getMonitoringSummaryCache`, `setMonitoringSummaryCache`, `getDriverStatusCache`, `setDriverStatusCache`, `invalidateMonitoringCache`, `getPlanMetricsCache`, `setPlanMetricsCache`, `invalidateMetricsCache`, `invalidateCompanyCache`, `warmupCache`, `invalidateAllGeocodingCache`.
   - Keep: `cacheGet`, `cacheSet`, `cacheDelete`, `cacheDeletePattern`, `cacheGetOrSet`, `getGeocodingFromCache`, `setGeocodingCache`, `invalidateGeocodingCache`, `isRedisAvailable`, metrics functions, `getCacheStats`, `invalidateAllCache`.
2. **Delete** `POST /api/admin/cache/warmup` branch.
3. **Delete** unused exports in `server-cache.ts`: `getCached`, `invalidateCache`, `invalidateCacheByPrefix`, `clearAllCaches`. Keep: `getCompanyId` (one caller).
4. Net LOC removed: ~350 of 1040. Risk surface reduced to: (a) primitives, (b) geocoding (which is tenant-safe by design), (c) admin nuke endpoint.

### Strategy B — Wire it up correctly (if caching is a perf requirement)

**Phase 1 — fix key shapes** (no behavior change because nothing reads these yet):

1. **`cache.ts:493, 501, 511`** — `vehicleSkills`:
   ```ts
   export async function getVehicleSkillsCache(companyId: string): Promise<unknown | null> {
     return cacheGet(`${CACHE_PREFIXES.VEHICLE_SKILLS}${companyId}:all`);
   }
   export async function setVehicleSkillsCache(companyId: string, skills: unknown): Promise<void> {
     await cacheSet(`${CACHE_PREFIXES.VEHICLE_SKILLS}${companyId}:all`, skills, CACHE_TTL.REFERENCE_DATA);
   }
   export async function invalidateVehicleSkillsCache(companyId: string): Promise<void> {
     await cacheDeletePattern(`${CACHE_PREFIXES.VEHICLE_SKILLS}${companyId}:*`);
   }
   ```
2. **`cache.ts:518-538`** — same pattern for `timeWindowPresets`.
3. **`cache.ts:545-563`** — same for `alertRules`.
4. **`cache.ts:618-697`** — add `companyId` as a required argument on every fleet/vehicle/driver cache function, and rekey to `${PREFIX}${companyId}:${id}`.
5. **`cache.ts:746-775`** — same for `jobStatus`: `${CACHE_PREFIXES.JOB_STATUS}${companyId}:${jobId}`.
6. **`cache.ts:859-892`** — same for `planMetrics`.
7. **Standardize key layout: `<prefix>:<version>:<companyId>:<rest>`** for every tenant-scoped cache. Then `invalidateCompanyCache` becomes:
   ```ts
   export async function invalidateCompanyCache(companyId: string): Promise<void> {
     // With standardized <prefix>:v1:<companyId>:<rest> layout:
     await cacheDeletePattern(`*:v1:${companyId}:*`);
     await cacheDeletePattern(`*:v1:${companyId}`);  // for keys ending exactly at companyId
   }
   ```

**Phase 2 — wire invalidation** on every mutation listed in D2.

Recommended pattern: centralize invalidation in the Drizzle repository layer so route handlers don't have to remember. Example:

```ts
// src/lib/repositories/orders.ts
export async function createOrder(input: NewOrder, companyId: string) {
  const [row] = await db.insert(orders).values({ ...input, companyId }).returning();
  await invalidateOrdersCache(companyId);
  return row;
}
```

Then every `/api/orders*` route calls the repository function; invalidation is guaranteed.

**Phase 3 — implement `warmupCache` with registry pattern** (see D6).

**Phase 4 — fix `cacheGetOrSet`** to guard against thundering herd with a per-key Redis lock (see D4).

**Phase 5 — add observability**: pipe `metrics.errors` into the admin stats endpoint; emit Prometheus/Datadog counters from `recordHit`/`recordMiss`; alert on hit rate < 50% over 15 min.

---

## Appendix — Grep evidence

```
$ grep -rn "invalidate.*Cache" src/app/api | grep -v session
src/app/api/admin/cache/route.ts:15:import { getCacheStats, invalidateAllCache, warmupCache } …
src/app/api/admin/cache/route.ts:54:    await invalidateAllCache();
```
(Only the admin nuke. Zero per-entity invalidation from mutation routes.)

```
$ grep -rn "from.*infra/cache" src/app src/lib
src/app/api/admin/cache/route.ts        # admin endpoint
src/lib/geo/geospatial.ts               # distance-matrix (function never called)
```
(Only 2 files consume `cache.ts`; one is admin, one is dead-reachable.)

```
$ grep -rn "from.*server-cache" src/app src/lib
src/app/(protected)/dashboard/page.tsx:27   # uses only getCompanyId
```
(Only 1 file consumes `server-cache.ts`, and only the safe per-request primitive.)

---

## TL;DR for the deploy decision

- **Ship the app.** The cache layer does not affect request-path correctness today because nothing reads the tenant-scoped caches.
- **Before the NEXT release**, execute Strategy A (delete) or Strategy B Phase 1 (fix key shapes). Picking neither is the hazard: a well-meaning future PR that enables one of these caches will flip a CRITICAL tenant-leak or a HIGH staleness bug into production on that merge.
- **Do not** add `setX` cache writes in any new code path until the corresponding `invalidateX` is wired at the mutation sites (D2). Today the inventory of "writes without invalidation" is zero; keep it there.
