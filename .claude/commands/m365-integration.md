Before coding any M365 integration for crm.tristarpt.com, note:

- Azure AD App ID: debda2f0-a35b-44c9-8e0b-9d1d306c49a8
- Tenant ID: 668d2c67-481c-4c6c-8904-b08dfd68308c
- Auth already wired via Express session + Azure AD OAuth
- OAuth tokens stored in `user_oauth_tokens` table, refreshed via `getValidAccessToken()`
- Available M365 surfaces: Outlook email, Teams notifications, SharePoint, Calendar

Common integration patterns for this CRM:
- Weekly ops digest → send as Outlook email to Jordan + directors
- New flagged provider → post to Teams channel
- Gone-dark referrer → create Outlook task for marketer
- BCBS audit update → email Nicole Atkins directly

Always use Microsoft Graph API via the existing `@microsoft/microsoft-graph-client` package.
Never create a separate auth flow — reuse the stored OAuth tokens via `getValidAccessToken()`.

Now implement: $ARGUMENTS
