/**
 * Gives the tests the same `.env` that every other command in this repository already reads.
 *
 * `next dev`, `next build` and the Prisma CLI load `.env` on their own, so the file has always been the
 * one place local configuration lives — but Vitest loads nothing, and the Prisma client reads
 * `process.env.DATABASE_URL` directly. With the variable missing, the `pg` driver quietly falls back to
 * libpq's defaults and connects to a database named after the OS user, which surfaces as
 * «Database `<your-username>` does not exist» in hundreds of tests at once. That reads as a broken suite
 * rather than as an unset variable, and it only stayed hidden this long because CI supplied the variables
 * itself and never touched `.env`.
 *
 * `dotenv` does not overwrite variables that are already set, so an environment that states its own
 * DATABASE_URL — a CI job, or one-off `DATABASE_URL=… pnpm test` — still wins.
 */
import "dotenv/config";
