# Google Calendar Hosted OAuth Setup

Matt chose the Railway/domain redirect path on 2026-07-03.

## Redirect URI

Add this authorized redirect URI in the Google Cloud Console OAuth client:

```text
https://home-base-production-e3b7.up.railway.app/api/google/oauth/callback
```

## Required Environment

Set these in Railway, sourcing secret values from 1Password:

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
GOOGLE_TOKEN_ENCRYPTION_KEY
GOOGLE_OAUTH_STATE_SECRET
GOOGLE_CALENDAR_ID=primary
```

`GOOGLE_TOKEN_ENCRYPTION_KEY` protects the OAuth refresh token stored in `calendar_oauth_tokens`. Use a long random value. `GOOGLE_OAUTH_STATE_SECRET` may be a separate long random value.

## OAuth Flow

1. Deploy Home Base to Railway and confirm the hosted app opens.
2. Register the hosted callback URI in Google Cloud Console.
3. Visit:

```text
https://home-base-production-e3b7.up.railway.app/api/google/oauth/start
```

4. Approve Google Calendar access.
5. The callback exchanges the code, encrypts and stores the refresh token, then runs an initial full sync.

## Scheduled Sync

Run every 15 minutes:

```bash
npm run calendar:sync
```

The local LaunchAgent `com.mrtyndall.home-base-calendar-sync` uses the same command. On Railway, configure a cron service/job with the same command after the app and database variables are live.

## Scope

The app requests:

```text
https://www.googleapis.com/auth/calendar.events
```

That scope allows reading and editing calendar events without requesting broader calendar-management permissions.
