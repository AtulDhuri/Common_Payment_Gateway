// FILE: config/load-env.ts
// PURPOSE: Loads the repo-root .env into process.env for local runs. Real environment variables win (Node never overrides them)
// DEPENDENCIES: node:fs, node:path
// PHASE: 5 (payment sandbox)
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const CANDIDATES = ['.env', '../.env'];

export function loadEnvFile(): void {
  for (const candidate of CANDIDATES) {
    const path = resolve(process.cwd(), candidate);
    if (existsSync(path)) {
      process.loadEnvFile(path);
      return;
    }
  }
}
