/**
 * Base URL of the AI try-on service (`Capstone/ai`) for the native build.
 *
 * This is a *separate* service from the Prisma backend in `@/config/api`:
 * that one serves wardrobe data on :4000, this one runs the FASHN try-on.
 * They cannot share a port, so the try-on service listens on :4001 —
 * start it with `PORT=4001 npm run dev` inside `Capstone/ai`.
 *
 * The web build resolves `aiApi.web.ts` instead.
 */
export const AI_BASE_URL = 'http://10.0.2.2:4001';
