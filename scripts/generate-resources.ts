#!/usr/bin/env tsx
// Generates a resource class per GHL v2 OpenAPI module (everything under specs/highlevel-api-docs/apps
// except oauth + locations, which are hand-written — see src/resources/oauth and src/resources/locations).
//
// For each module: dereference the spec (GHL splits shared schemas into common/*.json), run
// @hey-api/openapi-ts for types only, then walk the operations ourselves to emit thin methods that
// call the shared HttpTransport — so generated calls get the same auth/rate-limit/retry as the
// hand-written resources instead of a second HTTP stack. Finally rewrites src/resources/generated.ts,
// which wires every resource class onto GhlClient.
//
// Re-run after `npm run sync:specs`.
import { createClient } from '@hey-api/openapi-ts';
import SwaggerParser from '@apidevtools/swagger-parser';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { moduleToPropertyName, toPascalCase } from './lib/naming.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SPECS_DIR = resolve(ROOT, 'specs/highlevel-api-docs/apps');
const RESOURCES_DIR = resolve(ROOT, 'src/resources');

// oauth + locations are hand-written (src/resources/oauth, src/resources/locations) to validate
// the enterprise auth architecture before trusting it to codegen. Every other v2 module is generated.
const MODULES = [
  'ad-manager',
  'affiliate-manager',
  'agent-studio',
  'associations',
  'blogs',
  'brand-boards',
  'businesses',
  'calendars',
  'campaigns',
  'companies',
  'contacts',
  'conversation-ai',
  'conversations',
  'courses',
  'custom-fields',
  'custom-menus',
  'email-isv',
  'emails',
  'forms',
  'funnels',
  'invoices',
  'knowledge-base',
  'links',
  'marketplace',
  'medias',
  'objects',
  'opportunities',
  'payments',
  'phone-system',
  'products',
  'proposals',
  'saas-api',
  'snapshots',
  'social-media-posting',
  'store',
  'surveys',
  'users',
  'voice-ai',
  'workflows',
];

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

const KNOWN_SECURITY_SCHEMES = new Set([
  'bearer',
  'Location-Access',
  'Location-Access-Only',
  'Agency-Access',
  'Agency-Access-Only',
]);

interface OperationInfo {
  method: HttpMethod;
  path: string;
  operationId: string;
  methodName: string;
  typeBase: string;
  summary: string;
  securityScheme: string;
  pathParamNames: string[];
  queryParamNames: string[];
  hasBody: boolean;
  hasSuccessSchema: boolean;
  unresolved?: boolean;
}

function collectOperations(doc: any): OperationInfo[] {
  const operations: OperationInfo[] = [];
  const usedMethodNames = new Set<string>();

  for (const [path, pathItem] of Object.entries<any>(doc.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (!op || typeof op !== 'object') continue;

      const operationId: string = op.operationId ?? `${method}-${path}`;
      let methodName = toPascalCase(operationId);
      methodName = methodName.charAt(0).toLowerCase() + methodName.slice(1);
      if (usedMethodNames.has(methodName)) {
        let suffix = 2;
        while (usedMethodNames.has(`${methodName}${suffix}`)) suffix++;
        methodName = `${methodName}${suffix}`;
      }
      usedMethodNames.add(methodName);

      const parameters: any[] = op.parameters ?? [];
      const pathParamNames = parameters.filter((p) => p.in === 'path').map((p) => p.name);
      const queryParamNames = parameters.filter((p) => p.in === 'query').map((p) => p.name);

      const securityEntry = Array.isArray(op.security) ? op.security[0] : undefined;
      const rawScheme = securityEntry ? Object.keys(securityEntry)[0] : undefined;
      const securityScheme = rawScheme && KNOWN_SECURITY_SCHEMES.has(rawScheme) ? rawScheme : 'bearer';

      const hasBody = Boolean(op.requestBody?.content?.['application/json']?.schema);

      const hasSuccessSchema = Object.entries<any>(op.responses ?? {}).some(
        ([status, response]) =>
          status.startsWith('2') && Boolean(response?.content?.['application/json']?.schema),
      );

      operations.push({
        method,
        path,
        operationId,
        methodName,
        typeBase: toPascalCase(operationId),
        summary: (op.summary ?? op.description ?? '').toString().split('\n')[0].slice(0, 200),
        securityScheme,
        pathParamNames,
        queryParamNames,
        hasBody,
        hasSuccessSchema,
      });
    }
  }

  return operations;
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// hey-api's operationId -> PascalCase doesn't always match ours ("by-ID" -> "ById" not "ByID",
// "text2pay" -> "Text2Pay" not "Text2pay"). Rather than reverse-engineer its exact algorithm, read
// back the `XxxData` type names it actually emitted and match them by normalized operationId.
function reconcileTypeBases(operations: OperationInfo[], typesFilePath: string, moduleName: string): void {
  const source = readFileSync(typesFilePath, 'utf-8');
  const dataTypeNames = [...source.matchAll(/^export type (\w+)Data = /gm)].map((m) => m[1] as string);

  const byNormalized = new Map<string, string>();
  for (const name of dataTypeNames) {
    byNormalized.set(normalizeName(name), name);
  }

  for (const op of operations) {
    const actual = byNormalized.get(normalizeName(op.operationId));
    if (actual) {
      op.typeBase = actual;
    } else {
      console.warn(`  ⚠ ${moduleName}: no generated type found for operationId "${op.operationId}", skipping`);
      op.unresolved = true;
    }
  }
}

function renderMethod(op: OperationInfo): string {
  const dataType = `T.${op.typeBase}Data`;
  const responseType = op.hasSuccessSchema ? `T.${op.typeBase}Responses[keyof T.${op.typeBase}Responses]` : 'void';

  const paramParts: string[] = [];
  if (op.pathParamNames.length) paramParts.push(`${dataType}['path']`);
  if (op.queryParamNames.length) paramParts.push(`${dataType}['query']`);
  if (op.hasBody) paramParts.push(`${dataType}['body']`);

  const hasParams = paramParts.length > 0;
  const paramsType = hasParams ? paramParts.join(' & ') : undefined;
  const paramsArg = hasParams ? `params: ${paramsType}` : '';

  const queryLines = op.queryParamNames
    .map((name) => `        ${JSON.stringify(name)}: (params as unknown as Record<string, any>)[${JSON.stringify(name)}],`)
    .join('\n');

  const bodyExpr = op.hasBody ? 'params' : undefined;
  const pathExpr = op.pathParamNames.length
    ? `buildPath(${JSON.stringify(op.path)}, params as unknown as Record<string, unknown>)`
    : JSON.stringify(op.path);

  const locationIdExpr = hasParams
    ? '(params as unknown as Record<string, unknown> | undefined)?.locationId as string | undefined'
    : 'undefined';
  const companyIdExpr = hasParams
    ? '(params as unknown as Record<string, unknown> | undefined)?.companyId as string | undefined'
    : 'undefined';

  const requestLines = [
    `      method: ${JSON.stringify(op.method.toUpperCase())},`,
    `      path: ${pathExpr},`,
    `      securityScheme: ${JSON.stringify(op.securityScheme)},`,
    `      locationId: ${locationIdExpr},`,
    `      companyId: ${companyIdExpr},`,
  ];
  if (op.queryParamNames.length) {
    requestLines.push(`      query: {\n${queryLines}\n      },`);
  }
  if (bodyExpr) {
    requestLines.push(`      body: ${bodyExpr},`);
  }

  const doc = op.summary ? `  /** ${op.summary.replace(/\*\//g, '')} */\n` : '';

  return `${doc}  async ${op.methodName}(${paramsArg}): Promise<${responseType}> {
    return this.transport.request<${responseType}>({
${requestLines.join('\n')}
    });
  }`;
}

function renderResourceFile(className: string, operations: OperationInfo[]): string {
  const needsBuildPath = operations.some((op) => op.pathParamNames.length > 0);
  const methods = operations.map(renderMethod).join('\n\n');

  return `// AUTO-GENERATED by scripts/generate-resources.ts — do not edit directly.
// Re-run \`npm run generate\` after updating the specs submodule.
import type { HttpTransport } from '../../http/transport.js';
${needsBuildPath ? "import { buildPath } from '../shared/build-path.js';\n" : ''}import type * as T from './generated/types.gen.js';

export class ${className} {
  constructor(private readonly transport: HttpTransport) {}

${methods}
}
`;
}

// links.json (and maybe others) points these error DTOs at a same-file $ref instead of the
// shared common-schemas.json, even though they're not defined locally. Patch it before
// dereferencing instead of failing the whole module over an upstream typo.
const COMMON_ERROR_DTOS = ['BadRequestDTO', 'UnauthorizedDTO', 'UnprocessableDTO'];

function patchKnownBrokenRefs(specPath: string, rawText: string): string {
  let patched = rawText;
  for (const dto of COMMON_ERROR_DTOS) {
    if (!rawText.includes(`"${dto}":`)) {
      // Not defined locally in this file's components.schemas — any same-file $ref to it is broken.
      const broken = `"$ref": "#/components/schemas/${dto}"`;
      const fixed = `"$ref": "../common/common-schemas.json#/components/schemas/${dto}"`;
      patched = patched.split(broken).join(fixed);
    }
  }
  return patched;
}

async function generateModule(moduleName: string): Promise<{ propertyName: string; className: string } | undefined> {
  const specPath = resolve(SPECS_DIR, `${moduleName}.json`);
  const propertyName = moduleToPropertyName(moduleName);
  const className = `${toPascalCase(moduleName)}Resource`;
  const outDir = resolve(RESOURCES_DIR, propertyName);
  const generatedDir = resolve(outDir, 'generated');

  console.log(`→ ${moduleName} (${propertyName})`);

  const rawText = readFileSync(specPath, 'utf-8');
  const patchedText = patchKnownBrokenRefs(specPath, rawText);

  // Patched specs are written back into the same directory (not os.tmpdir()) so relative $refs
  // like "../common/common-schemas.json" still resolve; removed again after dereferencing.
  const patchedPath = resolve(SPECS_DIR, `.patched-${moduleName}.json`);
  const dereferenceFrom = patchedText === rawText ? specPath : patchedPath;
  if (patchedText !== rawText) writeFileSync(patchedPath, patchedText);

  let doc: any;
  try {
    doc = await SwaggerParser.dereference(dereferenceFrom);
  } catch (error) {
    console.error(`  ✗ failed to dereference ${moduleName}: ${(error as Error).message}`);
    return undefined;
  } finally {
    if (patchedText !== rawText) {
      try {
        unlinkSync(patchedPath);
      } catch {
        // best-effort cleanup
      }
    }
  }

  const operations = collectOperations(doc);
  if (operations.length === 0) {
    console.warn(`  ⚠ no operations found in ${moduleName}, skipping`);
    return undefined;
  }

  mkdirSync(generatedDir, { recursive: true });

  await createClient({
    input: doc,
    output: generatedDir,
    plugins: ['@hey-api/typescript'],
    logs: { level: 'silent' },
  });

  reconcileTypeBases(operations, resolve(generatedDir, 'types.gen.ts'), moduleName);
  const resolvedOperations = operations.filter((op) => !op.unresolved);

  const resourceFileName = `${propertyName}.ts`;
  writeFileSync(resolve(outDir, resourceFileName), renderResourceFile(className, resolvedOperations));
  writeFileSync(
    resolve(outDir, 'index.ts'),
    `// AUTO-GENERATED by scripts/generate-resources.ts — do not edit directly.
export { ${className} } from './${propertyName}.js';
export type * from './generated/types.gen.js';
`,
  );

  console.log(`  ✓ ${resolvedOperations.length} operations`);
  return { propertyName, className };
}

function renderGeneratedBarrel(entries: { moduleName: string; propertyName: string; className: string }[]): string {
  const imports = entries
    .map((e) => `import { ${e.className} } from './${e.propertyName}/index.js';`)
    .join('\n');
  const fields = entries.map((e) => `  ${e.propertyName}: new ${e.className}(transport),`).join('\n');
  const exportsList = entries.map((e) => `export { ${e.className} } from './${e.propertyName}/index.js';`).join('\n');

  return `// AUTO-GENERATED by scripts/generate-resources.ts — do not edit directly.
// Wires every codegen'd resource module onto a shared HttpTransport. Consumed by GhlClient via
// \`interface GhlClient extends GeneratedResources {}\` + \`Object.assign(this, attachGeneratedResources(transport))\`.
import type { HttpTransport } from '../http/transport.js';
${imports}

export function attachGeneratedResources(transport: HttpTransport) {
  return {
${fields}
  };
}

export type GeneratedResources = ReturnType<typeof attachGeneratedResources>;

${exportsList}
`;
}

async function main() {
  const only = process.argv.slice(2);
  const targets = only.length > 0 ? MODULES.filter((m) => only.includes(m)) : MODULES;

  const entries: { moduleName: string; propertyName: string; className: string }[] = [];

  for (const moduleName of targets) {
    const result = await generateModule(moduleName);
    if (result) entries.push({ moduleName, ...result });
  }

  writeFileSync(resolve(RESOURCES_DIR, 'generated.ts'), renderGeneratedBarrel(entries));

  console.log(`\nGenerated ${entries.length}/${targets.length} resource modules.`);
  if (entries.length < targets.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
