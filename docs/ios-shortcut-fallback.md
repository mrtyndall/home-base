# iOS Shortcut Failure Fallback

The iOS capture shortcut must preserve dictated text even when Home Base is unreachable.

## Required Shortcut Shape

1. Dictate or accept text into a variable named `Captured Text`.
2. POST `Captured Text` to the Home Base capture endpoint.
3. If the request succeeds, show the Home Base response message.
4. If the request fails:
   - Append `Captured Text` to an Apple Notes note named `Home Base Failed Captures`.
   - Copy `Captured Text` to the clipboard.
   - Show a notification: `Home Base was offline. Capture saved to Notes and clipboard.`

## Endpoint

Use the tailnet URL while Home Base is local:

```text
https://mac-studio.tail3baa7a.ts.net/api/capture
```

The request body should be JSON:

```json
{
  "rawText": "captured text here",
  "source": "ios_shortcut",
  "deviceContext": {
    "shortcut": "home_base_capture"
  }
}
```

The fallback belongs in Shortcuts because a failed phone-to-server request never reaches Home Base. Server-side code cannot recover text that never arrived.
