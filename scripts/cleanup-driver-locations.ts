/**
 * Cron-friendly cleanup for `driver_locations`.
 *
 * Iterates every active company, deletes tracking history older than
 * the retention window, and prints a summary. Designed to be wired to
 * an external scheduler (cron-job.org, Railway cron, GitHub Actions
 * schedule, host crontab) — the app deliberately ships no in-process
 * scheduler so it can run in serverless or single-process modes
 * indistinctly.
 *
 * Usage:
 *   bun run cleanup:locations                       # default 30d, all companies
 *   bun run cleanup:locations --retention=60        # 60-day window
 *   bun run cleanup:locations --company=<uuid>      # scope to one tenant
 *   bun run cleanup:locations --dry-run             # report cutoffs, delete nothing
 *
 * Exit codes: 0 = all companies cleaned (or no-op); 1 = at least one
 * tenant errored — cron operators wire alerting on non-zero exit.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { companies } from "@/db/schema";
import {
  cleanupDriverLocations,
  DEFAULT_RETENTION_DAYS,
  InvalidRetentionError,
  validateRetentionDays,
} from "@/lib/maintenance/driver-locations-cleanup";

interface Args {
  retentionDays: number;
  dryRun: boolean;
  companyId: string | null;
}

function parseArgs(argv: string[]): Args {
  let retentionDays: number = DEFAULT_RETENTION_DAYS;
  let dryRun = false;
  let companyId: string | null = null;

  for (const arg of argv) {
    if (arg === "--dry-run" || arg === "-n") {
      dryRun = true;
      continue;
    }
    const [key, rawValue] = arg.split("=", 2);
    const value = rawValue ?? "";
    switch (key) {
      case "--retention":
      case "-r":
        retentionDays = Number(value);
        break;
      case "--company":
      case "-c":
        companyId = value || null;
        break;
      case "--help":
      case "-h":
        printHelpAndExit();
        break;
    }
  }

  try {
    retentionDays = validateRetentionDays(retentionDays);
  } catch (error) {
    if (error instanceof InvalidRetentionError) {
      console.error(`✖ ${error.message}`);
      process.exit(2);
    }
    throw error;
  }

  return { retentionDays, dryRun, companyId };
}

function printHelpAndExit(): never {
  console.log(`
Usage: bun run cleanup:locations [options]

Options:
  --retention=<days>, -r   Retention window in days (default 30, range 7-365)
  --company=<uuid>, -c     Scope to a single company (default: all)
  --dry-run, -n            Compute cutoffs, perform no DELETE
  --help, -h               Show this message
`);
  process.exit(0);
}

function fmtCount(n: number): string {
  return n.toLocaleString("en-US");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();

  const targetCompanies = args.companyId
    ? await db
        .select({ id: companies.id, name: companies.commercialName })
        .from(companies)
        .where(eq(companies.id, args.companyId))
    : await db
        .select({ id: companies.id, name: companies.commercialName })
        .from(companies);

  if (targetCompanies.length === 0) {
    console.log("No companies to process.");
    process.exit(0);
  }

  console.log(
    `▶ cleanup-driver-locations  retention=${args.retentionDays}d  scope=${
      args.companyId ?? "all"
    }${args.dryRun ? "  (dry-run)" : ""}`,
  );
  console.log(
    `  ${targetCompanies.length} compan${targetCompanies.length === 1 ? "y" : "ies"}\n`,
  );

  let totalDeleted = 0;
  let failures = 0;

  for (const company of targetCompanies) {
    const label = `${company.name ?? "(unnamed)"} [${company.id.slice(0, 8)}]`;
    try {
      const result = await cleanupDriverLocations({
        companyId: company.id,
        retentionDays: args.retentionDays,
        dryRun: args.dryRun,
      });
      totalDeleted += result.deleted;
      const verb = args.dryRun ? "would delete" : "deleted";
      console.log(`  ✓ ${label}  ${verb} ${fmtCount(result.deleted)} rows`);
    } catch (error) {
      failures++;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  ✖ ${label}  ${message}`);
    }
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `\n${args.dryRun ? "Would delete" : "Deleted"} ${fmtCount(totalDeleted)} rows across ${
      targetCompanies.length
    } compan${targetCompanies.length === 1 ? "y" : "ies"} in ${elapsed}s${
      failures > 0 ? `  (${failures} failed)` : ""
    }`,
  );

  process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("✖ fatal:", error);
  process.exit(1);
});
