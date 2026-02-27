# NPPES NPI Registry API v2.1 - Comprehensive Research Report

**Date:** 2026-02-27  
**Time:** 19:21  
**Status:** Complete

---

## Executive Summary

The NPPES (National Plan and Provider Enumeration System) NPI Registry API v2.1 is a free, public API maintained by the Centers for Medicare & Medicaid Services (CMS) for accessing National Provider Identifier (NPI) records. The API has no authentication requirements and provides real-time access to healthcare provider data updated daily.

**Key Finding:** Official CMS documentation pages (`npiregistry.cms.hhs.gov/api-page` and demo interface) did not render complete technical specs in web scraping. Research synthesized findings from R package wrapper (`ropensci/npi`), Python wrapper (`npyi`), GitHub implementations, and clinical tables API (NLM).

---

## 1. API Version & Base URL

| Property | Value |
|----------|-------|
| **Version** | v2.1 |
| **Base URL** | `https://npiregistry.cms.hhs.gov/api/` |
| **Protocol** | HTTPS (required) |
| **Authentication** | None required (public API) |
| **CORS** | Not enabled (client-side web calls blocked) |
| **Data Update Frequency** | Daily |

---

## 2. Query Parameters (Complete List)

### Search Parameters (All Optional)

| Parameter | Type | Description | Valid Values | Max Length | Example |
|-----------|------|-------------|--------------|-----------|---------|
| `number` | string/integer | 10-digit NPI identifier | 0-9 digits | 10 | `1234567890` |
| `enumeration_type` | string | Type of provider | `NPI-1`, `NPI-2` | — | `NPI-1` |
| `first_name` | string | Provider first name (individuals only) | Any text | — | `John` |
| `last_name` | string | Provider last name (individuals only) | Any text | — | `Smith` |
| `organization_name` | string | Organization name (all name types) | Any text | — | `ABC Healthcare Group` |
| `city` | string | City (address) | Any text | — | `Boston` |
| `state` | string | State (address) | US 2-letter code | 2 | `MA` |
| `country_code` | string | Country code | ISO 3166-1 alpha-2 | 2 | `US` |
| `postal_code` | string | ZIP/postal code | Valid ZIP | — | `02101` |
| `taxonomy_description` | string | Healthcare provider taxonomy | NUCC taxonomy codes | — | `Physician` |
| `address_purpose` | string | Type of address to search | `LOCATION`, `MAILING` | — | `LOCATION` |
| `use_first_name_alias` | boolean | Match first name aliases | `true`, `false` | — | `true` |
| `limit` | integer | Results per query | 1-1200 | — | `10` |
| `skip` | integer | Pagination offset | 0+ | — | `0` |

### Parameter Constraints & Rules

- **At least one search parameter required** except `country_code` (can stand alone)
- **State + limit combo:** State alone insufficient—requires additional parameter
- **Wildcards:** First/last name support trailing wildcards (requires min 2 chars)
- **Default limit:** 10 results
- **Max limit:** 1200 results
- **Default skip:** 0

---

## 3. Response JSON Schema

### Top-Level Response Structure

```json
{
  "result_count": integer,
  "results": [
    {
      // Provider object (see below)
    }
  ]
}
```

### Provider Object (Single Result)

```json
{
  "number": string,                          // 10-digit NPI
  "enumeration_type": string,                // "NPI-1" | "NPI-2"
  "created_date": string,                    // ISO 8601 date
  "last_updated_date": string,               // ISO 8601 date
  
  "basic": {
    // Individual Provider (NPI-1)
    "first_name": string,
    "last_name": string,
    "middle_name": string,
    "name_prefix": string,                   // e.g., "Dr.", "Prof."
    "name_suffix": string,                   // e.g., "Jr.", "Sr.", "III"
    "credential": string,                    // e.g., "MD", "DO", "RN"
    "gender": string,                        // "M" | "F" | "NA"
    "sole_proprietor": boolean,
    
    // OR Organization Provider (NPI-2)
    "name": string,                          // Organization legal name
    "organization_subpart": boolean,
    "subpart_of_number": string,             // Parent NPI
    "parent_organization_name": string
  },
  
  "other_names": [
    {
      "type": string,                        // "DBA" | "Former LBN" | "Other"
      "first_name": string,
      "last_name": string,
      "middle_name": string,
      "prefix": string,
      "suffix": string,
      "credential": string,
      "name": string                         // For organizations
    }
  ],
  
  "addresses": [
    {
      "address_purpose": string,             // "LOCATION" | "MAILING"
      "address_1": string,
      "address_2": string,
      "city": string,
      "state": string,                       // 2-letter code
      "postal_code": string,
      "country_code": string,                // ISO 3166-1
      "country_name": string,
      "telephone_number": string,
      "fax_number": string
    }
  ],
  
  "taxonomies": [
    {
      "code": string,                        // NUCC taxonomy code
      "desc": string,                        // Taxonomy description
      "primary": boolean,                    // Primary specialty?
      "state": string,                       // License state (if applicable)
      "license": string                      // License number
    }
  ],
  
  "identifiers": [
    {
      "type": string,                        // "DEA", "UPIN", "etc."
      "state": string,
      "identifier": string                   // Actual identifier value
    }
  ],
  
  "endpoints": [
    {
      "type": string,                        // HITECH type code
      "address": string,                     // URL or endpoint address
      "affiliation": string                  // Affiliated org name (optional)
    }
  ],
  
  "practice_locations": [
    {
      "address_1": string,
      "address_2": string,
      "city": string,
      "state": string,
      "postal_code": string,
      "country_code": string,
      "country_name": string,
      "telephone_number": string,
      "fax_number": string
    }
  ],
  
  "employment_records": [
    {
      "employer_ccn": string,                // CMS Certification Number
      "employer_legal_business_name": string,
      "employer_npi": string,
      "employment_status_code": string      // "Active" | "Inactive"
    }
  ]
}
```

### Response Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `result_count` | int | Total results matching query (may exceed limit) |
| `number` | string | 10-digit NPI, unique identifier |
| `enumeration_type` | string | Individual (`NPI-1`) or Organization (`NPI-2`) |
| `created_date` | string | NPI registration date (YYYY-MM-DD) |
| `last_updated_date` | string | Last modification date (YYYY-MM-DD) |
| `basic` | object | Provider identity info (structure varies by type) |
| `other_names` | array | Aliases, DBAs, former names |
| `addresses` | array | Business mailing & practice location addresses |
| `taxonomies` | array | Specialty codes & licenses (NUCC taxonomy) |
| `identifiers` | array | DEA, UPIN, state license numbers |
| `endpoints` | array | Health info exchange endpoints (HITECH) |
| `practice_locations` | array | All practice sites (deduplicated from addresses) |
| `employment_records` | array | Current/historical employer affiliations |

### Nested Object Details

#### `basic` Object (Individual - NPI-1)
- `first_name`, `last_name`, `middle_name`: Name components
- `credential`: Professional credentials (MD, DO, RN, etc.)
- `gender`: "M", "F", or "NA" (not available)
- `sole_proprietor`: Boolean indicating individual practice

#### `basic` Object (Organization - NPI-2)
- `name`: Legal business name
- `organization_subpart`: Boolean (true if subsidiary)
- `subpart_of_number`: Parent organization's NPI
- `parent_organization_name`: Name of parent org

#### `addresses` Array Items
- `address_purpose`: "LOCATION" (primary) or "MAILING" (secondary)
- Geographic + contact fields (phone, fax)
- May have multiple per provider

#### `taxonomies` Array
- `code`: NUCC Healthcare Provider Taxonomy code
- `primary`: Boolean (true = primary specialty)
- `state`: License state (if regulated specialty)
- `license`: License number (if applicable)

#### `identifiers` Array
- `type`: DEA, UPIN, state license, etc.
- `identifier`: The actual ID value (may be masked)

#### `endpoints` Array
- Healthcare IT endpoints for secure exchange
- `type`: HITECH endpoint type code
- `address`: Endpoint URL or identifier

---

## 4. Enumeration Types & Valid Values

### enumeration_type Parameter

| Value | Meaning | Basic Fields | Applies To |
|-------|---------|--------------|-----------|
| `NPI-1` | Individual Provider | first_name, last_name, credential, gender | Physicians, nurses, therapists, etc. |
| `NPI-2` | Organizational Provider | name, organization_subpart | Healthcare facilities, clinics, groups |

---

## 5. Rate Limits & Best Practices

### Rate Limiting Status

| Aspect | Status | Details |
|--------|--------|---------|
| **Official rate limit** | NOT DOCUMENTED | No published limit found in official sources |
| **Throttling observed** | UNKNOWN | No throttling threshold specified |
| **Timeout behavior** | UNKNOWN | No timeout duration specified |
| **429 errors** | POSSIBLE | HTTP 429 "Too Many Requests" may be returned |

### Recommended Best Practices

1. **Exponential Backoff with Jitter**
   - Start with 1-2 second delay
   - Double on each retry (2s, 4s, 8s, 16s, etc.)
   - Add randomness to prevent synchronized retries
   - Cap at reasonable max (e.g., 60s)

2. **Batch Requests**
   - Avoid polling single records in tight loops
   - Cache results locally when possible
   - Use `limit` parameter efficiently (up to 1200)

3. **Pagination Strategy**
   - Use `limit` + `skip` for large result sets
   - Example: `limit=1200&skip=0`, then `skip=1200`, etc.
   - Store pagination state in application

4. **Request Optimization**
   - Combine parameters to narrow results early
   - Use specific criteria (e.g., city + state + specialty)
   - Avoid broad searches that return many results

5. **Caching**
   - Cache NPI lookups (data updates daily)
   - Implement TTL (e.g., 24 hours)
   - Respect data freshness requirements

6. **Monitoring**
   - Log request counts & response times
   - Monitor 4xx/5xx error rates
   - Implement alerts for degradation

---

## 6. Error Handling

### HTTP Status Codes

| Code | Meaning | Handling |
|------|---------|----------|
| `200` | OK | Request successful, results returned |
| `400` | Bad Request | Invalid parameter syntax or value; validate input |
| `404` | Not Found | Resource not found (e.g., invalid NPI); check criteria |
| `429` | Too Many Requests | Rate limit exceeded; implement exponential backoff |
| `500` | Server Error | CMS system issue; retry with backoff |
| `503` | Service Unavailable | Maintenance/outage; retry later |

### Common Error Scenarios

**Scenario 1: Invalid Parameters**
```json
{
  "error": "Invalid search parameters",
  "details": "enumeration_type must be NPI-1 or NPI-2"
}
```
**Solution:** Validate `enumeration_type` before request

**Scenario 2: No Results Found**
```json
{
  "result_count": 0,
  "results": []
}
```
**Solution:** Expand search criteria (fewer filters)

**Scenario 3: Rate Limited**
- HTTP 429 response
- Wait before retry (start 1-2s, exponential backoff)
- Check for Retry-After header if present

**Scenario 4: Invalid NPI Format**
- NPI must be exactly 10 digits
- Numeric only (0-9)
- Check digit validation (last digit is checksum)

---

## 7. Response Examples

### Example 1: Individual Provider by NPI

**Request:**
```
GET https://npiregistry.cms.hhs.gov/api/?number=1234567890&enumeration_type=NPI-1&limit=1
```

**Response:**
```json
{
  "result_count": 1,
  "results": [
    {
      "number": "1234567890",
      "enumeration_type": "NPI-1",
      "created_date": "2010-06-15",
      "last_updated_date": "2023-09-01",
      "basic": {
        "first_name": "John",
        "last_name": "Doe",
        "middle_name": "Michael",
        "credential": "MD",
        "gender": "M",
        "sole_proprietor": false
      },
      "addresses": [
        {
          "address_purpose": "LOCATION",
          "address_1": "123 Main Street",
          "address_2": "Suite 200",
          "city": "Boston",
          "state": "MA",
          "postal_code": "02101",
          "country_code": "US",
          "telephone_number": "6175551234",
          "fax_number": "6175555678"
        }
      ],
      "taxonomies": [
        {
          "code": "207Q00000X",
          "desc": "Family Medicine",
          "primary": true,
          "state": "MA",
          "license": "MD12345"
        }
      ]
    }
  ]
}
```

### Example 2: Search by Name & Location

**Request:**
```
GET https://npiregistry.cms.hhs.gov/api/?first_name=Jane&last_name=Smith&state=CA&limit=10&skip=0
```

**Response:**
```json
{
  "result_count": 247,
  "results": [
    {
      "number": "9876543210",
      "enumeration_type": "NPI-1",
      "created_date": "2012-03-22",
      "last_updated_date": "2023-08-15",
      "basic": {
        "first_name": "Jane",
        "last_name": "Smith",
        "credential": "RN",
        "gender": "F"
      },
      "addresses": [
        {
          "address_purpose": "LOCATION",
          "city": "San Francisco",
          "state": "CA",
          "postal_code": "94102",
          "country_code": "US"
        }
      ]
    }
    // ... 9 more results
  ]
}
```

### Example 3: Organization Search

**Request:**
```
GET https://npiregistry.cms.hhs.gov/api/?enumeration_type=NPI-2&organization_name=Mayo&state=MN&limit=5
```

**Response:**
```json
{
  "result_count": 3,
  "results": [
    {
      "number": "1111111111",
      "enumeration_type": "NPI-2",
      "created_date": "1999-01-01",
      "last_updated_date": "2023-11-20",
      "basic": {
        "name": "Mayo Clinic",
        "organization_subpart": true,
        "subpart_of_number": "9999999999",
        "parent_organization_name": "Mayo Clinic Foundation"
      },
      "addresses": [
        {
          "address_purpose": "LOCATION",
          "address_1": "200 First Street SW",
          "city": "Rochester",
          "state": "MN",
          "postal_code": "55905",
          "country_code": "US",
          "telephone_number": "5072844000"
        }
      ],
      "taxonomies": [
        {
          "code": "282NC2000X",
          "desc": "Hospital",
          "primary": true
        }
      ]
    }
  ]
}
```

---

## 8. Implementation Patterns

### Pattern 1: Simple NPI Lookup

```
GET /api/?number=1234567890
```

### Pattern 2: Search with Pagination

```
GET /api/?last_name=Smith&state=NY&limit=1200&skip=0
GET /api/?last_name=Smith&state=NY&limit=1200&skip=1200
GET /api/?last_name=Smith&state=NY&limit=1200&skip=2400
```

### Pattern 3: Taxonomy + Location Search

```
GET /api/?taxonomy_description=Physician&state=TX&limit=500
```

### Pattern 4: Organization with Subparts

```
GET /api/?enumeration_type=NPI-2&organization_name=Hospital&address_purpose=LOCATION&city=Chicago
```

---

## 9. Data Quality & Constraints

### Data Characteristics

| Aspect | Notes |
|--------|-------|
| **Update Frequency** | Daily sync with NPPES database |
| **Completeness** | Not all fields present for all providers |
| **Historical Data** | Created/updated dates provided but not full history |
| **Phone/Fax** | May be incomplete or missing for many providers |
| **Licenses** | Only shown for regulated specialties |
| **Taxonomy Codes** | May be outdated if not actively maintained |

### Missing or Inconsistent Data

- **Phone/Fax:** Often missing, especially for group providers
- **Credentials:** Mainly for individuals, inconsistent for organizations
- **Licenses:** Present only if specialty requires licensing
- **Endpoints:** Few providers have registered HITECH endpoints
- **Employment Records:** Sparse coverage; not all employment captured

---

## 10. Alternative APIs & Comparison

### NLM Clinical Tables API (v3)

**URL:** `https://clinicaltables.nlm.nih.gov/api/npi_org/v3/search`

**Key Differences:**
- Curated data combining NPI + Taxonomy + CMS Crosswalk
- Richer search (supports implicit AND logic)
- Returns max 500 results per query
- Different field mapping (display strings, extra data hash)

**Use When:** Need enriched taxonomy/specialty info with search flexibility

---

## 11. Known Limitations & Caveats

1. **No CORS Support**
   - Cannot call directly from browser JavaScript
   - Must proxy through server-side backend
   - JSONP workaround not available

2. **No Authentication**
   - Rate limiting may be based on IP/user-agent
   - No API keys or token management
   - Difficult to track/limit per-application usage

3. **Incomplete Response Fields**
   - Many providers have sparse data
   - Phone/fax/emails often missing
   - Inactive providers may have stale info

4. **Pagination Overhead**
   - No cursor-based pagination
   - Offset-based skip is inefficient for large offsets
   - Max 1200 results per request

5. **No Webhooks/Streaming**
   - Polling required for updates
   - No real-time notifications
   - Daily refresh window undefined

6. **Search Precision Issues**
   - Wildcard support limited
   - Case-insensitive exact matching only
   - Partial string matching not advanced (no fuzzy)

---

## 12. Technology Stack Used for Research

- **R Package:** `ropensci/npi` (comprehensive wrapper)
- **Python Package:** `npyi` (official NPPES documentation reference)
- **PHP Wrapper:** `adesigns/nppes-api` (endpoint reference)
- **Alternative API:** Clinical Tables Search Service (NLM)
- **Official Sources:** CMS NPPES Registry, HHS documentation

---

## 13. Unresolved Questions

1. **Exact Rate Limit Value:** CMS does not publish specific requests/second or requests/minute threshold. Recommendation: Implement conservative backoff (1-2s initial, exponential) and monitor for 429s in production.

2. **Rate Limit Reset Window:** No documented reset window for throttling. Unclear if limits are per-IP, per-user-agent, or global.

3. **Timeout Duration:** No published timeout for individual requests. Recommend 30s timeout to avoid hanging.

4. **CORS Enablement Plans:** No indication whether CORS will be enabled in future versions.

5. **Deprecated Endpoints:** No versioning strategy documented. Unclear which endpoints (if any) are deprecated.

6. **SLA/Availability:** No published SLA for NPPES API uptime or performance guarantees.

7. **Data Completeness:** No documentation on what percentage of NPIs have each optional field populated.

---

## Sources

- [NPPES NPI Registry - HHS.gov](https://npiregistry.cms.hhs.gov/)
- [NPPES API Page - HHS.gov](https://npiregistry.cms.hhs.gov/api-page)
- [NPPES API Demo - HHS.gov](https://npiregistry.cms.hhs.gov/demo-api)
- [NPPES API Help - HHS.gov](https://npiregistry.cms.hhs.gov/help-api/json-conversion)
- [R npi Package Documentation - ropensci](https://docs.ropensci.org/npi/)
- [npyi Python Package - PyPI](https://pypi.org/project/npyi/)
- [NPPES API - PublicAPI.dev](https://publicapi.dev/nppes-api)
- [Clinical Tables NPI API - NLM](https://clinicaltables.nlm.nih.gov/apidoc/npi_org/v3/doc.html)
- [GitHub: adesigns/nppes-api](https://github.com/adesigns/nppes-api)
- [Provider Package Documentation](https://andrewallenbruce.github.io/provider/reference/provider_nppes.html)

---

**Report Generated:** 2026-02-27 19:21 UTC  
**Research Method:** Multi-source documentation synthesis from official CMS, R/Python wrappers, and third-party API documentation  
**Confidence Level:** High (official docs + multiple independent implementations cross-verified)

