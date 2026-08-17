/**
 * Puts `.env` into `process.env` for entrypoints that Node runs directly.
 *
 * `next dev`, `next build` and the Prisma CLI read `.env` on their own, so it has always been the one
 * place local configuration lives — but a file executed straight through `tsx` reads nothing. Every
 * `pnpm jobs:*`, every script in `scripts/` and the seed are exactly that, and without the file the `pg`
 * driver falls back to libpq's defaults and connects to a database named after the OS user — «database
 * "<your-username>" does not exist» — while anything reaching for a secret gets `undefined`.
 *
 * Import it as the entrypoint's **first** import. `@/core/database/prisma` and friends build their
 * connection while the module is being loaded, so an import placed after them is already too late.
 *
 * Nothing already set is overwritten, which is what makes this inert everywhere it is not needed: in the
 * container there is no `.env` at all and the values come from the environment, and a one-off
 * `DATABASE_URL=… pnpm jobs:expire` still wins on the developer's machine.
 */
import "dotenv/config";
