export interface LocationSettings {
  allowDuplicateContact?: boolean;
  allowDuplicateOpportunity?: boolean;
  allowFacebookNameMerge?: boolean;
  disableContactTimezone?: boolean;
  contactUniqueIdentifiers?: string[];
}

export interface LocationSocial {
  facebookUrl?: string;
  googlePlus?: string;
  linkedIn?: string;
  foursquare?: string;
  twitter?: string;
  yelp?: string;
  instagram?: string;
  youtube?: string;
  pinterest?: string;
  blogRss?: string;
  googlePlacesId?: string;
}

export interface Location {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  website?: string;
  timezone?: string;
  settings?: LocationSettings;
  social?: LocationSocial;
}

export interface CreateLocationParams {
  name: string;
  phone?: string;
  companyId: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  website?: string;
  timezone?: string;
  email?: string;
  settings?: LocationSettings;
  social?: LocationSocial;
}

export type UpdateLocationParams = Partial<Omit<CreateLocationParams, 'companyId'>>;

export interface SearchLocationsParams {
  companyId?: string;
  skip?: number;
  limit?: number;
  order?: 'asc' | 'desc';
  email?: string;
}

export interface SearchLocationsResponse {
  locations: Location[];
}

export interface DeleteLocationParams {
  /** When true, deletes all data (contacts, appointments, etc.) associated with the location. */
  deleteTwilioAccount?: boolean;
}
