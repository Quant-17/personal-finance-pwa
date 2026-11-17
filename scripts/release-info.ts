import { execFileSync } from "node:child_process";

/** Public build identity only: never include environment keys or session data. */
export function releaseInfo(mode: string, supabaseUrl?: string) {
  let sourceRevision =
    process.env.CF_PAGES_COMMIT_SHA ??
    process.env.WORKERS_CI_COMMIT_SHA ??
    "unknown";
  let dirty = false;
  try {
    if (sourceRevision === "unknown")
      sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim();
    dirty =
      execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {
        encoding: "utf8",
      }).trim().length > 0;
  } catch {
    /* Build exports without Git still have an explicit unknown revision. */
  }
  return {
    schemaVersion: 1,
    app: "folio",
    mode,
    sourceRevision,
    dirty,
    supabaseOrigin:
      mode === "private" && supabaseUrl ? new URL(supabaseUrl).origin : null,
  };
}
