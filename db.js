const DB_NAME = "barangay-san-isidro-pwa";
const DB_VERSION = 2;

let dbPromise;

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains("incidents")) {
          const incidents = db.createObjectStore("incidents", { keyPath: "localId" });
          incidents.createIndex("createdAt", "createdAt", { unique: false });
          incidents.createIndex("status", "status", { unique: false });
        }

        if (!db.objectStoreNames.contains("outbox")) {
          const outbox = db.createObjectStore("outbox", { keyPath: "localId" });
          outbox.createIndex("createdAt", "createdAt", { unique: false });
        }

        if (!db.objectStoreNames.contains("contacts")) {
          const contacts = db.createObjectStore("contacts", { keyPath: "id" });
          contacts.createIndex("name", "name", { unique: false });
          contacts.createIndex("role", "role", { unique: false });
          contacts.createIndex("phone", "phone", { unique: false });
        }

        if (!db.objectStoreNames.contains("syncConfig")) {
          db.createObjectStore("syncConfig", { keyPath: "id" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  return dbPromise;
}

function requestAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveIncident(incident) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["incidents", "outbox"], "readwrite");
    tx.objectStore("incidents").put(incident);
    tx.objectStore("outbox").put(incident);
    tx.oncomplete = () => resolve(incident);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllIncidents() {
  const db = await openDB();
  const tx = db.transaction("incidents", "readonly");
  const result = await requestAsPromise(tx.objectStore("incidents").getAll());
  return result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getPendingIncidents() {
  const db = await openDB();
  const tx = db.transaction("outbox", "readonly");
  return requestAsPromise(tx.objectStore("outbox").getAll());
}

export async function markIncidentSynced(localId, remoteId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["incidents", "outbox"], "readwrite");
    const incidentStore = tx.objectStore("incidents");
    const outboxStore = tx.objectStore("outbox");

    const readReq = incidentStore.get(localId);
    readReq.onsuccess = () => {
      const existing = readReq.result;
      if (existing) {
        existing.status = "synced";
        existing.syncedAt = new Date().toISOString();
        existing.lastError = null;
        existing.lastAttemptAt = null;
        existing.syncAttempts = 0;
        existing.nextRetryAt = null;
        if (remoteId) {
          existing.remoteId = remoteId;
        }
        incidentStore.put(existing);
      }

      outboxStore.delete(localId);
    };

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function markIncidentSyncError(localId, errorMessage) {
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

export async function bulkSaveContacts(contacts) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction("contacts", "readwrite");
    const store = tx.objectStore("contacts");

    store.clear();
    contacts.forEach((contact) => store.put(contact));

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllContacts() {
  const db = await openDB();
  const tx = db.transaction("contacts", "readonly");
  const results = await requestAsPromise(tx.objectStore("contacts").getAll());
  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export async function searchContacts(term) {
  const normalized = term.trim().toLowerCase();
  const contacts = await getAllContacts();

  if (!normalized) {
    return contacts;
  }

  return contacts.filter((contact) => {
    const haystack = `${contact.name} ${contact.role} ${contact.phone}`.toLowerCase();
    return haystack.includes(normalized);
  });
}

export async function saveSyncConfig(config) {
  const db = await openDB();
  const payload = {
    id: "default",
    endpoint: config.endpoint,
    authToken: config.authToken ?? "",
    authMode: config.authMode ?? "bearer",
    apiKeyHeader: config.apiKeyHeader ?? "x-api-key",
    signingEnabled: config.signingEnabled ?? false,
    signingSecret: config.signingSecret ?? "",
    signatureHeader: config.signatureHeader ?? "x-signature",
    timestampHeader: config.timestampHeader ?? "x-signature-timestamp",
    nonceHeader: config.nonceHeader ?? "x-signature-nonce",
    updatedAt: new Date().toISOString(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction("syncConfig", "readwrite");
    tx.objectStore("syncConfig").put(payload);
    tx.oncomplete = () => resolve(payload);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getSyncConfig() {
  const db = await openDB();
  const tx = db.transaction("syncConfig", "readonly");
  const result = await requestAsPromise(tx.objectStore("syncConfig").get("default"));
  return result ?? null;
}
