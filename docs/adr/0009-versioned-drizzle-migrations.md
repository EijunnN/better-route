# 0009. Versioned Drizzle migrations — `db:generate` + `db:migrate`, never `db:push` [Accepted]

Date: 2026-07-02
Status: Accepted

## Context

Drizzle offers two ways to move schema changes into Postgres:
`drizzle-kit push` (diff the live database against the schema files and
mutate it directly) and versioned migrations (`generate` writes numbered
SQL files into `drizzle/`, `migrate` applies them and records each one
in the journal). A push mutates the database without leaving a SQL file
behind, so any database it touched can no longer be rebuilt from the
migration history alone.

The migration history accumulated enough noise that it was squashed on
2026-05-31 into a clean baseline (`dfc08b1`, `0000_square_wolf_cub.sql`);
every change since is a numbered migration on top of it. This ADR
crystallizes the practice that has been in force since then (documented
until now only in `CLAUDE.md`).

The deployment model raises the stakes: BetterRoute installs
single-tenant per VPS (ADR-0008), so the journal is the only mechanism
that keeps N independent databases converging on the same schema.

## Decision

- Schema changes follow exactly one flow: edit `src/db/schema/`, run
  `bun run db:generate`, **review the generated SQL**, then
  `bun run db:migrate` (requires Postgres up).
- **`db:push` is banned.** It bypasses the journal and breaks the
  versioned history. The `db:push` npm script was removed from
  `package.json` together with this ADR — don't reintroduce it.
- The 2026-05-31 baseline is the migration floor. Pre-deploy there are
  no data-rescue migrations: a migration may assume the schema the
  journal describes, nothing else.
- Seeding is separate from migrating and never mutates schema.
  `src/db/seed.ts` fills the RBAC permissions catalog only when the
  `permissions` table is empty (`--reset` empties it first, preserving
  the invariant); it also seeds dev fixtures (admin user, per-company
  delivery policy and field definitions).

## Consequences

- Any environment — dev, CI, a fresh VPS install — reaches the current
  schema by replaying `drizzle/`. No snowflake databases.
- Generated SQL is reviewed like code: destructive changes show up in
  the diff instead of being silently applied to a live database.
- Iteration is slightly slower than push while prototyping. Accepted:
  the pre-deploy preference for aggressive refactors applies to code,
  not to the migration journal.
- If a database is ever found to disagree with the journal, the remedy
  is a new squashed baseline (as in `dfc08b1`) — not a push.
