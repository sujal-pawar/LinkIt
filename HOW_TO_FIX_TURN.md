# HOW_TO_FIX_TURN.md — literal steps, do these in order

Your phone↔laptop connection is failing because the app was using
**shared, public demo TURN credentials** (`openrelayproject`) — these are
used by thousands of tutorials/projects at once and are frequently over
quota. The code now fetches your own private TURN credentials instead.
Do this:

## 1. Sign up (free, ~2 minutes)
Go to **https://dashboard.metered.ca/signup** and create a free account
(email or Google).

## 2. Create an app
After signing up, it'll ask you to name your app — type anything, e.g.
`linkit`. This becomes part of your personal API URL.

## 3. Get your API key
On the dashboard, go to the **TURN Server** page (or **Developers**
section). You'll see:
- Your **app name** (e.g. `linkit` → becomes `linkit.metered.live`)
- Your **API Key** (or "Secret Key")
Copy both.

## 4. Create the env file
In the repo, copy the example file:
```bash
cd linkit/client
cp .env.example .env
```
Open `.env` and fill in the two values from step 3:
```
VITE_METERED_APP_NAME=linkit
VITE_METERED_API_KEY=paste_your_actual_key_here
```

## 5. Restart the dev server
Stop `npm run dev` (Ctrl+C) and start it again — Vite only reads `.env`
on startup.

## 6. Retry the phone↔laptop test
Open the browser console on **both** devices before joining the room.
Look for this line on page load:
```
[WebRTC] Fetched N ICE servers from your Metered account
```
If you see that instead of the old warning about shared demo credentials,
your own TURN credentials are active. Try the file transfer again.

## 7. If it still fails — isolate whether TURN itself is the problem
Add one more line to `client/.env`:
```
VITE_FORCE_RELAY=true
```
Restart the dev server, retry the test. This forces the connection to
use **only** TURN relay candidates (no direct/STUN path allowed at all).
- **If it connects now** → TURN works fine; your original issue was
  something else (try `VITE_FORCE_RELAY=false` again and re-check the
  console for which STUN/direct candidates were being attempted).
- **If it still fails** → the problem is specifically TURN reachability.
  Check:
  - Is a VPN active on either device? Disable and retry.
  - Windows Firewall → allow Node.js and Chrome through (Settings →
    Firewall & network protection → Allow an app through firewall).
  - Try phone on **mobile data** instead of the same WiFi — rules out
    router-level AP/client isolation entirely.

Set `VITE_FORCE_RELAY` back to `false` once you've confirmed things work
— relay-only mode is slower and only meant for this diagnostic.
