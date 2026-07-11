// Hand-written resources only. The 39 generated ones (src/resources/generated.ts) aren't
// re-exported wildcard-style here — their types would collide on common names like Location/Contact.
export { LocationsResource } from './locations/index.js';
export { OAuthResource } from './oauth/index.js';
