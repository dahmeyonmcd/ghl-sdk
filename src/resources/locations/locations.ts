import type { HttpTransport } from '../../http/transport.js';
import type {
  CreateLocationParams,
  DeleteLocationParams,
  Location,
  SearchLocationsParams,
  SearchLocationsResponse,
  UpdateLocationParams,
} from './types.js';

/**
 * `/locations` — agency-level sub-account management. Create/search/delete need an agency
 * token; reading a single location works with either an agency token or that location's own.
 */
export class LocationsResource {
  constructor(private readonly transport: HttpTransport) {}

  /** `GET /locations/search` — requires an agency token. */
  async search(params: SearchLocationsParams = {}): Promise<SearchLocationsResponse> {
    return this.transport.request<SearchLocationsResponse>({
      method: 'GET',
      path: '/locations/search',
      securityScheme: 'Agency-Access',
      companyId: params.companyId,
      query: {
        companyId: params.companyId,
        skip: params.skip,
        limit: params.limit,
        order: params.order,
        email: params.email,
      },
    });
  }

  /** `GET /locations/{locationId}` — accepts an agency token or the location's own token. */
  async get(locationId: string): Promise<{ location: Location }> {
    return this.transport.request<{ location: Location }>({
      method: 'GET',
      path: `/locations/${locationId}`,
      securityScheme: 'Location-Access',
      locationId,
    });
  }

  /** `POST /locations/` — creates a new sub-account. Requires an agency token. */
  async create(params: CreateLocationParams): Promise<{ location: Location }> {
    return this.transport.request<{ location: Location }>({
      method: 'POST',
      path: '/locations/',
      securityScheme: 'Agency-Access',
      companyId: params.companyId,
      body: params,
    });
  }

  /** `PUT /locations/{locationId}` — requires an agency token. */
  async update(locationId: string, params: UpdateLocationParams): Promise<{ location: Location }> {
    return this.transport.request<{ location: Location }>({
      method: 'PUT',
      path: `/locations/${locationId}`,
      securityScheme: 'Agency-Access',
      locationId,
      body: params,
    });
  }

  /** `DELETE /locations/{locationId}` — requires an agency token. Irreversible. */
  async delete(locationId: string, params: DeleteLocationParams = {}): Promise<{ success: boolean }> {
    return this.transport.request<{ success: boolean }>({
      method: 'DELETE',
      path: `/locations/${locationId}`,
      securityScheme: 'Agency-Access',
      locationId,
      query: { deleteTwilioAccount: params.deleteTwilioAccount ?? false },
    });
  }
}
