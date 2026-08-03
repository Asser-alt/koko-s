# Push Server (example)

This is a minimal example server to test Web Push for the `karem` app.

Prerequisites:

- Node.js (14+)

Install:

```bash
cd push-server
npm install
```

Run:

```bash
# optionally set VAPID keys to persist across restarts
# export VAPID_PUBLIC_KEY=...; export VAPID_PRIVATE_KEY=...
npm start
```

Endpoints:

- `GET /vapidPublicKey` - returns the public VAPID key
- `POST /subscribe` - accepts a subscription JSON from client
- `POST /sendNotification` - sends a notification to all subscribers with body `{ title, body, url }`

Notes:

- For local development, open `http://localhost:3000/karem/index.html`.
- In production use HTTPS and store subscriptions in a database.
