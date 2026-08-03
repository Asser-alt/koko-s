const express = require("express");
const webpush = require("web-push");
const path = require("path");

const app = express();
app.use(express.json());

// Serve the site files (parent folder of push-server)
app.use(express.static(path.join(__dirname, "..")));

let subscribers = [];

// Load or generate VAPID keys (for demo we generate if not provided)
let vapidKeys = null;
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
  };
} else {
  vapidKeys = webpush.generateVAPIDKeys();
  console.log("Generated VAPID keys (use these in env for persistence):");
  console.log("VAPID_PUBLIC_KEY=" + vapidKeys.publicKey);
  console.log("VAPID_PRIVATE_KEY=" + vapidKeys.privateKey);
}

webpush.setVapidDetails(
  "mailto:you@example.com",
  vapidKeys.publicKey,
  vapidKeys.privateKey,
);

app.get("/vapidPublicKey", (req, res) => {
  res.send(vapidKeys.publicKey);
});

app.post("/subscribe", (req, res) => {
  const sub = req.body;
  // Basic dedupe by endpoint
  if (!sub || !sub.endpoint)
    return res.status(400).json({ error: "Invalid subscription" });
  const exists = subscribers.find((s) => s.endpoint === sub.endpoint);
  if (!exists) subscribers.push(sub);
  res.json({ success: true });
});

app.post("/sendNotification", async (req, res) => {
  const { title, body, url } = req.body || {};
  const payload = JSON.stringify({
    title: title || "تنبيه",
    body: body || "لديك تذكير",
    url: url || "/",
  });

  const results = [];
  for (let i = subscribers.length - 1; i >= 0; i--) {
    try {
      await webpush.sendNotification(subscribers[i], payload);
      results.push({ index: i, status: "ok" });
    } catch (err) {
      console.error(
        "Failed to send, removing subscriber",
        err && err.statusCode,
      );
      subscribers.splice(i, 1);
      results.push({ index: i, status: "failed" });
    }
  }

  res.json({ results });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Push server listening on http://localhost:${PORT}`),
);
