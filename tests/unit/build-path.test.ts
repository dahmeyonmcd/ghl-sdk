import { describe, expect, it } from 'vitest';
import { buildPath } from '../../src/resources/shared/build-path.js';

describe('buildPath', () => {
  it('substitutes a single path param', () => {
    expect(buildPath('/contacts/{contactId}', { contactId: 'abc123' })).toBe('/contacts/abc123');
  });

  it('substitutes multiple path params', () => {
    expect(
      buildPath('/locations/{locationId}/tags/{tagId}', { locationId: 'loc-1', tagId: 'tag-2' }),
    ).toBe('/locations/loc-1/tags/tag-2');
  });

  it('URL-encodes param values', () => {
    expect(buildPath('/contacts/{contactId}', { contactId: 'a b/c' })).toBe('/contacts/a%20b%2Fc');
  });

  it('returns the template unchanged when params is undefined', () => {
    expect(buildPath('/businesses/', undefined)).toBe('/businesses/');
  });

  it('throws when a required path param is missing', () => {
    expect(() => buildPath('/contacts/{contactId}', {})).toThrow(/Missing required path parameter/);
  });
});
