import type { SecurityScheme } from '../auth/types.js';

export type ScopeAccessType = 'Agency' | 'Sub-Account';

export interface ScopeInfo {
  scope: string;
  accessType: ScopeAccessType;
}

/**
 * OAuth scope → access-type map, parsed from `docs/oauth/Scopes.md` in the highlevel-api-docs
 * submodule. Update by hand if GHL adds new scopes upstream.
 */
export const SCOPE_REGISTRY: Record<string, ScopeAccessType> = {
  "blogs/author.readonly": "Sub-Account",
  "blogs/category.readonly": "Sub-Account",
  "blogs/check-slug.readonly": "Sub-Account",
  "blogs/list.readonly": "Sub-Account",
  "blogs/post-update.write": "Sub-Account",
  "blogs/post.write": "Sub-Account",
  "blogs/posts.readonly": "Sub-Account",
  "businesses.readonly": "Sub-Account",
  "businesses.write": "Sub-Account",
  "calendars.readonly": "Sub-Account",
  "calendars.write": "Sub-Account",
  "calendars/events.readonly": "Sub-Account",
  "calendars/events.write": "Sub-Account",
  "calendars/groups.readonly": "Sub-Account",
  "calendars/groups.write": "Sub-Account",
  "calendars/resources.readonly": "Sub-Account",
  "calendars/resources.write": "Sub-Account",
  "campaigns.readonly": "Sub-Account",
  "contacts.readonly": "Sub-Account",
  "contacts.write": "Sub-Account",
  "conversations.readonly": "Sub-Account",
  "conversations.write": "Sub-Account",
  "conversations/livechat.write": "Sub-Account",
  "conversations/message.readonly": "Sub-Account",
  "conversations/message.write": "Sub-Account",
  "courses.write": "Sub-Account",
  "emails/builder.readonly": "Sub-Account",
  "emails/builder.write": "Sub-Account",
  "forms.readonly": "Sub-Account",
  "funnels/funnel.readonly": "Sub-Account",
  "funnels/page.readonly": "Sub-Account",
  "funnels/pagecount.readonly": "Sub-Account",
  "funnels/redirect.readonly": "Sub-Account",
  "funnels/redirect.write": "Sub-Account",
  "invoices.readonly": "Sub-Account",
  "invoices.write": "Sub-Account",
  "invoices/schedule.readonly": "Sub-Account",
  "invoices/schedule.write": "Sub-Account",
  "invoices/template.readonly": "Sub-Account",
  "invoices/template.write": "Sub-Account",
  "links.readonly": "Sub-Account",
  "links.write": "Sub-Account",
  "locations.write": "Agency",
  "locations/customFields.readonly": "Sub-Account",
  "locations/customFields.write": "Sub-Account",
  "locations/customValues.readonly": "Sub-Account",
  "locations/customValues.write": "Sub-Account",
  "locations/tags.readonly": "Sub-Account",
  "locations/tags.write": "Sub-Account",
  "locations/tasks.readonly": "Sub-Account",
  "locations/templates.readonly": "Sub-Account",
  "medias.readonly": "Sub-Account",
  "medias.write": "Sub-Account",
  "oauth.readonly": "Agency",
  "oauth.write": "Agency",
  "objects/record.readonly": "Sub-Account",
  "objects/record.write": "Sub-Account",
  "objects/schema.readonly": "Sub-Account",
  "objects/schema.write": "Sub-Account",
  "opportunities.readonly": "Sub-Account",
  "opportunities.write": "Sub-Account",
  "payments/integration.readonly": "Sub-Account",
  "payments/integration.write": "Sub-Account",
  "payments/orders.readonly": "Sub-Account",
  "payments/orders.write": "Sub-Account",
  "payments/subscriptions.readonly": "Sub-Account",
  "payments/transactions.readonly": "Sub-Account",
  "products.readonly": "Sub-Account",
  "products.write": "Sub-Account",
  "products/prices.readonly": "Sub-Account",
  "products/prices.write": "Sub-Account",
  "saas/location.write": "Agency",
  "snapshots.readonly": "Agency",
  "socialplanner/account.readonly": "Sub-Account",
  "socialplanner/account.write": "Sub-Account",
  "socialplanner/category.readonly": "Sub-Account",
  "socialplanner/csv.readonly": "Sub-Account",
  "socialplanner/csv.write": "Sub-Account",
  "socialplanner/oauth.readonly": "Sub-Account",
  "socialplanner/oauth.write": "Sub-Account",
  "socialplanner/post.readonly": "Sub-Account",
  "socialplanner/post.write": "Sub-Account",
  "socialplanner/tag.readonly": "Sub-Account",
  "surveys.readonly": "Sub-Account",
  "workflows.readonly": "Sub-Account",
};

export function getScopeInfo(scope: string): ScopeInfo | undefined {
  const accessType = SCOPE_REGISTRY[scope];
  return accessType ? { scope, accessType } : undefined;
}

export function isAgencyScope(scope: string): boolean {
  return SCOPE_REGISTRY[scope] === 'Agency';
}

/** Maps a resource client's declared security scheme to the scope access type it requires. */
export function accessTypeForSecurityScheme(scheme: SecurityScheme): ScopeAccessType | undefined {
  if (scheme === 'Agency-Access' || scheme === 'Agency-Access-Only') return 'Agency';
  if (scheme === 'Location-Access' || scheme === 'Location-Access-Only' || scheme === 'bearer') return 'Sub-Account';
  return undefined;
}
