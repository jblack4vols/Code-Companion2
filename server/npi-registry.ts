/**
 * NPI Registry API client for the NPPES (National Plan and Provider Enumeration System).
 * Docs: https://npiregistry.cms.hhs.gov/api-page
 * Base URL: https://npiregistry.cms.hhs.gov/api/
 * No authentication required. Public API. Version 2.1.
 */

const NPI_API_BASE = "https://npiregistry.cms.hhs.gov/api/";
const API_VERSION = "2.1";

export interface NpiSearchParams {
  /** 10-digit NPI number */
  number?: string;
  /** NPI-1 (individual) or NPI-2 (organization) */
  enumeration_type?: "NPI-1" | "NPI-2";
  /** Provider first name (individuals only) */
  first_name?: string;
  /** Provider last name (individuals only) */
  last_name?: string;
  /** Organization name (organizations only) */
  organization_name?: string;
  /** City */
  city?: string;
  /** Two-letter state abbreviation */
  state?: string;
  /** Postal/ZIP code */
  postal_code?: string;
  /** Taxonomy description (specialty) */
  taxonomy_description?: string;
  /** Max results to return (1-200, default 10) */
  limit?: number;
  /** Number of results to skip for pagination */
  skip?: number;
}

export interface NpiBasicInfo {
  first_name?: string;
  last_name?: string;
  credential?: string;
  gender?: string;
  sole_proprietor?: string;
  enumeration_date?: string;
  last_updated?: string;
  name_prefix?: string;
  name_suffix?: string;
  middle_name?: string;
  organization_name?: string;
  organizational_subpart?: string;
  authorized_official_first_name?: string;
  authorized_official_last_name?: string;
  authorized_official_credential?: string;
  authorized_official_telephone_number?: string;
  status?: string;
}

export interface NpiAddress {
  country_code?: string;
  country_name?: string;
  address_purpose?: string;
  address_type?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  telephone_number?: string;
  fax_number?: string;
}

export interface NpiTaxonomy {
  code?: string;
  taxonomy_group?: string;
  desc?: string;
  state?: string;
  license?: string;
  primary?: boolean;
}

export interface NpiResult {
  number: number;
  enumeration_type: string;
  basic: NpiBasicInfo;
  addresses: NpiAddress[];
  taxonomies: NpiTaxonomy[];
  created_epoch?: number;
  last_updated_epoch?: number;
}

export interface NpiApiResponse {
  result_count: number;
  results: NpiResult[];
}

/** Normalized provider data suitable for direct use in the physician form */
export interface NormalizedProvider {
  npi: string;
  firstName: string;
  lastName: string;
  credentials: string;
  specialty: string;
  practiceName: string;
  primaryOfficeAddress: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  fax: string;
  enumerationType: string;
  gender: string;
}

/**
 * Search the NPI Registry. Supports search by number, name, location, specialty.
 * Rate limit: be respectful — batch requests with small delays.
 */
export async function searchNpiRegistry(params: NpiSearchParams): Promise<NpiApiResponse> {
  const url = new URL(NPI_API_BASE);
  url.searchParams.set("version", API_VERSION);

  if (params.number) url.searchParams.set("number", params.number);
  if (params.enumeration_type) url.searchParams.set("enumeration_type", params.enumeration_type);
  if (params.first_name) url.searchParams.set("first_name", params.first_name);
  if (params.last_name) url.searchParams.set("last_name", params.last_name);
  if (params.organization_name) url.searchParams.set("organization_name", params.organization_name);
  if (params.city) url.searchParams.set("city", params.city);
  if (params.state) url.searchParams.set("state", params.state);
  if (params.postal_code) url.searchParams.set("postal_code", params.postal_code);
  if (params.taxonomy_description) url.searchParams.set("taxonomy_description", params.taxonomy_description);
  if (params.limit) url.searchParams.set("limit", String(Math.min(params.limit, 200)));
  if (params.skip) url.searchParams.set("skip", String(params.skip));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`NPI Registry API returned ${response.status}: ${response.statusText}`);
  }
  return response.json() as Promise<NpiApiResponse>;
}

/** Normalize raw NPI result into a flat object matching the physician schema fields */
export function normalizeNpiResult(result: NpiResult): NormalizedProvider {
  const basic = result.basic || {};
  const practiceAddr = result.addresses?.find(a => a.address_purpose === "LOCATION") || result.addresses?.[0];
  const mailingAddr = result.addresses?.find(a => a.address_purpose === "MAILING");
  const addr = practiceAddr || mailingAddr || {} as NpiAddress;
  const primaryTaxonomy = result.taxonomies?.find(t => t.primary) || result.taxonomies?.[0];

  return {
    npi: String(result.number),
    firstName: basic.first_name || basic.authorized_official_first_name || "",
    lastName: basic.last_name || basic.authorized_official_last_name || "",
    credentials: basic.credential || "",
    specialty: primaryTaxonomy?.desc || "",
    practiceName: basic.organization_name || "",
    primaryOfficeAddress: [addr.address_1, addr.address_2].filter(Boolean).join(", "),
    city: addr.city || "",
    state: addr.state || "",
    zip: addr.postal_code?.slice(0, 5) || "",
    phone: addr.telephone_number || "",
    fax: addr.fax_number || "",
    enumerationType: result.enumeration_type || "",
    gender: basic.gender || "",
  };
}
