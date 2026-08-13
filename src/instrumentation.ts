export async function register() {
  // Only run on server, not during build
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Antes de cualquier otra cosa: recoverStaleJobs ya toca la DB, y una
    // rejection suya sin dueño mataría el arranque.
    const { installProcessGuards } = await import("@/lib/infra/process-guards");
    installProcessGuards();

    const { recoverStaleJobs } = await import(
      "@/lib/optimization/optimization-job"
    );
    await recoverStaleJobs();
  }
}
