import { readFileSync } from 'node:fs';
import { arch, platform, release } from 'node:os';

interface PackageVersionFile {
  version?: string;
}

let cachedReflectionVersion: string | undefined;

// src/core and dist/core are both two levels below the package root.
export function getReflectionVersion(): string {
  if (cachedReflectionVersion === undefined) {
    const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as PackageVersionFile;
    cachedReflectionVersion = packageJson.version ?? 'unknown';
  }
  return cachedReflectionVersion;
}

export function getPlaywrightVersion(): string {
  try {
    const packageJsonUrl = import.meta.resolve('playwright/package.json');
    return (JSON.parse(readFileSync(new URL(packageJsonUrl), 'utf8')) as PackageVersionFile).version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export function describeOperatingSystem(): { platform: string; release: string; arch: string } {
  return { platform: platform(), release: release(), arch: arch() };
}
