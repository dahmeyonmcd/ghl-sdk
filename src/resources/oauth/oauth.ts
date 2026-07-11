import type { HttpTransport } from '../../http/transport.js';
import type { InstalledLocationsParams, InstalledLocationsResponse } from './types.js';

/**
 * `/oauth` — post-install lookups. Token issuance/exchange lives in OAuthFlow and
 * getLocationToken instead, since those happen before there's a token to resolve.
 */
export class OAuthResource {
  constructor(private readonly transport: HttpTransport) {}

  /** `GET /oauth/installedLocations` — requires an agency token. Lists locations where the calling app is installed. */
  async getInstalledLocations(params: InstalledLocationsParams): Promise<InstalledLocationsResponse> {
    return this.transport.request<InstalledLocationsResponse>({
      method: 'GET',
      path: '/oauth/installedLocations',
      securityScheme: 'Agency-Access',
      companyId: params.companyId,
      query: {
        companyId: params.companyId,
        appId: params.appId,
        skip: params.skip,
        limit: params.limit,
        query: params.query,
        isInstalled: params.isInstalled,
        versionId: params.versionId,
        onTrial: params.onTrial,
        planId: params.planId,
        locationId: params.locationId,
      },
    });
  }
}
