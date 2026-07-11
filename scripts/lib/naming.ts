/** kebab-case / snake_case / space-separated → camelCase. Leaves existing camelCase untouched. */
export function toCamelCase(input: string): string {
  return input
    .replace(/[^a-zA-Z0-9]+(.)/g, (_match, char: string) => char.toUpperCase())
    .replace(/^[A-Z]/, (char) => char.toLowerCase());
}

/** kebab-case / camelCase / snake_case → PascalCase. */
export function toPascalCase(input: string): string {
  const camel = toCamelCase(input);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/** Module filename stem (e.g. "social-media-posting") → camelCase client property name. */
export function moduleToPropertyName(moduleName: string): string {
  return toCamelCase(moduleName);
}
