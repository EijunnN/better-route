export async function register() {
  // Only run on server, not during build
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { recoverStaleJobs } = await import("@/lib/infra/job-queue");
    await recoverStaleJobs();
  }
}
