#!/usr/bin/env tsx
/**
 * Fails CI if a v2 module appears in specs/highlevel-api-docs/apps/*.json without a
 * corresponding resource client under src/resources/ — catches both upstream additions
 * (new module dropped by a submodule bump) and accidental deletions of generated output.
 */
import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { moduleToPropertyName } from './lib/naming.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SPECS_DIR = resolve(ROOT, 'specs/highlevel-api-docs/apps');
const RESOURCES_DIR = resolve(ROOT, 'src/resources');

// oauth + locations are hand-written; every other module is codegen'd (see generate-resources.ts).
const HAND_WRITTEN = new Set(['oauth', 'locations']);

function main() {
  const specModules = readdirSync(SPECS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));

  const missing: string[] = [];

  for (const moduleName of specModules) {
    const propertyName = moduleToPropertyName(moduleName);
    const resourceDir = resolve(RESOURCES_DIR, propertyName);
    if (!existsSync(resourceDir)) {
      missing.push(moduleName);
      continue;
    }
    if (!HAND_WRITTEN.has(moduleName) && !existsSync(resolve(resourceDir, 'generated', 'types.gen.ts'))) {
      missing.push(`${moduleName} (missing generated output)`);
    }
  }

  if (missing.length > 0) {
    console.error(`✗ ${missing.length} v2 module(s) missing a resource client:`);
    for (const m of missing) console.error(`  - ${m}`);
    console.error('\nRun `npm run generate` (or hand-write the resource) to fix.');
    process.exitCode = 1;
    return;
  }

  console.log(`✓ All ${specModules.length} v2 modules have a resource client.`);
}

main();
