require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const PORT = Number(process.env.PORT || 4000);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const SQLITE_DB_PATH = process.env.SQLITE_DB_PATH || path.join(__dirname, "data", "incidents.db");
const INCIDENTS_LIST_LIMIT = Number(process.env.INCIDENTS_LIST_LIMIT || 500);

const AUTH_MODE = (process.env.SYNC_AUTH_MODE || "none").toLowerCase();
const AUTH_SECRET = process.env.SYNC_AUTH_SECRET || "";
const API_KEY_HEADER = (process.env.SYNC_API_KEY_HEADER || "x-api-key").toLowerCase();

const SIGNING_REQUIRED = String(process.env.SIGNING_REQUIRED || "false").toLowerCase() === "true";
const SIGNING_SECRET = process.env.SIGNING_SECRET || "";
const SIGNATURE_HEADER = (process.env.SIGNATURE_HEADER || "x-signature").toLowerCase();
const SIGNATURE_TIMESTAMP_HEADER = (process.env.SIGNATURE_TIMESTAMP_HEADER || "x-signature-timestamp").toLowerCase();
const SIGNATURE_NONCE_HEADER = (process.env.SIGNATURE_NONCE_HEADER || "x-signature-nonce").toLowerCase();
const SIGNATURE_VERSION = process.env.SIGNATURE_VERSION || "v1";
const SIGNATURE_WINDOW_MS = Number(process.env.SIGNATURE_WINDOW_MS || 300000);

const usedNonces = new Map();
const db = createDatabase(SQLITE_DB_PATH);

app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: false,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "san-isidro-sync-server", storage: "sqlite", dbPath: SQLITE_DB_PATH });
});

app.get("/api/incidents", async (_req, res) => {
  try {
    const incidents = await dbAll(
      db,
      `SELECT
        server_id AS id,
        local_id AS localId,
        description,
        created_at AS createdAt,
        incident_type AS incidentType,
        severity,
        location_text AS locationText,
        location_lat AS locationLat,
        location_lng AS locationLng,
        reporter_email AS reporterEmail,
        reporter_role AS reporterRole,
        received_at AS receivedAt,
        image_filename AS imageFilename,
        image_mime_type AS imageMimeType,
        image_size AS imageSize
      FROM incident_reports
      ORDER BY received_at DESC
      LIMIT ?`,
      [INCIDENTS_LIST_LIMIT]
    );

    res.json({ count: incidents.length, incidents });
  } catch (error) {
    res.status(500).json({ error: "Failed to read incidents" });
  }
});

app.post("/api/incidents", upload.single("image"), async (req, res) => {
  try {
    verifyAuth(req);
    verifySignature(req);

    const body = getRequestBody(req);

    const localId = normalizeString(body.localId);
    const description = normalizeString(body.description);
    const createdAt = normalizeString(body.createdAt);
    const incidentType = normalizeString(body.incidentType);
    const severity = normalizeString(body.severity);
    const locationText = normalizeString(body.locationText);
    const locationLat = normalizeNumber(body.locationLat);
    const locationLng = normalizeNumber(body.locationLng);

    if (!localId || !description || !createdAt) {
      return res.status(400).json({ error: "localId, description and createdAt are required" });
    }

    if (Number.isNaN(Date.parse(createdAt))) {
      return res.status(400).json({ error: "createdAt must be an ISO date string" });
    }

    const imageMeta = req.file
      ? {
          filename: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size,
        }
      : null;

    const id = `inc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const receivedAt = new Date().toISOString();
    const reporterEmail = normalizeString(req.get("x-user-account"));
    const reporterRole = normalizeString(req.get("x-user-role"));

    await dbRun(
      db,
      `INSERT INTO incident_reports (
        server_id,
        local_id,
        description,
        created_at,
        incident_type,
        severity,
        location_text,
        location_lat,
        location_lng,
        reporter_email,
        reporter_role,
        received_at,
        image_filename,
        image_mime_type,
        image_size
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        localId,
        description,
        createdAt,
        incidentType || null,
        severity || null,
        locationText || null,
        locationLat,
        locationLng,
        reporterEmail || null,
        reporterRole || null,
        receivedAt,
        imageMeta?.filename || null,
        imageMeta?.mimeType || null,
        imageMeta?.size || null,
      ]
    );

    return res.status(201).json({ id, status: "accepted" });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      try {
        const existing = await dbGet(
          db,
          `SELECT server_id AS id FROM incident_reports WHERE local_id = ? LIMIT 1`,
          [normalizeString(getRequestBody(req).localId)]
        );

        if (existing?.id) {
          return res.status(200).json({ id: existing.id, status: "duplicate" });
        }
      } catch {
        // Fall through to generic handler.
      }
    }

    const statusCode = error.statusCode || 500;
    const message = error.message || (statusCode >= 500 ? "Internal server error" : "Unauthorized");
    return res.status(statusCode).json({ error: message });
  }
});

app.get("/api/notifications", async (req, res) => {
  try {
    const actorEmail = normalizeString(req.get("x-user-account"));
    const limit = Number(req.query.limit || 100);

    if (!actorEmail) {
      return res.json({ count: 0, notifications: [] });
    }

    const notifications = await dbAll(
      db,
      `SELECT
        notification_id AS id,
        message,
        actor_label AS actorLabel,
        sender_email AS senderEmail,
        created_at AS createdAt,
        broadcast_at AS broadcastAt,
        read_by AS readByJson
      FROM process_notifications
      ORDER BY broadcast_at DESC
      LIMIT ?`,
      [limit]
    );

    const enriched = notifications.map((notif) => {
      let readByArray = [];
      try {
        readByArray = JSON.parse(notif.readByJson || "[]");
      } catch {
        readByArray = [];
      }

      return {
        id: notif.id,
        message: notif.message,
        actorLabel: notif.actorLabel,
        senderEmail: notif.senderEmail,
        createdAt: notif.createdAt,
        readBy: readByArray,
      };
    });

    res.json({ count: enriched.length, notifications: enriched });
  } catch (error) {
    console.error("Failed to read notifications:", error);
    res.status(500).json({ error: "Failed to read notifications" });
  }
});

app.post("/api/notifications", async (req, res) => {
  try {
    verifyAuth(req);
    verifySignature(req);

    const body = getRequestBody(req);
    const notificationId = normalizeString(body.id || body.notificationId);
    const message = normalizeString(body.message);
    const actorLabel = normalizeString(body.actorLabel);
    const senderEmail = normalizeString(body.senderEmail);
    const createdAt = normalizeString(body.createdAt);
    const readBy = Array.isArray(body.readBy) ? body.readBy : [];

    if (!notificationId || !message) {
      return res.status(400).json({ error: "id and message are required" });
    }

    await dbRun(
      db,
      `INSERT OR REPLACE INTO process_notifications (
        notification_id,
        message,
        actor_label,
        sender_email,
        created_at,
        read_by
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        notificationId,
        message,
        actorLabel || null,
        senderEmail || "system@barangay",
        createdAt || new Date().toISOString(),
        JSON.stringify(readBy),
      ]
    );

    res.status(201).json({ id: notificationId, status: "stored" });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message = error.message || (statusCode >= 500 ? "Internal server error" : "Unauthorized");
    return res.status(statusCode).json({ error: message });
  }
});

app.patch("/api/notifications/:id/read", async (req, res) => {
  try {
    verifyAuth(req);

    const notificationId = normalizeString(req.params.id);
    const actorEmail = normalizeString(req.get("x-user-account"));

    if (!notificationId || !actorEmail) {
      return res.status(400).json({ error: "Invalid notification id or actor email" });
    }

    const existing = await dbGet(
      db,
      `SELECT read_by FROM process_notifications WHERE notification_id = ?`,
      [notificationId]
    );

    if (!existing) {
      return res.status(404).json({ error: "Notification not found" });
    }

    let readByArray = [];
    try {
      readByArray = JSON.parse(existing.read_by || "[]");
    } catch {
      readByArray = [];
    }

    if (!readByArray.includes(actorEmail)) {
      readByArray.push(actorEmail);
    }

    await dbRun(
      db,
      `UPDATE process_notifications SET read_by = ? WHERE notification_id = ?`,
      [JSON.stringify(readByArray), notificationId]
    );

    res.json({ id: notificationId, status: "marked-read" });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message = error.message || (statusCode >= 500 ? "Internal server error" : "Unauthorized");
    return res.status(statusCode).json({ error: message });
  }
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(500).json({ error: "Internal server error" });
});

startServer();

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getRequestBody(req) {
  if (!req || typeof req !== "object") {
    return {};
  }

  if (!req.body || typeof req.body !== "object") {
    return {};
  }

  return req.body;
}

function isUniqueConstraintError(error) {
  return Boolean(error) && error.code === "SQLITE_CONSTRAINT";
}

function createDatabase(dbPath) {
  const normalizedPath = path.resolve(dbPath);
  const dbDir = path.dirname(normalizedPath);
  fs.mkdirSync(dbDir, { recursive: true });
  return new sqlite3.Database(normalizedPath);
}

function dbRun(dbInstance, sql, params = []) {
  return new Promise((resolve, reject) => {
    dbInstance.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }

      resolve(this);
    });
  });
}

function dbGet(dbInstance, sql, params = []) {
  return new Promise((resolve, reject) => {
    dbInstance.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(row || null);
    });
  });
}

function dbAll(dbInstance, sql, params = []) {
  return new Promise((resolve, reject) => {
    dbInstance.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(rows || []);
    });
  });
}

async function initDatabase() {
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS incident_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id TEXT NOT NULL UNIQUE,
      local_id TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL,
      incident_type TEXT,
      severity TEXT,
      location_text TEXT,
      location_lat REAL,
      location_lng REAL,
      reporter_email TEXT,
      reporter_role TEXT,
      received_at TEXT NOT NULL,
      image_filename TEXT,
      image_mime_type TEXT,
      image_size INTEGER,
      created_row_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  );

  await dbRun(db, "CREATE INDEX IF NOT EXISTS idx_incident_reports_received_at ON incident_reports(received_at DESC)");
  await dbRun(db, "CREATE INDEX IF NOT EXISTS idx_incident_reports_created_at ON incident_reports(created_at DESC)");

  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS process_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notification_id TEXT NOT NULL UNIQUE,
      message TEXT NOT NULL,
      actor_label TEXT,
      sender_email TEXT NOT NULL,
      created_at TEXT NOT NULL,
      broadcast_at TEXT NOT NULL DEFAULT (datetime('now')),
      read_by TEXT DEFAULT '[]'
    )`
  );

  await dbRun(db, "CREATE INDEX IF NOT EXISTS idx_notifications_broadcast_at ON process_notifications(broadcast_at DESC)");
}

async function startServer() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`Sync verifier server running on http://localhost:${PORT}`);
      console.log(`SQLite database: ${SQLITE_DB_PATH}`);
    });
  } catch (error) {
    console.error("Failed to initialize database", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => {
  db.close(() => {
    process.exit(0);
  });
});

function normalizeNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function verifyAuth(req) {
  if (AUTH_MODE === "none") {
    return;
  }

  if (!AUTH_SECRET) {
    throw withStatus(500, "Server auth secret is not configured");
  }

  if (AUTH_MODE === "bearer") {
    const header = req.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token || token !== AUTH_SECRET) {
      throw withStatus(401, "Invalid bearer token");
    }
    return;
  }

  if (AUTH_MODE === "api-key") {
    const token = req.get(API_KEY_HEADER) || "";
    if (!token || token !== AUTH_SECRET) {
      throw withStatus(401, "Invalid API key");
    }
    return;
  }

  throw withStatus(500, "Unsupported SYNC_AUTH_MODE");
}

function verifySignature(req) {
  if (!SIGNING_REQUIRED) {
    return;
  }

  if (!SIGNING_SECRET) {
    throw withStatus(500, "Signing is enabled but SIGNING_SECRET is missing");
  }

  const signatureVersion = req.get("x-signature-version") || "";
  if (signatureVersion !== SIGNATURE_VERSION) {
    throw withStatus(401, "Unsupported signature version");
  }

  const signature = req.get(SIGNATURE_HEADER) || "";
  const timestamp = req.get(SIGNATURE_TIMESTAMP_HEADER) || "";
  const nonce = req.get(SIGNATURE_NONCE_HEADER) || "";

  if (!signature || !timestamp || !nonce) {
    throw withStatus(401, "Missing signature headers");
  }

  const timestampMs = Date.parse(timestamp);
  if (Number.isNaN(timestampMs)) {
    throw withStatus(401, "Invalid signature timestamp");
  }

  const age = Math.abs(Date.now() - timestampMs);
  if (age > SIGNATURE_WINDOW_MS) {
    throw withStatus(401, "Signature timestamp outside allowed window");
  }

  evictExpiredNonces();
  const existingExpiry = usedNonces.get(nonce);
  if (existingExpiry && existingExpiry > Date.now()) {
    throw withStatus(401, "Replay detected: nonce already used");
  }

  const payload = buildSignaturePayload(req, timestamp, nonce);
  const expected = crypto.createHmac("sha256", SIGNING_SECRET).update(payload).digest("base64");

  const valid = safeCompareBase64(expected, signature);
  if (!valid) {
    throw withStatus(401, "Signature mismatch");
  }

  usedNonces.set(nonce, Date.now() + SIGNATURE_WINDOW_MS);
}

function buildSignaturePayload(req, timestamp, nonce) {
  const body = getRequestBody(req);
  const localId = normalizeString(body.localId);
  const description = normalizeString(body.description);
  const createdAt = normalizeString(body.createdAt);
  const incidentType = normalizeString(body.incidentType);
  const severity = normalizeString(body.severity);
  const locationText = normalizeString(body.locationText);
  const locationLat = normalizeNumber(body.locationLat);
  const locationLng = normalizeNumber(body.locationLng);

  return JSON.stringify({
    localId,
    description,
    createdAt,
    incidentType,
    severity,
    locationText,
    locationLat,
    locationLng,
    imagePresent: Boolean(req.file),
    imageSize: req.file ? req.file.size : 0,
    imageType: req.file ? req.file.mimetype || "" : "",
    timestamp,
    nonce,
  });
}

function safeCompareBase64(left, right) {
  try {
    const a = Buffer.from(left, "base64");
    const b = Buffer.from(right, "base64");
    if (a.length !== b.length) {
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function evictExpiredNonces() {
  const now = Date.now();
  for (const [nonce, expiry] of usedNonces.entries()) {
    if (expiry <= now) {
      usedNonces.delete(nonce);
    }
  }
}

function withStatus(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
