const CACHE_NAME = "barangay-san-isidro-cache-v4";
const DB_NAME = "barangay-san-isidro-pwa";
const DB_VERSION = 2;
const BG_SYNC_TAG = "sync-incidents";
const DEFAULT_SYNC_ENDPOINT = "https://example.com/api/incidents";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./db.js",
  "./manifest.webmanifest",
  "./assets/contacts.json",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-192.svg",
  "./assets/icons/icon-512.svg",
  "https://cdn.tailwindcss.com",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => Promise.resolve())
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag === BG_SYNC_TAG) {
    event.waitUntil(flushOutbox());
  }
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "UPDATE_SYNC_CONFIG") {
    return;
  }

  event.waitUntil(saveSyncConfig(data.payload || {}));
});

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("incidents")) {
        const incidents = db.createObjectStore("incidents", { keyPath: "localId" });
        incidents.createIndex("status", "status", { unique: false });
      }
      if (!db.objectStoreNames.contains("outbox")) {
        db.createObjectStore("outbox", { keyPath: "localId" });
      }
      if (!db.objectStoreNames.contains("contacts")) {
        db.createObjectStore("contacts", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("syncConfig")) {
        db.createObjectStore("syncConfig", { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getOutboxItems() {
  const db = await openDB();
  const tx = db.transaction("outbox", "readonly");
  return requestAsPromise(tx.objectStore("outbox").getAll());
}

async function markSynced(localId, remoteId) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(["incidents", "outbox"], "readwrite");
    const incidents = tx.objectStore("incidents");
    const outbox = tx.objectStore("outbox");

    const readReq = incidents.get(localId);
    readReq.onsuccess = () => {
      const incident = readReq.result;
      if (incident) {
        incident.status = "synced";
        incident.syncedAt = new Date().toISOString();
        incident.lastError = null;
        incident.lastAttemptAt = null;
        incident.syncAttempts = 0;
        incident.nextRetryAt = null;
        if (remoteId) {
          incident.remoteId = remoteId;
        }
        incidents.put(incident);
      }

      outbox.delete(localId);
    };

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function markSyncError(localId, errorMessage) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction("incidents", "readwrite");
    const incidents = tx.objectStore("incidents");
    const readReq = incidents.get(localId);

    readReq.onsuccess = () => {
      const incident = readReq.result;
      if (!incident) {
        return;
      }

      const attempts = (incident.syncAttempts ?? 0) + 1;
      const delayMinutes = Math.min(60, 2 ** (attempts - 1));
      const retryAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();

      incident.status = "pending";
      incident.lastError = errorMessage;
      incident.lastAttemptAt = new Date().toISOString();
      incident.syncAttempts = attempts;
      incident.nextRetryAt = retryAt;
      incidents.put(incident);
    };

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function saveSyncConfig(payload) {
  const db = await openDB();

  const syncConfig = {
    id: "default",
    endpoint: payload.endpoint || DEFAULT_SYNC_ENDPOINT,
    authMode: payload.authMode || "bearer",
    authToken: payload.authToken || "",
    apiKeyHeader: payload.apiKeyHeader || "x-api-key",
    signingEnabled: payload.signingEnabled || false,
    signingSecret: payload.signingSecret || "",
    signatureHeader: payload.signatureHeader || "x-signature",
    timestampHeader: payload.timestampHeader || "x-signature-timestamp",
    nonceHeader: payload.nonceHeader || "x-signature-nonce",
    updatedAt: new Date().toISOString(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction("syncConfig", "readwrite");
    tx.objectStore("syncConfig").put(syncConfig);
    tx.oncomplete = () => resolve(syncConfig);
    tx.onerror = () => reject(tx.error);
  });
}

async function getSyncConfig() {
  const db = await openDB();
  const tx = db.transaction("syncConfig", "readonly");
  const config = await requestAsPromise(tx.objectStore("syncConfig").get("default"));
  return {
    endpoint: config?.endpoint || DEFAULT_SYNC_ENDPOINT,
    authMode: config?.authMode || "none",
    authToken: config?.authToken || "",
    apiKeyHeader: config?.apiKeyHeader || "x-api-key",
    signingEnabled: config?.signingEnabled || false,
    signingSecret: config?.signingSecret || "",
    signatureHeader: config?.signatureHeader || "x-signature",
    timestampHeader: config?.timestampHeader || "x-signature-timestamp",
    nonceHeader: config?.nonceHeader || "x-signature-nonce",
  };
}

function buildAuthHeaders(config) {
  if (!config.authToken || config.authMode === "none") {
    return {};
  }

  if (config.authMode === "api-key") {
    return { [config.apiKeyHeader]: config.authToken };
  }

  return { Authorization: `Bearer ${config.authToken}` };
}

function getNonce() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function toBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function buildSignaturePayload(incident, timestamp, nonce) {
  return JSON.stringify({
    localId: incident.localId,
    description: incident.description,
    createdAt: incident.createdAt,
    incidentType: incident.incidentType || "",
    severity: incident.severity || "",
    locationText: incident.locationText || "",
    locationLat: incident.location?.lat ?? null,
    locationLng: incident.location?.lng ?? null,
    imagePresent: Boolean(incident.imageBlob),
    imageSize: incident.imageBlob?.size ?? 0,
    imageType: incident.imageBlob?.type ?? "",
    timestamp,
    nonce,
  });
}

async function buildSigningHeaders(config, incident) {
  if (!config.signingEnabled) {
    return {};
  }

  const timestamp = new Date().toISOString();
  const nonce = getNonce();
  const signaturePayload = buildSignaturePayload(incident, timestamp, nonce);

  const keyData = new TextEncoder().encode(config.signingSecret);
  const payloadData = new TextEncoder().encode(signaturePayload);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, payloadData);
  const signature = toBase64(signatureBuffer);

  return {
    [config.signatureHeader]: signature,
    [config.timestampHeader]: timestamp,
    [config.nonceHeader]: nonce,
    "x-signature-version": "v1",
  };
}

function validateSyncEndpoint(endpoint) {
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    return { isValid: false, message: "Invalid endpoint URL" };
  }

  const isSecureServiceWorker = self.location.protocol === "https:";
  if (isSecureServiceWorker && parsed.protocol !== "https:") {
    return { isValid: false, message: "Endpoint must use HTTPS" };
  }

  if (parsed.hostname === "example.com") {
    return { isValid: false, message: "Sync endpoint is not configured" };
  }

  return { isValid: true };
}

async function flushOutbox() {
  const syncConfig = await getSyncConfig();
  const endpointValidation = validateSyncEndpoint(syncConfig.endpoint);
  if (!endpointValidation.isValid) {
    return;
  }

  if (syncConfig.authMode !== "none" && !syncConfig.authToken) {
    return;
  }

  if (syncConfig.signingEnabled && !syncConfig.signingSecret) {
    return;
  }

  const pending = await getOutboxItems();
  const now = Date.now();
  const readyToSync = pending.filter((incident) => {
    if (!incident.nextRetryAt) {
      return true;
    }
    return new Date(incident.nextRetryAt).getTime() <= now;
  });

  for (const incident of readyToSync) {
    try {
      const payload = new FormData();
      payload.append("localId", incident.localId);
      payload.append("description", incident.description);
      payload.append("createdAt", incident.createdAt);
      payload.append("incidentType", incident.incidentType || "");
      payload.append("severity", incident.severity || "");
      payload.append("locationText", incident.locationText || "");
      if (incident.location?.lat != null) {
        payload.append("locationLat", String(incident.location.lat));
      }
      if (incident.location?.lng != null) {
        payload.append("locationLng", String(incident.location.lng));
      }
      if (incident.imageBlob) {
        payload.append("image", incident.imageBlob, `${incident.localId}.jpg`);
      }

      const signingHeaders = await buildSigningHeaders(syncConfig, incident);

      const response = await fetch(syncConfig.endpoint, {
        method: "POST",
        body: payload,
        headers: {
          ...buildAuthHeaders(syncConfig),
          ...signingHeaders,
        },
      });

      if (!response.ok) {
        throw new Error(`Could not sync incident (${response.status})`);
      }

      let remoteId = null;
      try {
        const result = await response.json();
        remoteId = result.id ?? result.incidentId ?? result.data?.id ?? null;
      } catch {
        remoteId = null;
      }

      await markSynced(incident.localId, remoteId);
    } catch (error) {
      await markSyncError(incident.localId, error.message || "Background sync failed");
      throw error;
    }
  }
}
