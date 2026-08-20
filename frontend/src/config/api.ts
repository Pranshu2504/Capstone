/**
 * API base URL for the native (Metro) build.
 *
 * The Android emulator reaches the host machine's localhost through the
 * 10.0.2.2 alias; on a physical device, set this to your machine's LAN IP.
 * The web build resolves `api.web.ts` instead.
 */
export const API_BASE_URL = 'http://10.0.2.2:4000';
