# Google Drive OAuth Setup Guide

**For**: Developers setting up Google Drive integration in KMS
**Time required**: ~20 minutes
**What you'll have at the end**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` ready to paste into your `.env.local`

---

## Prerequisites

- A Google account (personal or Google Workspace)
- Access to [Google Cloud Console](https://console.cloud.google.com)
- KMS running locally (`./scripts/kms-start.sh`)

---

## Step 1 — Create a Google Cloud Project

1. Go to [https://console.cloud.google.com](https://console.cloud.google.com)
2. Click the **project dropdown** at the top-left (next to "Google Cloud" logo)
3. Click **"New Project"** in the top-right of the dialog
4. Fill in:
   - **Project name**: `kms-local-dev` (or any name you like)
   - **Organization**: leave as-is (your personal account has none)
5. Click **"Create"**
6. Wait ~10 seconds, then select the new project from the dropdown

> **Important**: Make sure your new project is selected before continuing. The project name appears in the top-left dropdown.

---

## Step 2 — Enable the Google Drive API

1. In the left sidebar, go to **"APIs & Services" → "Library"**
2. In the search box, type `Google Drive API`
3. Click **"Google Drive API"** in the results
4. Click the blue **"Enable"** button
5. Wait for it to enable — you'll be redirected to the API overview page

> You must enable the API before you can create credentials for it.

---

## Step 3 — Configure the OAuth Consent Screen

This is what your users will see when they click "Connect Google Drive".

1. Go to **"APIs & Services" → "OAuth consent screen"**
2. Choose **"External"** (works for any Google account; use "Internal" only if you have Google Workspace and want only your org's users)
3. Click **"Create"**

### Fill in App Information

| Field | Value |
|-------|-------|
| **App name** | `KMS — Knowledge Base System` |
| **User support email** | Your email address |
| **App logo** | Skip for now |
| **App domain** | `http://localhost:3001` |
| **Developer contact email** | Your email address |

4. Click **"Save and Continue"**

### Scopes page

5. Click **"Add or Remove Scopes"**
6. Search for and add these two scopes:
   - `https://www.googleapis.com/auth/drive.readonly` — read files from Drive
   - `https://www.googleapis.com/auth/drive.metadata.readonly` — read file metadata
   - `https://www.googleapis.com/auth/userinfo.email` — get user's email (for displayName)
7. Click **"Update"**
8. Click **"Save and Continue"**

### Test Users page

9. Click **"Add Users"**
10. Add your own email address (and any other developer emails)
11. Click **"Add"**
12. Click **"Save and Continue"**

> **Why test users?** While the app is in "Testing" mode (not published), only listed test users can connect their Drive. This is fine for development — you won't need to go through Google's app verification process.

13. Review the summary and click **"Back to Dashboard"**

---

## Step 4 — Create OAuth 2.0 Credentials

1. Go to **"APIs & Services" → "Credentials"**
2. Click **"+ Create Credentials"** → **"OAuth client ID"**
3. Select **Application type**: **"Web application"**
4. Fill in:
   - **Name**: `KMS Local Dev`

### Authorized JavaScript Origins

5. Click **"+ Add URI"** and add:
   ```
   http://localhost:3001
   http://localhost:8000
   ```

### Authorized Redirect URIs

6. Click **"+ Add URI"** and add ALL of these:
   ```
   http://localhost:8000/api/v1/sources/google-drive/callback
   http://localhost:8000/api/v1/auth/google/callback
   ```

   > The first is for **Google Drive connection** (Sprint 3/4).
   > The second is for **Google OAuth Login** (future, M1 backlog item TEST-001).
   > Add both now so you don't need to come back.

7. Click **"Create"**

### Copy your credentials

A dialog will appear with:
- **Client ID** — looks like `123456789-abcdefgh.apps.googleusercontent.com`
- **Client Secret** — looks like `GOCSPX-xxxxxxxxxxxxxxxxxxxxxxx`

8. Click **"Download JSON"** — save this file as `google-oauth-credentials.json` somewhere safe (NOT inside the project folder — add to `.gitignore` if you do)
9. Click **"OK"**

---

## Step 5 — Add Credentials to Your Environment

### Option A: `.env.local` file (recommended for local dev)

Create or edit `/Users/gauravporwal/Sites/projects/gp/knowledge-base/.env.local`:

```bash
# Google Drive Integration
GOOGLE_CLIENT_ID=123456789-abcdefgh.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/sources/google-drive/callback

# Google OAuth Login (for future Sign in with Google feature)
# Uses the SAME credentials — just a different redirect URI
# GOOGLE_AUTH_REDIRECT_URI=http://localhost:8000/api/v1/auth/google/callback
```

Replace the placeholder values with your actual credentials.

### Option B: Export in your shell session

```bash
export GOOGLE_CLIENT_ID="123456789-abcdefgh.apps.googleusercontent.com"
export GOOGLE_CLIENT_SECRET="GOCSPX-xxxxxxxxxxxxxxxxxxxxxxx"
export GOOGLE_REDIRECT_URI="http://localhost:8000/api/v1/sources/google-drive/callback"
```

---

## Step 6 — Enable the Google Drive Feature Flag

The `googleDrive` feature is disabled by default. Enable it in one of two ways:

### Option A: Environment variable (no file edit needed)

```bash
export KMS_FEATURE_GOOGLE_DRIVE=true
```

### Option B: Local config override

Create `.kms/config.local.json` (gitignored, safe to have credentials here):

```json
{
  "features": {
    "googleDrive": {
      "enabled": true
    }
  }
}
```

---

## Step 7 — Restart the KMS API

The API reads credentials and feature flags at startup:

```bash
# If running in Docker/Podman:
podman restart kms_kms-api_1

# If running locally:
cd kms-api && npm run start:dev
```

---

## Step 8 — Verify Setup

### 8a. Check feature flags endpoint
```bash
curl http://localhost:8000/api/v1/features
```

Expected response:
```json
{
  "googleDrive": true,
  "googleOAuthLogin": false,
  "voiceTranscription": true,
  "semanticSearch": false,
  "rag": false
}
```

`googleDrive` should be `true`.

### 8b. Test the OAuth redirect
```bash
curl -v "http://localhost:8000/api/v1/sources/google-drive/oauth?userId=test-user-id"
```

You should see a `302 Found` with a `Location` header pointing to `accounts.google.com`. The URL should contain your `client_id`.

### 8c. Full browser test

1. Log into KMS at `http://localhost:3001/en/login`
2. Navigate to `http://localhost:3001/en/drive`
3. You should see a **"Connect Google Drive"** button (not the "Coming Soon" card)
4. Click it — your browser should redirect to Google's consent screen
5. Select your Google account (must be in the test users list from Step 3)
6. Grant permission
7. You'll be redirected back to `localhost:8000/api/v1/sources/google-drive/callback`
8. The source should be created — navigate back to the Drive page to see it as **CONNECTED**

---

## Troubleshooting

### "Access blocked: This app's request is invalid"
- Your redirect URI doesn't exactly match what's registered in Google Cloud Console
- Check for trailing slashes, http vs https, port numbers
- Fix: Go back to Step 4 and verify the redirect URI exactly matches `http://localhost:8000/api/v1/sources/google-drive/callback`

### "Error 403: access_denied"
- Your Google account is not in the test users list
- Fix: Go to OAuth consent screen → Test users → Add your email

### "Error 400: redirect_uri_mismatch"
- The `GOOGLE_REDIRECT_URI` env var doesn't match what's registered in GCP
- Fix: Make sure both values are `http://localhost:8000/api/v1/sources/google-drive/callback` exactly

### Feature flag shows `googleDrive: false` after restart
- The env var wasn't exported in the same shell session that started the server
- Fix: Check `echo $KMS_FEATURE_GOOGLE_DRIVE` returns `true`, then restart

### "Cannot GET /api/v1/sources/google-drive/oauth" (404)
- The FeatureFlagGuard is returning 503, not 404 — check the actual response body
- Or the kms-api hasn't reloaded the new SourcesModule — restart the container

---

## Security Notes

- **Never commit** `GOOGLE_CLIENT_SECRET` to git. Add `.env.local` and `google-oauth-credentials.json` to `.gitignore`
- The client secret is used server-side only — it never reaches the browser
- OAuth tokens are stored **encrypted** (AES-256-GCM) in `kms_sources.encrypted_tokens` — they are never returned in any API response
- In production, store credentials in a secrets manager (AWS Secrets Manager, GCP Secret Manager, Vault) — not in env files

---

## What the Credentials Are Used For

| Credential | Used where | Purpose |
|-----------|-----------|---------|
| `GOOGLE_CLIENT_ID` | `SourcesService` constructor | Build OAuth consent URL |
| `GOOGLE_CLIENT_SECRET` | `SourcesService.handleGoogleCallback` | Exchange auth code for tokens |
| `GOOGLE_REDIRECT_URI` | OAuth URL + token exchange | Must match GCP Console exactly |
| `API_KEY_ENCRYPTION_SECRET` | `TokenEncryptionService` | Encrypt/decrypt stored OAuth tokens |

> The `API_KEY_ENCRYPTION_SECRET` is a separate KMS secret (not a Google credential). It should be a random 32+ character string. Set it in `.env.local`:
> ```bash
> API_KEY_ENCRYPTION_SECRET=change-me-to-a-32-char-random-string!!
> ```

---

## Going to Production

When deploying beyond localhost:

1. Add your production domain to **Authorized JavaScript Origins** and **Authorized Redirect URIs** in GCP Console
2. Change `GOOGLE_REDIRECT_URI` to your production callback URL
3. **Publish the OAuth app**: Go to OAuth consent screen → Publishing status → "Publish App"
   This removes the test-users restriction so any Google user can connect their Drive
4. Google may require a **verification review** if you request sensitive scopes — `drive.readonly` is considered sensitive. The review process takes 1-4 weeks. For internal tools, stay in "Testing" mode with explicit test users listed.
