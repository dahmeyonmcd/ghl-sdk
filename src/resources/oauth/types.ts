export interface InstalledLocationsParams {
  companyId: string;
  appId: string;
  skip?: number;
  limit?: number;
  query?: string;
  isInstalled?: boolean;
  versionId?: string;
  onTrial?: boolean;
  planId?: string;
  locationId?: string;
}

export interface InstalledLocation {
  _id: string;
  name: string;
  address: string;
  isInstalled?: boolean;
  versionId?: string;
  installedAt?: string;
}

export interface InstalledLocationsResponse {
  locations: InstalledLocation[];
  count?: number;
  installToFutureLocations?: boolean;
}
