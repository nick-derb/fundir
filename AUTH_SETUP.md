# Fundir — Auth Setup (Google + Microsoft sign-in)

You said both OAuth apps **already exist** and are connected to Supabase.
This document is therefore a **verification checklist** — confirm each
value matches what the code expects, and patch anything that doesn't.

> **Placeholders you'll fill in:**
> - `<PROJECT_REF>` — your Supabase project ref (the subdomain on
>   `.supabase.co`, e.g. `abcdefghijklmno`). Find it in Supabase
>   Dashboard → Project Settings → General → Reference ID.

Production URL: `https://fundir.ai`
Local URL:      `http://localhost:3000`
Tenant org_code: `CYC2026`

---

## 1. Run the database migration

In Supabase Dashboard → SQL Editor → New query, paste and run:

```sql
-- copy/paste the contents of:
supabase/add_access_control.sql
```

This creates `access_allowlist`, `access_requests`, the indexes, and
seeds your two emails as `admin` on `CYC2026`. Idempotent — safe to re-run.

Then optionally run the isolation test (replace the UUID first):

```sql
-- supabase/test_rls_non_member.sql
```

Every line should print `✓ <table> returns 0 rows for non-member`.

---

## 2. Supabase Dashboard — Auth configuration

### 2a. Site URL + redirect URLs
**Project Settings → Authentication → URL Configuration:**

| Field           | Value |
| --------------- | ----- |
| Site URL        | `https://fundir.ai` |
| Redirect URLs   | `https://fundir.ai/auth/callback`<br>`https://fundir.ai/**`<br>`http://localhost:3000/auth/callback`<br>`http://localhost:3000/**` |

The `/**` wildcards let post-login deep links work (the safe-next
allow-list in `lib/access-control.ts` still restricts which paths the
app will redirect to).

### 2b. Identity linking — REQUIRED
**Project Settings → Authentication → Settings:**

- **Enable manual linking** = **ON**.

This makes the same person signing in via Google one day and Microsoft
another (same verified email) resolve to **one** user, not duplicates.

### 2c. Google provider
**Authentication → Providers → Google:**

- Enabled: **ON**
- Client ID + Secret: pasted from Google Cloud Console
- **Callback URL** (read-only here): `https://<PROJECT_REF>.supabase.co/auth/v1/callback`

### 2d. Azure (Microsoft) provider
**Authentication → Providers → Azure:**

- Enabled: **ON**
- Client ID + Secret: pasted from Azure Entra
- **Azure Tenant URL**: `https://login.microsoftonline.com/common`
  (covers CYC work accounts AND personal Microsoft accounts)

---

## 3. Google Cloud Console — verify

**APIs & Services → Credentials → OAuth 2.0 Client (Web app):**

- **Authorized redirect URIs** must include:
  - `https://<PROJECT_REF>.supabase.co/auth/v1/callback`

- **APIs & Services → OAuth consent screen:**
  - User type = **External**
  - **Publishing status = "In production"** (NOT "Testing" — Testing
    restricts to a manual test-user list, which will block any new
    CYC staff who aren't pre-registered there).
  - Scopes: `openid`, `email`, `profile`

If you bumped Publishing status to "In production" and it required a
verification submission, Google's review can take a few business days.

---

## 4. Azure Entra (Microsoft) — verify

**App Registrations → your Fundir app:**

- **Supported account types** must be:
  - "Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant) **and personal Microsoft accounts** (e.g. Skype, Xbox)"
  - **NOT** "Single tenant" or "My organization only" — that would
    block personal Microsoft accounts and any non-CYC org.

- **Authentication → Redirect URIs (Web platform):**
  - `https://<PROJECT_REF>.supabase.co/auth/v1/callback`

- **Certificates & secrets:** the client secret pasted in Supabase
  must still be valid (not expired).

- **API permissions:** delegated `openid`, `email`, `profile`,
  `User.Read`. No admin consent should be needed *for those scopes*
  on personal accounts.

### 4a. ⚠ Microsoft Global Admin consent (CYC IT must do this)

If CYC's Microsoft 365 tenant blocks unconsented third-party apps
(many do by default), CYC staff trying to sign in via Microsoft will
hit a "Need admin approval" wall. To pre-empt that, send the CYC IT
admin this URL and ask them to click it once:

```
https://login.microsoftonline.com/<CYC_TENANT_ID>/adminconsent
  ?client_id=<AZURE_CLIENT_ID>
  &redirect_uri=https://<PROJECT_REF>.supabase.co/auth/v1/callback
```

**Copy for IT:**

> Hi — Fundir is the grant-intelligence tool CYC is rolling out. It signs
> staff in via Microsoft and requests only standard sign-in scopes
> (`openid`, `email`, `profile`, `User.Read`) — no access to mail,
> calendar, files, or directory data. If our tenant requires admin
> consent for third-party apps, could you click the link below once so
> CYC staff can sign in without per-user approval prompts? It's a
> one-time action.
>
> [admin consent link]

Replace `<CYC_TENANT_ID>` with CYC's M365 tenant GUID and
`<AZURE_CLIENT_ID>` with the Fundir app's Application (client) ID.

You can skip this step entirely if CYC doesn't restrict third-party
apps — individual users will just see one standard consent screen on
first sign-in.

---

## 5. App env vars

The OAuth provider secrets live in **Supabase**, not in the app env.
What the app itself needs:

```
NEXT_PUBLIC_SUPABASE_URL       = https://<PROJECT_REF>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY  = <anon key>
SUPABASE_SERVICE_ROLE_KEY      = <service role key — for provisioning>
NEXT_PUBLIC_APP_URL            = https://fundir.ai
ADMIN_EMAIL                    = 6nicholas.derbis@benet.org
```

`ADMIN_EMAIL` is the only address that can access `/admin/*` and
receive (in-app) access-request notifications.

---

## 6. Smoke test (10 cases)

After running the migration and verifying the dashboards above, walk
through these in order:

1. **CYC staff allowlisted, Google sign-in** → lands on `/dashboard` with data.
2. **Personal Gmail on allowlist** → same.
3. **Personal Gmail NOT on allowlist** → lands on `/access-denied` with their email; an `access_requests` row appears in `/admin/access`.
4. **CYC staff via Microsoft work account** → `/dashboard`.
5. **Personal Microsoft account (allowlisted)** → `/dashboard`.
6. **Same email via Google then Microsoft** → one `auth.users` row, one `user_organizations` row. (Requires "Enable manual linking" in step 2b.)
7. **Returning user with valid session** → visits `/login`, redirected straight to `/dashboard`.
8. **Sign-out** → click the sign-out in the app shell; `/dashboard` now redirects to `/login`.
9. **Cancel mid-OAuth** → friendly error toast on `/login`, no crash.
10. **Mobile + keyboard** → the login card is usable on a phone; Tab cycles through OAuth buttons → email → password → submit with visible focus rings.

For test 6: in Supabase Dashboard → Auth → Users, the user should
have **two identities** listed (one Google, one Microsoft) but only
**one** user record. If you see two separate users, identity linking
isn't enabled (see step 2b).

---

## Recovery — what to do if a staffer is stuck

- **Not on allowlist:** Open `/admin/access`. Their pending request is
  at the top. Pick `CYC2026` + `member` and hit **Approve**. They can
  refresh and they're in.
- **CYC IT blocks third-party apps and Microsoft sign-in shows
  "Need admin approval":** Run the admin-consent URL from §4a, then
  the user retries.
- **Account linking didn't happen and they have two users:** In
  Supabase Dashboard → Auth → Users, delete the one that has no
  `user_organizations` row, enable manual linking (§2b), and have
  them sign in again.
