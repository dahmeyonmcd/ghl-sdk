import { GHL_API_VERSION, GHL_BASE_URL } from '../constants.js';
import { GhlError } from '../http/errors.js';
import type { LocationTokenResponse } from './types.js';

export interface GetLocationTokenOptions {
  agencyAccessToken: string;
  companyId: string;
  locationId: string;
}

/**
 * Exchanges an agency access token for a location-scoped access token via
 * `POST /oauth/locationToken`. Requires `Agency-Access-Only` + `oauth.write` scope.
 */
export async function getLocationToken(options: GetLocationTokenOptions): Promise<LocationTokenResponse> {
  const body = new URLSearchParams({
    companyId: options.companyId,
    locationId: options.locationId,
  });

  const response = await fetch(`${GHL_BASE_URL}/oauth/locationToken`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.agencyAccessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Version: GHL_API_VERSION,
    },
    body,
  });

  const json = (await response.json().catch(() => undefined)) as LocationTokenResponse | undefined;

  if (!response.ok || !json) {
    throw GhlError.fromResponse(response, json as unknown as Record<string, unknown>, {
      method: 'POST',
      url: `${GHL_BASE_URL}/oauth/locationToken`,
    });
  }

  return json;
}
