/** Substitutes `{param}` placeholders in an OpenAPI path template with URL-encoded values. */
export function buildPath(template: string, params: Record<string, unknown> | undefined): string {
  if (!params) return template;
  return template.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined || value === null) {
      throw new Error(`Missing required path parameter "${name}" for path "${template}"`);
    }
    return encodeURIComponent(String(value));
  });
}
