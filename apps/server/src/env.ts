/**
 * Load `.env` (if present) into process.env without printing anything. Existing environment variables win.
 * Done in code rather than with `--env-file-if-exists`, because `node --watch` crashes when that file is absent.
 */
export function loadDotEnv(path = '.env'): boolean {
  try {
    process.loadEnvFile(path);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
}
