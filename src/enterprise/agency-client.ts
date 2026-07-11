import type { AuthManager } from '../auth/index.js';
import type { HttpTransport } from '../http/transport.js';
import type { InstalledLocation, InstalledLocationsParams } from '../resources/oauth/index.js';
import { LocationsResource } from '../resources/locations/index.js';
import { OAuthResource } from '../resources/oauth/index.js';
import { attachGeneratedResources, type GeneratedResources } from '../resources/generated.js';

/** One location's resources, pre-bound to that location's token so callers don't juggle tokens by hand. */
export interface LocationClientFacade extends GeneratedResources {
  readonly locationId: string;
  readonly locations: LocationsResource;
}

export interface AgencyClientOptions {
  companyId: string;
  appId: string;
  transport: HttpTransport;
  auth: AuthManager;
}

/**
 * Multi-location facade for agency apps — iterate every installed sub-account without managing
 * location tokens by hand.
 *
 * @example
 * ```ts
 * const agency = ghl.asAgency({ companyId, appId });
 * for await (const loc of agency.locations()) {
 *   await loc.contacts.getContacts({ locationId: loc.locationId });
 * }
 * ```
 */
export class AgencyClient {
  private readonly companyId: string;
  private readonly appId: string;
  private readonly transport: HttpTransport;
  private readonly auth: AuthManager;
  private readonly oauthResource: OAuthResource;

  constructor(options: AgencyClientOptions) {
    this.companyId = options.companyId;
    this.appId = options.appId;
    this.transport = options.transport;
    this.auth = options.auth;
    this.oauthResource = new OAuthResource(options.transport);
  }

  /** Lists every location the calling app is installed on for this agency. */
  async listInstalledLocations(
    params: Omit<InstalledLocationsParams, 'companyId' | 'appId'> = {},
  ): Promise<InstalledLocation[]> {
    const response = await this.oauthResource.getInstalledLocations({
      ...params,
      companyId: this.companyId,
      appId: this.appId,
    });
    return response.locations;
  }

  /** Builds a token-bound facade for a single location without listing installed locations first. */
  forLocation(locationId: string): LocationClientFacade {
    return {
      locationId,
      locations: new LocationsResource(this.transport),
      ...attachGeneratedResources(this.transport),
    };
  }

  /** Iterates every installed location, paging automatically. Tokens are exchanged lazily on first use, not up front. */
  async *locations(pageSize = 100): AsyncGenerator<LocationClientFacade> {
    let skip = 0;
    for (;;) {
      const response = await this.oauthResource.getInstalledLocations({
        companyId: this.companyId,
        appId: this.appId,
        skip,
        limit: pageSize,
      });
      for (const location of response.locations) {
        yield this.forLocation(location._id);
      }
      if (response.locations.length < pageSize) return;
      skip += pageSize;
    }
  }

  /** Pre-warms the cached location access token without making a resource call first. */
  async getLocationToken(locationId: string): Promise<string> {
    return this.auth.getLocationToken(locationId);
  }
}
