import {
  bulkSaveContacts,
  getAllContacts,
  getAllIncidents,
  getPendingIncidents,
  getSyncConfig,
  markIncidentSyncError,
  markIncidentSynced,
  saveIncident,
} from "./db.js";

const DEFAULT_SYNC_ENDPOINT = "http://localhost:4000/api/incidents";
const DEFAULT_NOTIFICATIONS_ENDPOINT = "http://localhost:4000/api/notifications";
const BG_SYNC_TAG = "sync-incidents";
const NOTIFICATION_POLL_INTERVAL_MS = 8000;
const NOTIFICATION_FETCH_LIMIT = 50;

const networkStatusEl = document.getElementById("networkStatus");
const syncStatusEl = document.getElementById("syncStatus");

const incidentForm = document.getElementById("incidentForm");
const incidentTypeEl = document.getElementById("incidentType");
const incidentSeverityEl = document.getElementById("incidentSeverity");
const incidentLocationEl = document.getElementById("incidentLocation");
const captureLocationBtn = document.getElementById("captureLocationBtn");
const clearLocationBtn = document.getElementById("clearLocationBtn");
const locationStatusEl = document.getElementById("locationStatus");
const incidentTextEl = document.getElementById("incidentText");
const incidentImageEl = document.getElementById("incidentImage");
const imagePreviewEl = document.getElementById("imagePreview");
const incidentListEl = document.getElementById("incidentList");
const incidentItemTemplate = document.getElementById("incidentItemTemplate");
const manualSyncBtn = document.getElementById("manualSyncBtn");

const directorySearchEl = document.getElementById("directorySearch");
const directoryFilterEl = document.getElementById("directoryFilter");
const directoryListEl = document.getElementById("directoryList");
const directoryItemTemplate = document.getElementById("directoryItemTemplate");
const languageSelectEl = document.getElementById("languageSelect");
const quickAccessCards = Array.from(document.querySelectorAll(".action-cards-grid .action-card[href^='#']"));
const quickAccessSectionEl = document.getElementById("quickAccessSection");
const dashboardAppEl = document.getElementById("dashboardApp");
const welcomePageEl = document.getElementById("welcomePage");
const welcomeAboutEl = document.getElementById("welcomeAbout");
const roleStatusEl = document.getElementById("roleStatus");
const actorWelcomeTitleEl = document.getElementById("actorWelcomeTitle");
const actorWelcomeTextEl = document.getElementById("actorWelcomeText");
const actorPrimaryTitleEl = document.getElementById("actorPrimaryTitle");
const actorPrimaryTextEl = document.getElementById("actorPrimaryText");
const actorPrimaryBtnEl = document.getElementById("actorPrimaryBtn");
const actorPrimaryFocusEl = document.getElementById("actorPrimaryFocus");
const actorSyncPrivilegeEl = document.getElementById("actorSyncPrivilege");
const actorVisibleScopeEl = document.getElementById("actorVisibleScope");
const actorQuickActionsEl = document.getElementById("actorQuickActions");
const refreshServerIncidentsBtnEl = document.getElementById("refreshServerIncidentsBtn");
const serverIncidentStatusEl = document.getElementById("serverIncidentStatus");
const serverIncidentListEl = document.getElementById("serverIncidentList");
const serverIncidentSearchEl = document.getElementById("serverIncidentSearch");
const serverIncidentSeverityFilterEl = document.getElementById("serverIncidentSeverityFilter");

const headerMenuToggleBtnEl = document.getElementById("headerMenuToggleBtn");
const headerMenuDropdownEl = document.getElementById("headerMenuDropdown");
const headerAuthGroupEl = document.getElementById("headerAuthGroup");
const headerUserGroupEl = document.getElementById("headerUserGroup");
const headerUserNameEl = document.getElementById("headerUserName");
const headerSignOutBtnEl = document.getElementById("headerSignOutBtn");
const welcomeSignInBtnEl = document.getElementById("welcomeSignInBtn");
const welcomeSignUpBtnEl = document.getElementById("welcomeSignUpBtn");
const heroSignInBtnEl = document.getElementById("heroSignInBtn");
const heroSignUpBtnEl = document.getElementById("heroSignUpBtn");
const notificationShellEl = document.getElementById("notificationShell");
const notificationToggleBtnEl = document.getElementById("notificationToggleBtn");
const notificationPanelEl = document.getElementById("notificationPanel");
const notificationUnreadBadgeEl = document.getElementById("notificationUnreadBadge");
const notificationListEl = document.getElementById("notificationList");
const notificationMarkAllBtnEl = document.getElementById("notificationMarkAllBtn");

const authModalEl = document.getElementById("authModal");
const authModalCloseBtnEl = document.getElementById("authModalCloseBtn");
const authFormEl = document.getElementById("authForm");
const authModalEyebrowEl = document.getElementById("authModalEyebrow");
const authModalTitleEl = document.getElementById("authModalTitle");
const authNameFieldEl = document.getElementById("authNameField");
const authRoleFieldEl = document.getElementById("authRoleField");
const authConfirmFieldEl = document.getElementById("authConfirmField");
const authFullNameEl = document.getElementById("authFullName");
const authEmailEl = document.getElementById("authEmail");
const authRoleEl = document.getElementById("authRole");
const authPasswordEl = document.getElementById("authPassword");
const authConfirmPasswordEl = document.getElementById("authConfirmPassword");
const authErrorEl = document.getElementById("authError");
const authSubmitBtnEl = document.getElementById("authSubmitBtn");
const authSwitchTextEl = document.getElementById("authSwitchText");
const authSwitchBtnEl = document.getElementById("authSwitchBtn");

const USER_STORE_KEY = "san-isidro-actor-users";
const SESSION_STORE_KEY = "san-isidro-active-session";
const NOTIFICATION_STORE_KEY = "san-isidro-process-notifications";
const NOTIFICATION_MAX_ITEMS = 120;
const TOAST_HIDE_DELAY_MS = 2800;

const ROLE_PERMISSIONS = {
  resident: {
    sections: ["about", "incident-reporter", "offline-directory", "emergency-contacts"],
    canSubmitIncident: true,
    canManualSync: false,
    canUseGps: true,
  },
  secretary: {
    sections: ["about", "incident-reporter", "offline-directory", "emergency-contacts", "san-isidro-officials", "incident-monitor"],
    canSubmitIncident: true,
    canManualSync: true,
    canUseGps: true,
  },
  admin: {
    sections: ["about", "incident-reporter", "offline-directory", "emergency-contacts", "san-isidro-officials", "incident-monitor"],
    canSubmitIncident: true,
    canManualSync: true,
    canUseGps: true,
  },
  tanod: {
    sections: ["about", "incident-reporter", "offline-directory", "emergency-contacts", "san-isidro-officials"],
    canSubmitIncident: true,
    canManualSync: true,
    canUseGps: true,
  },
  captain: {
    sections: ["about", "incident-reporter", "offline-directory", "emergency-contacts", "san-isidro-officials", "incident-monitor"],
    canSubmitIncident: false,
    canManualSync: true,
    canUseGps: false,
  },
};

const DEFAULT_ACTOR_USERS = [
  { fullName: "Resident Demo", email: "resident@sanisidro.local", password: "Resident123!", role: "resident" },
  { fullName: "Secretary Demo", email: "secretary@sanisidro.local", password: "Secretary123!", role: "secretary" },
  { fullName: "Admin Demo", email: "admin@sanisidro.local", password: "Admin123!", role: "admin" },
  { fullName: "Tanod Demo", email: "tanod@sanisidro.local", password: "Tanod123!", role: "tanod" },
  { fullName: "Captain Demo", email: "captain@sanisidro.local", password: "Captain123!", role: "captain" },
];

const ROLE_DASHBOARD_PROFILE = {
  resident: {
    summary: "Report issues quickly and access emergency help anytime.",
    focus: "Incident reporting",
    sync: "Auto-sync when online",
    scope: "Core services",
    primaryProcess: {
      title: "Submit an incident report first",
      text: "Residents should start by reporting new concerns so response teams can act quickly.",
      target: "incident-reporter",
      button: "Open Incident Reporter",
    },
    dashboardCards: ["incident-reporter", "emergency-contacts", "offline-directory"],
    actions: [
      { label: "Submit Incident", target: "incident-reporter" },
      { label: "Browse Offline Contacts", target: "offline-directory" },
      { label: "Emergency Numbers", target: "emergency-contacts" },
    ],
  },
  secretary: {
    summary: "Coordinate records and monitor reports for barangay operations.",
    focus: "Case documentation",
    sync: "Manual and auto sync",
    scope: "Core + officials",
    primaryProcess: {
      title: "Review and validate incident queue",
      text: "Secretaries should begin with report quality checks and metadata completion.",
      target: "incident-reporter",
      button: "Review Incident Queue",
    },
    dashboardCards: ["incident-reporter", "incident-monitor", "offline-directory", "san-isidro-officials", "emergency-contacts"],
    actions: [
      { label: "Review Incident Queue", target: "incident-reporter" },
      { label: "Open Incident Monitor", target: "incident-monitor" },
      { label: "Open Officials Directory", target: "san-isidro-officials" },
      { label: "Manage Emergency Directory", target: "offline-directory" },
    ],
  },
  admin: {
    summary: "Oversee end-to-end service delivery and platform readiness.",
    focus: "Operations control",
    sync: "Manual and auto sync",
    scope: "Full barangay view",
    primaryProcess: {
      title: "Start with overall incident pipeline",
      text: "Admins should open incident operations first to ensure no urgent cases are missed.",
      target: "incident-reporter",
      button: "Open Pipeline View",
    },
    dashboardCards: ["incident-monitor", "incident-reporter", "san-isidro-officials", "emergency-contacts", "offline-directory", "about"],
    actions: [
      { label: "Track Incident Pipeline", target: "incident-reporter" },
      { label: "Open Incident Monitor", target: "incident-monitor" },
      { label: "Inspect Officials Channels", target: "san-isidro-officials" },
      { label: "Check Emergency Access", target: "emergency-contacts" },
    ],
  },
  tanod: {
    summary: "Respond to peace-and-order concerns with field-ready context.",
    focus: "Rapid response",
    sync: "Manual and auto sync",
    scope: "Core + officials",
    primaryProcess: {
      title: "Check active reports for field response",
      text: "Tanod personnel should prioritize fresh incident entries and emergency contact readiness.",
      target: "incident-reporter",
      button: "Open Active Reports",
    },
    dashboardCards: ["incident-reporter", "emergency-contacts", "san-isidro-officials", "offline-directory"],
    actions: [
      { label: "Open Incident Reporter", target: "incident-reporter" },
      { label: "Find Emergency Units", target: "emergency-contacts" },
      { label: "Locate Local Officials", target: "san-isidro-officials" },
    ],
  },
  captain: {
    summary: "Lead decisions with visibility across incidents and key contacts.",
    focus: "Executive oversight",
    sync: "Manual sync",
    scope: "Leadership and services",
    primaryProcess: {
      title: "Review governance and coordination channels",
      text: "Captains should begin with officials and emergency coordination for strategic direction.",
      target: "san-isidro-officials",
      button: "Open Officials Panel",
    },
    dashboardCards: ["incident-monitor", "san-isidro-officials", "emergency-contacts", "about", "offline-directory"],
    actions: [
      { label: "Review Incident Monitor", target: "incident-monitor" },
      { label: "Review Community Status", target: "about" },
      { label: "Open Officials Panel", target: "san-isidro-officials" },
      { label: "Emergency Coordination", target: "emergency-contacts" },
    ],
  },
};

let swRegistration;
let swRegistrationPromise = null;
let allContactsCache = [];
let activeLanguage = "en";
let currentUser = null;
let headerMenuOpen = false;
let currentRole = "resident";
let authMode = "signin";
let dashboardInitialized = false;
let locationMeta = null;
let syncConfig = {
  endpoint: DEFAULT_SYNC_ENDPOINT,
  authMode: "none",
  authToken: "",
  apiKeyHeader: "x-api-key",
  signingEnabled: false,
  signingSecret: "",
  signatureHeader: "x-signature",
  timestampHeader: "x-signature-timestamp",
  nonceHeader: "x-signature-nonce",
};
let remoteIncidentsCache = [];
let notificationsCache = [];
let notificationPanelOpen = false;
let notificationChannel = null;
let toastHideTimer = null;
let notificationPollTimer = null;
let backendNotificationsLastSync = 0;
let isNotificationPollingActive = false;

const I18N = {
  en: {
    headerAssist: "Fast digital support for all constituents",
    language: "Language",
    heroTitle: "A Safer, Smarter Community Response Platform",
    heroText:
      "Report incidents quickly, find emergency support offline, and stay connected with trusted local officials through a secure, resilient community dashboard.",
    reportIncident: "Report Incident",
    emergencyContacts: "Emergency Contacts",
    localIncidentReporter: "Local Incident Reporter",
    incidentReporterHint: "Capture details and image evidence. Reports are saved even without internet.",
    incidentType: "Incident Type",
    severity: "Severity",
    incidentDetails: "Incident Details",
    imageEvidence: "Image Evidence (optional)",
    saveReport: "Save Report",
    syncNow: "Sync Now",
    offlineDirectory: "Searchable Offline Directory",
    offlineDirectoryHint: "Emergency contacts are pre-cached and searchable offline.",
    filterByService: "Filter by service",
    searchContacts: "Search contacts",
    syncSimpleNote: "Your report is saved on this device and will sync automatically when service is ready.",
    syncSavedLocal: "Saved locally",
    syncWaiting: "Waiting for connection",
    syncWaitingService: "Saved locally, waiting for service",
    syncComplete: "Sync complete",
    syncInProgress: "Syncing",
    syncDelayed: "Saved locally, retrying later",
    locationReady: "Location ready",
    locationCleared: "Location cleared",
    locationUnavailable: "Geolocation is unavailable on this device",
    locationDenied: "Location access denied",
    locationPending: "Locating...",
  },
  fil: {
    headerAssist: "Mabilis na digital na suporta para sa lahat ng mamamayan",
    language: "Wika",
    heroTitle: "Mas Ligtas at Mas Matalinong Plataporma ng Komunidad",
    heroText:
      "Mag-ulat ng insidente agad, humanap ng emergency support kahit offline, at manatiling konektado sa mga opisyal sa pamamagitan ng ligtas at matatag na dashboard.",
    reportIncident: "Mag-ulat ng Insidente",
    emergencyContacts: "Mga Emergency Contact",
    localIncidentReporter: "Tagapag-ulat ng Lokal na Insidente",
    incidentReporterHint: "Maglagay ng detalye at larawan. Naii-save ang ulat kahit walang internet.",
    incidentType: "Uri ng Insidente",
    severity: "Antas ng Bigat",
    incidentDetails: "Detalye ng Insidente",
    imageEvidence: "Larawang Ebidensya (opsyonal)",
    saveReport: "I-save ang Ulat",
    syncNow: "I-sync Ngayon",
    offlineDirectory: "Offline na Directory na Maaaring Hanapin",
    offlineDirectoryHint: "Naka-pre-cache ang emergency contacts at maaaring hanapin kahit offline.",
    filterByService: "Salain ayon sa serbisyo",
    searchContacts: "Hanapin ang contact",
    syncSimpleNote: "Nai-save ang ulat sa device at awtomatikong magsi-sync kapag handa na ang serbisyo.",
    syncSavedLocal: "Nai-save lokal",
    syncWaiting: "Naghihintay ng koneksyon",
    syncWaitingService: "Nai-save lokal, naghihintay ng serbisyo",
    syncComplete: "Tapos ang sync",
    syncInProgress: "Nagsi-sync",
    syncDelayed: "Nai-save lokal, susubok muli mamaya",
    locationReady: "Handa na ang lokasyon",
    locationCleared: "Nalinis ang lokasyon",
    locationUnavailable: "Hindi available ang geolocation sa device na ito",
    locationDenied: "Hindi pinayagan ang access sa lokasyon",
    locationPending: "Kinukuha ang lokasyon...",
  },
  ceb: {
    headerAssist: "Paspas nga digital nga suporta alang sa tanang lumulupyo",
    language: "Pinulongan",
    heroTitle: "Mas Luwas ug Mas Maalamon nga Plataporma sa Komunidad",
    heroText:
      "Pagreport sa insidente dayon, pangitaa ang emerhensya nga suporta bisan offline, ug magpabiling konektado sa mga opisyal pinaagi sa luwas ug lig-on nga dashboard.",
    reportIncident: "I-report ang Insidente",
    emergencyContacts: "Mga Emergency Contact",
    localIncidentReporter: "Tigreport sa Lokal nga Insidente",
    incidentReporterHint: "Ibutang ang detalye ug hulagway. Masave ang report bisan walay internet.",
    incidentType: "Klase sa Insidente",
    severity: "Kabug-aton",
    incidentDetails: "Detalye sa Insidente",
    imageEvidence: "Hulagway nga Ebidensya (opsyonal)",
    saveReport: "I-save ang Report",
    syncNow: "I-sync Karon",
    offlineDirectory: "Offline Directory nga Mahimong Pangitaon",
    offlineDirectoryHint: "Naka-pre-cache ang emergency contacts ug mapangita bisan offline.",
    filterByService: "Pilia sumala sa serbisyo",
    searchContacts: "Pangitaa ang contact",
    syncSimpleNote: "Nasave ang report sa device ug awtomatikong mo-sync kung andam na ang serbisyo.",
    syncSavedLocal: "Nasave sa lokal",
    syncWaiting: "Naghulat og koneksyon",
    syncWaitingService: "Nasave sa lokal, naghulat sa serbisyo",
    syncComplete: "Human ang sync",
    syncInProgress: "Naga-sync",
    syncDelayed: "Nasave sa lokal, mosulay pag-usab unya",
    locationReady: "Andam na ang lokasyon",
    locationCleared: "Na-clear ang lokasyon",
    locationUnavailable: "Dili available ang geolocation sa kini nga device",
    locationDenied: "Gidili ang pag-access sa lokasyon",
    locationPending: "Gikuha ang lokasyon...",
  },
};

function getRoleLabel(role) {
  switch (role) {
    case "secretary":
      return "Secretary";
    case "admin":
      return "Admin";
    case "tanod":
      return "Tanod";
    case "captain":
      return "Captain";
    default:
      return "Resident";
  }
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function getStoredUsers() {
  try {
    const raw = localStorage.getItem(USER_STORE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed;
  } catch {
    return [];
  }
}

function saveUsers(users) {
  try {
    localStorage.setItem(USER_STORE_KEY, JSON.stringify(users));
  } catch {
    // Ignore storage restrictions in locked browser environments.
  }
}

function ensureSeedUsers() {
  const existing = getStoredUsers();
  if (existing.length) {
    return;
  }

  saveUsers(DEFAULT_ACTOR_USERS);
}

function getStoredSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_STORE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.email) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function saveSession(user) {
  try {
    sessionStorage.setItem(
      SESSION_STORE_KEY,
      JSON.stringify({
        fullName: user.fullName,
        email: normalizeEmail(user.email),
        role: user.role,
      })
    );
  } catch {
    // Ignore storage restrictions in locked browser environments.
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_STORE_KEY);
  } catch {
    // Ignore storage restrictions in locked browser environments.
  }
}

function getNotificationActorId() {
  return normalizeEmail(currentUser?.email) || "anonymous";
}

function loadStoredNotifications() {
  try {
    const raw = localStorage.getItem(NOTIFICATION_STORE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStoredNotifications(items) {
  try {
    localStorage.setItem(NOTIFICATION_STORE_KEY, JSON.stringify(items.slice(0, NOTIFICATION_MAX_ITEMS)));
  } catch {
    // Ignore storage restrictions in locked browser environments.
  }
}

function setNotificationPanelOpen(isOpen) {
  if (!notificationToggleBtnEl || !notificationPanelEl) {
    return;
  }

  notificationPanelOpen = Boolean(isOpen);
  notificationPanelEl.classList.toggle("app-hidden", !notificationPanelOpen);
  notificationToggleBtnEl.setAttribute("aria-expanded", String(notificationPanelOpen));

  if (notificationPanelOpen) {
    markAllNotificationsRead();
  }
}

function getUnreadNotificationCount() {
  const actorId = getNotificationActorId();
  return notificationsCache.reduce((count, item) => {
    const readBy = Array.isArray(item.readBy) ? item.readBy : [];
    return readBy.includes(actorId) ? count : count + 1;
  }, 0);
}

function updateNotificationBadge() {
  if (!notificationUnreadBadgeEl) {
    return;
  }

  const unreadCount = getUnreadNotificationCount();
  notificationUnreadBadgeEl.textContent = String(unreadCount);
  notificationUnreadBadgeEl.classList.toggle("app-hidden", unreadCount === 0);
}

function renderNotifications() {
  if (!notificationListEl) {
    return;
  }

  notificationListEl.innerHTML = "";

  if (!notificationsCache.length) {
    notificationListEl.innerHTML = '<li class="notification-empty">No new updates.</li>';
    updateNotificationBadge();
    return;
  }

  const actorId = getNotificationActorId();
  const visibleItems = [...notificationsCache]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 30);

  visibleItems.forEach((item) => {
    const li = document.createElement("li");
    const readBy = Array.isArray(item.readBy) ? item.readBy : [];
    const isUnread = !readBy.includes(actorId);
    li.className = `notification-item ${isUnread ? "notification-unread" : ""}`;

    const messageEl = document.createElement("p");
    messageEl.className = "notification-message";
    messageEl.textContent = item.message;

    const metaEl = document.createElement("p");
    metaEl.className = "notification-meta";
    metaEl.textContent = `${item.actorLabel || "System"} • ${formatDate(item.createdAt)}`;

    li.appendChild(messageEl);
    li.appendChild(metaEl);
    notificationListEl.appendChild(li);
  });

  updateNotificationBadge();
}

function markAllNotificationsRead() {
  if (!currentUser) {
    return;
  }

  const actorId = getNotificationActorId();
  let changed = false;
  const unreadNotificationIds = [];

  notificationsCache = notificationsCache.map((item) => {
    const readBy = Array.isArray(item.readBy) ? [...item.readBy] : [];
    if (!readBy.includes(actorId)) {
      readBy.push(actorId);
      unreadNotificationIds.push(item.id);
      changed = true;
    }

    return {
      ...item,
      readBy,
    };
  });

  if (changed) {
    saveStoredNotifications(notificationsCache);

    // Sync read status to backend for each notification
    unreadNotificationIds.forEach((notificationId) => {
      syncNotificationReadStatus(notificationId, true).catch(() => {
        // Silently fail
      });
    });
  }

  renderNotifications();
}

function mergeIncomingNotification(item) {
  if (!item || !item.id) {
    return;
  }

  const existing = notificationsCache.find((note) => note.id === item.id);
  if (existing) {
    return;
  }

  notificationsCache.unshift(item);
  notificationsCache = notificationsCache.slice(0, NOTIFICATION_MAX_ITEMS);
  saveStoredNotifications(notificationsCache);
  renderNotifications();
}

function pushProcessNotification(item, options = {}) {
  const notification = {
    id: item.id || crypto.randomUUID(),
    message: item.message,
    actorLabel: item.actorLabel || "Actor",
    senderEmail: item.senderEmail || "",
    createdAt: item.createdAt || new Date().toISOString(),
    readBy: Array.isArray(item.readBy) ? item.readBy : [],
  };

  mergeIncomingNotification(notification);

  if (options.broadcast && notificationChannel) {
    notificationChannel.postMessage({ type: "PROCESS_NOTIFICATION", payload: notification });
  }

  // Send to backend for multi-device sync
  sendNotificationToBackend(notification).catch(() => {
    // Silently fail, notification is still stored locally
  });
}

function notifyAllActorsProcessUpdate(context = {}) {
  if (!currentUser) {
    return;
  }

  const actorName = currentUser.fullName || "An actor";
  const actorRole = getRoleLabel(currentUser.role);
  const summaryParts = [context.incidentType, context.severity].filter(Boolean);
  const summary = summaryParts.length ? ` (${summaryParts.join(" / ")})` : "";

  pushProcessNotification(
    {
      message: `${actorName} sent a process update to all actors${summary}.`,
      actorLabel: `${actorName} (${actorRole})`,
      senderEmail: normalizeEmail(currentUser.email),
      readBy: [getNotificationActorId()],
    },
    { broadcast: true }
  );
}

function initializeNotificationSystem() {
  notificationsCache = loadStoredNotifications();
  renderNotifications();

  if ("BroadcastChannel" in window) {
    notificationChannel = new BroadcastChannel("san-isidro-process-notifications");
    notificationChannel.addEventListener("message", (event) => {
      const data = event.data;
      if (!data || data.type !== "PROCESS_NOTIFICATION") {
        return;
      }

      mergeIncomingNotification(data.payload);
    });
  }

  window.addEventListener("storage", (event) => {
    if (event.key !== NOTIFICATION_STORE_KEY) {
      return;
    }

    notificationsCache = loadStoredNotifications();
    renderNotifications();
  });
}

async function fetchBackendNotifications() {
  if (!currentUser || !navigator.onLine) {
    return [];
  }

  const config = getEffectiveSyncConfig();
  const notificationsEndpoint = buildNotificationsEndpoint(config.endpoint);

  try {
    const response = await fetch(notificationsEndpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...getRoleHeaders(),
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const notifications = Array.isArray(data.notifications) ? data.notifications : [];
    return notifications;
  } catch (error) {
    console.warn("Failed to fetch backend notifications:", error);
    return [];
  }
}

function buildNotificationsEndpoint(incidentsEndpoint) {
  if (!incidentsEndpoint) {
    return DEFAULT_NOTIFICATIONS_ENDPOINT;
  }

  const urlStr = String(incidentsEndpoint).trim();
  if (urlStr.endsWith("/api/incidents")) {
    return urlStr.replace("/api/incidents", "/api/notifications");
  }

  if (urlStr.endsWith("/incidents")) {
    return urlStr.replace("/incidents", "/notifications");
  }

  if (!urlStr.includes("://")) {
    return DEFAULT_NOTIFICATIONS_ENDPOINT;
  }

  try {
    const url = new URL(urlStr);
    url.pathname = url.pathname.replace(/\/api\/incidents\/?$/, "/api/notifications");
    if (url.pathname === "/" || url.pathname === "") {
      url.pathname = "/api/notifications";
    }
    return url.toString();
  } catch {
    return DEFAULT_NOTIFICATIONS_ENDPOINT;
  }
}

async function mergeBackendNotifications(backendNotifications) {
  if (!Array.isArray(backendNotifications) || !backendNotifications.length) {
    return;
  }

  const actorId = getNotificationActorId();
  let hasChanges = false;

  const backendIds = new Set(backendNotifications.map((n) => n.id));
  const localIds = new Set(notificationsCache.map((n) => n.id));

  // Add new backend notifications to local cache
  for (const backendNotif of backendNotifications) {
    if (!localIds.has(backendNotif.id)) {
      const enriched = {
        id: backendNotif.id,
        message: backendNotif.message,
        actorLabel: backendNotif.actorLabel,
        senderEmail: backendNotif.senderEmail,
        createdAt: backendNotif.createdAt,
        readBy: Array.isArray(backendNotif.readBy) ? backendNotif.readBy : [],
     };

      notificationsCache.unshift(enriched);
      hasChanges = true;
    } else {
      // Update readBy status for existing notifications
      const existing = notificationsCache.find((n) => n.id === backendNotif.id);
      if (existing) {
        const backendReadBy = Array.isArray(backendNotif.readBy) ? backendNotif.readBy : [];
        const wasUnread = !existing.readBy.includes(actorId);
        const isNowRead = backendReadBy.includes(actorId);

        if (wasUnread && isNowRead) {
          existing.readBy = backendReadBy;
          hasChanges = true;
        }
      }
    }
  }

  if (hasChanges) {
    notificationsCache = notificationsCache.slice(0, NOTIFICATION_MAX_ITEMS);
    saveStoredNotifications(notificationsCache);
    renderNotifications();
  }
}

async function sendNotificationToBackend(notification) {
  if (!currentUser || !navigator.onLine) {
    return false;
  }

  const config = getEffectiveSyncConfig();
  const notificationsEndpoint = buildNotificationsEndpoint(config.endpoint);

  try {
    const response = await fetch(notificationsEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getRoleHeaders(),
        ...getAuthHeaders(config),
      },
      body: JSON.stringify({
        id: notification.id,
        message: notification.message,
        actorLabel: notification.actorLabel,
        senderEmail: notification.senderEmail,
        createdAt: notification.createdAt,
        readBy: notification.readBy || [],
      }),
    });

    if (!response.ok) {
      return false;
    }

    return true;
  } catch (error) {
    console.warn("Failed to send notification to backend:", error);
    return false;
  }
}

async function syncNotificationReadStatus(notificationId, isRead) {
  if (!currentUser || !navigator.onLine) {
    return;
  }

  const config = getEffectiveSyncConfig();
  const endpoint = buildNotificationsEndpoint(config.endpoint);
  const readEndpoint = `${endpoint}/${notificationId}/read`;

  try {
    await fetch(readEndpoint, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...getRoleHeaders(),
        ...getAuthHeaders(config),
      },
    });
  } catch (error) {
    console.warn("Failed to sync notification read status:", error);
  }
}

async function pollBackendNotifications() {
  if (!currentUser || !navigator.onLine || isNotificationPollingActive) {
    return;
  }

  const now = Date.now();
  if (now - backendNotificationsLastSync < NOTIFICATION_POLL_INTERVAL_MS) {
    return;
  }

  isNotificationPollingActive = true;
  backendNotificationsLastSync = now;

  try {
    const backendNotifications = await fetchBackendNotifications();
    await mergeBackendNotifications(backendNotifications);
  } finally {
    isNotificationPollingActive = false;
  }
}

function startNotificationPolling() {
  if (notificationPollTimer) {
    return;
  }

  notificationPollTimer = setInterval(() => {
    pollBackendNotifications();
  }, NOTIFICATION_POLL_INTERVAL_MS);

  // Initial poll
  pollBackendNotifications();
}

function stopNotificationPolling() {
  if (notificationPollTimer) {
    clearInterval(notificationPollTimer);
    notificationPollTimer = null;
  }
}

function setAuthModalOpen(isOpen) {
  if (!authModalEl) {
    return;
  }

  authModalEl.classList.toggle("auth-modal-open", isOpen);
  authModalEl.setAttribute("aria-hidden", String(!isOpen));
}

function setHeaderMenuOpen(isOpen) {
  if (!headerMenuToggleBtnEl || !headerMenuDropdownEl) {
    return;
  }

  headerMenuOpen = Boolean(isOpen);
  headerMenuDropdownEl.classList.toggle("app-hidden", !headerMenuOpen);
  headerMenuToggleBtnEl.setAttribute("aria-expanded", String(headerMenuOpen));
}

function bindHeaderMenuEvents() {
  if (!headerMenuToggleBtnEl || !headerMenuDropdownEl) {
    return;
  }

  headerMenuToggleBtnEl.addEventListener("click", () => {
    setHeaderMenuOpen(!headerMenuOpen);
  });

  notificationToggleBtnEl?.addEventListener("click", () => {
    setNotificationPanelOpen(!notificationPanelOpen);
  });

  notificationMarkAllBtnEl?.addEventListener("click", () => {
    markAllNotificationsRead();
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    const clickedInsideMenu = headerMenuDropdownEl.contains(target);
    const clickedMenuToggle = headerMenuToggleBtnEl.contains(target);
    if (!clickedInsideMenu && !clickedMenuToggle) {
      setHeaderMenuOpen(false);
    }

    const clickedInsideNotifications = notificationPanelEl?.contains(target) || false;
    const clickedNotificationToggle = notificationToggleBtnEl?.contains(target) || false;
    if (!clickedInsideNotifications && !clickedNotificationToggle) {
      setNotificationPanelOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setHeaderMenuOpen(false);
      setNotificationPanelOpen(false);
    }
  });
}

function resetAuthError() {
  if (!authErrorEl) {
    return;
  }

  authErrorEl.textContent = "";
  authErrorEl.classList.add("app-hidden");
}

function showAuthError(message) {
  if (!authErrorEl) {
    return;
  }

  authErrorEl.textContent = message;
  authErrorEl.classList.remove("app-hidden");
}

function setAuthMode(mode) {
  authMode = mode === "signup" ? "signup" : "signin";
  resetAuthError();

  const isSignUp = authMode === "signup";
  authNameFieldEl.classList.toggle("app-hidden", !isSignUp);
  authConfirmFieldEl.classList.toggle("app-hidden", !isSignUp);
  authRoleFieldEl.classList.remove("app-hidden");

  if (isSignUp) {
    authModalEyebrowEl.textContent = "Create Account";
    authModalTitleEl.textContent = "Sign up for barangay access";
    authSubmitBtnEl.textContent = "Create Account";
    authSwitchTextEl.textContent = "Already have an account?";
    authSwitchBtnEl.textContent = "Sign In";
    authPasswordEl.setAttribute("autocomplete", "new-password");
    authConfirmPasswordEl.setAttribute("required", "required");
  } else {
    authModalEyebrowEl.textContent = "Welcome Back";
    authModalTitleEl.textContent = "Sign in to continue";
    authSubmitBtnEl.textContent = "Sign In";
    authSwitchTextEl.textContent = "No account yet?";
    authSwitchBtnEl.textContent = "Sign Up";
    authPasswordEl.setAttribute("autocomplete", "current-password");
    authConfirmPasswordEl.removeAttribute("required");
  }
}

function openAuthModal(mode) {
  setAuthMode(mode);
  authFormEl.reset();
  setAuthModalOpen(true);
  authEmailEl.focus();
}

function closeAuthModal() {
  setAuthModalOpen(false);
}

function setAuthenticatedState(user) {
  currentUser = user;
  currentRole = user?.role || "resident";

  const isAuthenticated = Boolean(user);
  headerAuthGroupEl.classList.toggle("app-hidden", isAuthenticated);
  headerUserGroupEl.classList.toggle("app-hidden", !isAuthenticated);
  notificationShellEl?.classList.toggle("app-hidden", !isAuthenticated);
  setHeaderMenuOpen(false);
  setNotificationPanelOpen(false);

  if (isAuthenticated) {
    headerUserNameEl.textContent = `${user.fullName} (${getRoleLabel(user.role)})`;
    if (welcomePageEl) {
      welcomePageEl.classList.add("app-hidden");
    }
    if (welcomeAboutEl) {
      welcomeAboutEl.classList.add("app-hidden");
    }
    dashboardAppEl.classList.remove("app-hidden");
    notificationsCache = loadStoredNotifications();
    renderNotifications();
    startNotificationPolling();
  } else {
    headerUserNameEl.textContent = "";
    if (welcomePageEl) {
      welcomePageEl.classList.remove("app-hidden");
    }
    if (welcomeAboutEl) {
      welcomeAboutEl.classList.remove("app-hidden");
    }
    dashboardAppEl.classList.add("app-hidden");
    stopNotificationPolling();
  }

  applyRole(currentRole);
}

function registerAccount({ fullName, email, password, role }) {
  const users = getStoredUsers();
  const normalizedEmail = normalizeEmail(email);
  const normalizedName = String(fullName || "").trim();

  if (!normalizedName || !normalizedEmail || !password || !ROLE_PERMISSIONS[role]) {
    return { ok: false, message: "Please fill all required fields." };
  }

  if (password.length < 8) {
    return { ok: false, message: "Password must be at least 8 characters." };
  }

  const exists = users.some((user) => normalizeEmail(user.email) === normalizedEmail);
  if (exists) {
    return { ok: false, message: "An account with this email already exists." };
  }

  const createdUser = {
    fullName: normalizedName,
    email: normalizedEmail,
    password,
    role,
  };

  users.push(createdUser);
  saveUsers(users);
  return { ok: true, user: createdUser };
}

function authenticateAccount({ email, password, role }) {
  const users = getStoredUsers();
  const normalizedEmail = normalizeEmail(email);
  const account = users.find((user) => normalizeEmail(user.email) === normalizedEmail);

  if (!account || account.password !== password) {
    return { ok: false, message: "Invalid email or password." };
  }

  if (role && account.role !== role) {
    return { ok: false, message: "Selected role does not match this account." };
  }

  return { ok: true, user: account };
}

function applyRole(role) {
  const resolvedRole = ROLE_PERMISSIONS[role] ? role : "resident";
  const permissions = ROLE_PERMISSIONS[resolvedRole];
  const profile = ROLE_DASHBOARD_PROFILE[resolvedRole] || ROLE_DASHBOARD_PROFILE.resident;
  const visibleDashboardCards = profile.dashboardCards || permissions.sections;

  ["about", "incident-reporter", "offline-directory", "emergency-contacts", "san-isidro-officials", "incident-monitor"].forEach((sectionId) => {
    const section = document.getElementById(sectionId);
    if (!section) {
      return;
    }

    const allowed = permissions.sections.includes(sectionId);
    section.classList.toggle("app-hidden", !allowed);
  });

  quickAccessCards.forEach((card) => {
    const targetId = card.getAttribute("href").replace("#", "");
    const allowed = permissions.sections.includes(targetId) && visibleDashboardCards.includes(targetId);
    card.classList.toggle("app-hidden", !allowed);

    const targetOrder = visibleDashboardCards.indexOf(targetId);
    card.style.order = targetOrder >= 0 ? String(targetOrder) : "99";
  });

  if (quickAccessSectionEl) {
    const visibleCount = quickAccessCards.filter((card) => !card.classList.contains("app-hidden")).length;
    quickAccessSectionEl.classList.toggle("app-hidden", visibleCount === 0);
  }

  if (roleStatusEl) {
    roleStatusEl.textContent = `Role: ${getRoleLabel(resolvedRole)}`;
  }

  const submitBtn = incidentForm?.querySelector("button[type='submit']");
  if (submitBtn) {
    submitBtn.classList.toggle("app-hidden", !permissions.canSubmitIncident);
  }

  manualSyncBtn.classList.toggle("app-hidden", !permissions.canManualSync);
  captureLocationBtn.classList.toggle("app-hidden", !permissions.canUseGps);
  clearLocationBtn.classList.toggle("app-hidden", !permissions.canUseGps);

  updateActorCockpit(resolvedRole, permissions);

  const primaryTarget = profile.primaryProcess?.target;
  const fallbackTarget = permissions.sections[0] || "about";
  const landingTarget = permissions.sections.includes(primaryTarget) ? primaryTarget : fallbackTarget;
  setActiveQuickAccessCard(landingTarget);

  if (permissions.sections.includes("incident-monitor")) {
    void refreshServerIncidents();
  }
}

function updateActorCockpit(role, permissions) {
  if (!actorWelcomeTitleEl || !actorWelcomeTextEl || !actorPrimaryTitleEl || !actorPrimaryTextEl || !actorPrimaryBtnEl || !actorPrimaryFocusEl || !actorSyncPrivilegeEl || !actorVisibleScopeEl || !actorQuickActionsEl) {
    return;
  }

  const profile = ROLE_DASHBOARD_PROFILE[role] || ROLE_DASHBOARD_PROFILE.resident;
  const actorName = currentUser?.fullName || "User";
  const primaryProcess = profile.primaryProcess || ROLE_DASHBOARD_PROFILE.resident.primaryProcess;

  actorWelcomeTitleEl.textContent = `Welcome, ${actorName}`;
  actorWelcomeTextEl.textContent = profile.summary;
  actorPrimaryTitleEl.textContent = primaryProcess.title;
  actorPrimaryTextEl.textContent = primaryProcess.text;
  actorPrimaryBtnEl.href = `#${primaryProcess.target}`;
  actorPrimaryBtnEl.textContent = primaryProcess.button;
  actorPrimaryBtnEl.onclick = () => setActiveQuickAccessCard(primaryProcess.target);
  actorPrimaryFocusEl.textContent = profile.focus;
  actorSyncPrivilegeEl.textContent = profile.sync;
  actorVisibleScopeEl.textContent = profile.scope;

  actorQuickActionsEl.innerHTML = "";
  profile.actions
    .filter((action) => permissions.sections.includes(action.target))
    .forEach((action) => {
      const link = document.createElement("a");
      link.href = `#${action.target}`;
      link.className = "actor-action-chip";
      link.textContent = action.label;
      link.addEventListener("click", () => {
        setActiveQuickAccessCard(action.target);
      });
      actorQuickActionsEl.appendChild(link);
    });
}

function t(key) {
  return I18N[activeLanguage]?.[key] || I18N.en[key] || key;
}

function getDefaultLocationStatusText() {
  if (activeLanguage === "fil") {
    return "Wala pang GPS fix";
  }
  if (activeLanguage === "ceb") {
    return "Wala pay GPS fix";
  }
  return "No GPS fix yet";
}

function applyLanguage(lang) {
  activeLanguage = I18N[lang] ? lang : "en";

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const text = t(key);
    if (text) {
      el.textContent = text;
    }
  });

  incidentTextEl.placeholder =
    activeLanguage === "fil"
      ? "Ilarawan ang nangyari, saan, at kailan..."
      : activeLanguage === "ceb"
        ? "Ihulagway ang nahitabo, asa, ug kanus-a..."
        : "Describe what happened, where, and when...";
  incidentLocationEl.placeholder =
    activeLanguage === "fil"
      ? "Sitio/Purok, palatandaan, o kalsada"
      : activeLanguage === "ceb"
        ? "Sitio/Purok, ilhanan, o dalan"
        : "Sitio/Purok, landmark, or street";
  directorySearchEl.placeholder =
    activeLanguage === "fil"
      ? "Maghanap ayon sa pangalan, tungkulin, o numero"
      : activeLanguage === "ceb"
        ? "Pangitaa pinaagi sa ngalan, papel, o numero"
        : "Search by name, role, or number";

  if (!locationMeta && !incidentLocationEl.value.trim()) {
    locationStatusEl.className = "status-pill status-idle";
    locationStatusEl.textContent = getDefaultLocationStatusText();
  }
}

function getTimelineLabels() {
  if (activeLanguage === "fil") {
    return {
      queued: "Naka-queue",
      processing: "Pinoproseso",
      retry: "Muling Susubok",
      synced: "Na-sync",
    };
  }

  if (activeLanguage === "ceb") {
    return {
      queued: "Nakapila",
      processing: "Giproseso",
      retry: "Mosulay pag-usab",
      synced: "Na-sync",
    };
  }

  return {
    queued: "Queued",
    processing: "Processing",
    retry: "Retry Scheduled",
    synced: "Synced",
  };
}

function setNetworkStatus(isOnline) {
  networkStatusEl.textContent = isOnline ? "Online" : "Offline";
  networkStatusEl.className = `status-pill ${isOnline ? "status-online" : "status-offline"}`;
}

function setSyncStatus(state, label) {
  syncStatusEl.textContent = label;
  syncStatusEl.className = `status-pill ${state}`;
}

function ensureToastElement() {
  let toastEl = document.getElementById("appToast");
  if (toastEl) {
    return toastEl;
  }

  toastEl = document.createElement("div");
  toastEl.id = "appToast";
  toastEl.className = "app-toast app-hidden";
  toastEl.setAttribute("role", "status");
  toastEl.setAttribute("aria-live", "polite");
  document.body.appendChild(toastEl);
  return toastEl;
}

function showToast(message, tone = "info") {
  const toastEl = ensureToastElement();
  toastEl.textContent = message;
  toastEl.className = `app-toast app-toast-${tone}`;

  if (toastHideTimer) {
    clearTimeout(toastHideTimer);
  }

  toastHideTimer = window.setTimeout(() => {
    toastEl.classList.add("app-hidden");
  }, TOAST_HIDE_DELAY_MS);
}

function announceSyncOutcome(syncResult, context = "sync") {
  if (!syncResult || typeof syncResult !== "object") {
    return;
  }

  if (syncResult.synced > 0) {
    showToast("Report synced to server.", "success");
    return;
  }

  if (syncResult.failed) {
    showToast("Report saved locally. Sync delayed and will retry.", "warning");
    return;
  }

  if (context === "manual" && syncResult.reason === "none-pending") {
    showToast("No pending reports to sync.", "info");
    return;
  }

  if (
    syncResult.reason === "offline" ||
    syncResult.reason === "not-configured" ||
    syncResult.reason === "retry-window"
  ) {
    showToast("Report saved locally. Will sync when service is ready.", "info");
  }
}

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString();
}

function getEffectiveSyncConfig() {
  const endpoint = syncConfig.endpoint?.trim() || DEFAULT_SYNC_ENDPOINT;
  const authMode = syncConfig.authMode || "bearer";
  const authToken = syncConfig.authToken?.trim() || "";
  const apiKeyHeader = (syncConfig.apiKeyHeader || "x-api-key").trim() || "x-api-key";
  const signingEnabled = Boolean(syncConfig.signingEnabled);
  const signingSecret = syncConfig.signingSecret?.trim() || "";
  const signatureHeader = (syncConfig.signatureHeader || "x-signature").trim() || "x-signature";
  const timestampHeader = (syncConfig.timestampHeader || "x-signature-timestamp").trim() || "x-signature-timestamp";
  const nonceHeader = (syncConfig.nonceHeader || "x-signature-nonce").trim() || "x-signature-nonce";
  return {
    endpoint,
    authMode,
    authToken,
    apiKeyHeader,
    signingEnabled,
    signingSecret,
    signatureHeader,
    timestampHeader,
    nonceHeader,
  };
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

async function getSigningHeaders(config, incident) {
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

function getAuthHeaders(config) {
  if (!config.authToken || config.authMode === "none") {
    return {};
  }

  if (config.authMode === "api-key") {
    return { [config.apiKeyHeader]: config.authToken };
  }

  return { Authorization: `Bearer ${config.authToken}` };
}

function getRoleHeaders() {
  const headers = {
    "x-user-role": currentRole,
  };

  if (currentUser?.email) {
    headers["x-user-account"] = currentUser.email;
  }

  return headers;
}

function validateSyncEndpoint(endpoint) {
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    return { isValid: false, message: "Invalid endpoint URL" };
  }

  const isSecurePage = window.location.protocol === "https:";
  if (isSecurePage && parsed.protocol !== "https:") {
    return { isValid: false, message: "Endpoint must use HTTPS on secure deployments" };
  }

  return { isValid: true };
}

function isSyncConfigured(config) {
  const endpoint = (config.endpoint || "").trim();
  if (!endpoint) {
    return false;
  }

  try {
    new URL(endpoint);
    return true;
  } catch {
    return false;
  }
}

function getServerMonitorEndpoint(config) {
  const raw = String(config?.endpoint || DEFAULT_SYNC_ENDPOINT).trim();
  try {
    const parsed = new URL(raw);
    return parsed.toString();
  } catch {
    return DEFAULT_SYNC_ENDPOINT;
  }
}

function setServerIncidentStatus(state, label) {
  if (!serverIncidentStatusEl) {
    return;
  }

  serverIncidentStatusEl.className = `status-pill ${state}`;
  serverIncidentStatusEl.textContent = label;
}

function renderServerIncidents(items) {
  if (!serverIncidentListEl) {
    return;
  }

  serverIncidentListEl.innerHTML = "";

  if (!items.length) {
    serverIncidentListEl.innerHTML = '<li class="empty-state">No synced incidents found.</li>';
    return;
  }

  items.forEach((incident) => {
    const li = document.createElement("li");
    li.className = "server-incident-card";

    const head = document.createElement("div");
    head.className = "server-incident-head";

    const id = document.createElement("p");
    id.className = "server-incident-id";
    id.textContent = incident.id || "N/A";

    const date = document.createElement("p");
    date.className = "server-incident-date";
    date.textContent = formatDate(incident.receivedAt || incident.createdAt || new Date().toISOString());

    head.appendChild(id);
    head.appendChild(date);

    const body = document.createElement("p");
    body.className = "server-incident-body";
    body.textContent = incident.description || "No description";

    const meta = document.createElement("div");
    meta.className = "server-incident-meta";

    const typeChip = document.createElement("span");
    typeChip.className = "server-incident-chip";
    typeChip.textContent = `Type: ${incident.incidentType || "general"}`;

    const severityChip = document.createElement("span");
    severityChip.className = "server-incident-chip";
    severityChip.textContent = `Severity: ${incident.severity || "unspecified"}`;

    const locationChip = document.createElement("span");
    locationChip.className = "server-incident-chip";
    locationChip.textContent = `Location: ${incident.locationText || "not provided"}`;

    meta.appendChild(typeChip);
    meta.appendChild(severityChip);
    meta.appendChild(locationChip);

    if (incident.reporterEmail) {
      const reporterChip = document.createElement("span");
      reporterChip.className = "server-incident-chip";
      reporterChip.textContent = `Reporter: ${incident.reporterEmail}`;
      meta.appendChild(reporterChip);
    }

    li.appendChild(head);
    li.appendChild(body);
    li.appendChild(meta);
    serverIncidentListEl.appendChild(li);
  });
}

function applyServerIncidentFilters() {
  const query = serverIncidentSearchEl?.value?.trim().toLowerCase() || "";
  const severity = serverIncidentSeverityFilterEl?.value || "all";

  const filtered = remoteIncidentsCache.filter((incident) => {
    const severityValue = String(incident.severity || "").toLowerCase();
    const severityMatch = severity === "all" || severityValue === severity;
    if (!severityMatch) {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystack = `${incident.id || ""} ${incident.description || ""} ${incident.locationText || ""} ${incident.reporterEmail || ""}`.toLowerCase();
    return haystack.includes(query);
  });

  renderServerIncidents(filtered);
}

async function refreshServerIncidents() {
  if (!serverIncidentListEl) {
    return;
  }

  const canView = ["admin", "secretary", "captain"].includes(currentRole);
  if (!canView) {
    remoteIncidentsCache = [];
    renderServerIncidents([]);
    return;
  }

  if (!navigator.onLine) {
    setServerIncidentStatus("status-offline", "Offline");
    return;
  }

  const config = getEffectiveSyncConfig();
  const endpoint = getServerMonitorEndpoint(config);
  setServerIncidentStatus("status-syncing", "Loading");

  try {
    const response = await fetch(endpoint, {
      headers: {
        ...getRoleHeaders(),
        ...getAuthHeaders(config),
      },
    });

    if (!response.ok) {
      throw new Error(`Monitor request failed (${response.status})`);
    }

    const payload = await response.json();
    remoteIncidentsCache = Array.isArray(payload.incidents) ? payload.incidents : [];
    applyServerIncidentFilters();
    setServerIncidentStatus("status-idle", `${remoteIncidentsCache.length} server reports`);
  } catch {
    setServerIncidentStatus("status-error", "Server unavailable");
  }
}

async function syncConfigToServiceWorker(config) {
  if (!swRegistration) {
    return;
  }

  const message = {
    type: "UPDATE_SYNC_CONFIG",
    payload: {
      endpoint: config.endpoint,
      authMode: config.authMode,
      authToken: config.authToken,
      apiKeyHeader: config.apiKeyHeader,
      signingEnabled: config.signingEnabled,
      signingSecret: config.signingSecret,
      signatureHeader: config.signatureHeader,
      timestampHeader: config.timestampHeader,
      nonceHeader: config.nonceHeader,
    },
  };

  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage(message);
  }

  if (swRegistration.active) {
    swRegistration.active.postMessage(message);
  }
}

async function initializeSyncConfig() {
  const storedConfig = await getSyncConfig();
  syncConfig = {
    endpoint: storedConfig?.endpoint || DEFAULT_SYNC_ENDPOINT,
    authMode: storedConfig?.authMode || "none",
    authToken: storedConfig?.authToken || "",
    apiKeyHeader: storedConfig?.apiKeyHeader || "x-api-key",
    signingEnabled: storedConfig?.signingEnabled || false,
    signingSecret: storedConfig?.signingSecret || "",
    signatureHeader: storedConfig?.signatureHeader || "x-signature",
    timestampHeader: storedConfig?.timestampHeader || "x-signature-timestamp",
    nonceHeader: storedConfig?.nonceHeader || "x-signature-nonce",
  };
  await syncConfigToServiceWorker(syncConfig);
}

function extractRemoteId(result) {
  if (!result || typeof result !== "object") {
    return null;
  }

  return result.id ?? result.incidentId ?? result.data?.id ?? null;
}

function getContactCategory(contact) {
  if (contact.category) {
    return contact.category;
  }

  const roleText = `${contact.role || ""} ${contact.name || ""}`.toLowerCase();
  if (roleText.includes("medical") || roleText.includes("health")) {
    return "medical";
  }
  if (roleText.includes("police")) {
    return "police";
  }
  if (roleText.includes("fire")) {
    return "fire";
  }
  if (roleText.includes("captain") || roleText.includes("kagawad") || roleText.includes("barangay")) {
    return "official";
  }
  if (roleText.includes("disaster") || roleText.includes("mdrrmo")) {
    return "disaster";
  }
  return "other";
}

function filterContacts() {
  const term = directorySearchEl.value.trim().toLowerCase();
  const category = directoryFilterEl.value;

  const filtered = allContactsCache.filter((contact) => {
    const contactCategory = getContactCategory(contact);
    const categoryMatch = category === "all" || category === contactCategory;
    if (!categoryMatch) {
      return false;
    }

    if (!term) {
      return true;
    }

    const haystack = `${contact.name} ${contact.role} ${contact.phone}`.toLowerCase();
    return haystack.includes(term);
  });

  renderDirectory(filtered);
}

function setActiveQuickAccessCard(sectionId) {
  quickAccessCards.forEach((card) => {
    const targetId = card.getAttribute("href").replace("#", "");
    card.classList.toggle("action-card-active", targetId === sectionId);
  });
}

function setupQuickAccessScrollSpy() {
  if (!quickAccessCards.length) {
    return;
  }

  quickAccessCards.forEach((card) => {
    card.addEventListener("click", () => {
      const sectionId = card.getAttribute("href").replace("#", "");
      setActiveQuickAccessCard(sectionId);
    });
  });

  const sections = quickAccessCards
    .map((card) => {
      const target = card.getAttribute("href");
      return document.querySelector(target);
    })
    .filter(Boolean);

  if (!sections.length || !("IntersectionObserver" in window)) {
    return;
  }

  const sectionScores = new Map();
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const id = entry.target.id;
        sectionScores.set(id, entry.isIntersecting ? entry.intersectionRatio : 0);
      });

      let bestId = sections[0].id;
      let bestScore = -1;

      sectionScores.forEach((score, id) => {
        if (score > bestScore) {
          bestScore = score;
          bestId = id;
        }
      });

      setActiveQuickAccessCard(bestId);
    },
    {
      root: null,
      rootMargin: "-32% 0px -48% 0px",
      threshold: [0.05, 0.2, 0.4, 0.65],
    }
  );

  sections.forEach((section) => {
    sectionScores.set(section.id, 0);
    observer.observe(section);
  });

  setActiveQuickAccessCard("about");
}

function renderIncidents(incidents) {
  incidentListEl.innerHTML = "";

  if (!incidents.length) {
    incidentListEl.innerHTML = '<li class="empty-state">No reports saved yet.</li>';
    return;
  }

  incidents.forEach((incident) => {
    const fragment = incidentItemTemplate.content.cloneNode(true);
    const dateEl = fragment.querySelector(".incident-date");
    const stateEl = fragment.querySelector(".incident-state");
    const metaEl = fragment.querySelector(".incident-meta");
    const locationEl = fragment.querySelector(".incident-location");
    const textEl = fragment.querySelector(".incident-text");
    const queuedStep = fragment.querySelector(".step-queued");
    const processingStep = fragment.querySelector(".step-processing");
    const syncedStep = fragment.querySelector(".step-synced");
    const imageEl = fragment.querySelector(".incident-image");

    dateEl.textContent = formatDate(incident.createdAt);
    stateEl.textContent = incident.status === "synced" ? "Synced" : "Pending";
    stateEl.className = `incident-state ${incident.status === "synced" ? "is-synced" : "is-pending"}`;
    metaEl.textContent = `${incident.incidentType || "General"} • ${incident.severity || "Unspecified"}`;
    locationEl.textContent = incident.locationText ? `Location: ${incident.locationText}` : "Location: Not provided";
    textEl.textContent = incident.description;

    const timelineLabels = getTimelineLabels();
    queuedStep.textContent = timelineLabels.queued;
    processingStep.textContent = timelineLabels.processing;
    syncedStep.textContent = timelineLabels.synced;

    queuedStep.classList.add("active");
    if (incident.status === "synced") {
      processingStep.classList.add("active");
      syncedStep.classList.add("active");
    } else if (incident.lastError) {
      processingStep.classList.add("active");
      processingStep.textContent = timelineLabels.retry;
    }

    if (incident.lastError) {
      const errorNote = document.createElement("p");
      errorNote.className = "sync-error-note";
      errorNote.textContent = `Last sync issue: ${incident.lastError}`;
      textEl.after(errorNote);

      const retryMeta = document.createElement("p");
      retryMeta.className = "sync-retry-meta";
      const attempts = incident.syncAttempts ?? 0;
      const nextRetry = incident.nextRetryAt ? formatDate(incident.nextRetryAt) : "next reconnect";
      retryMeta.textContent = `Attempts: ${attempts} | Retry: ${nextRetry}`;
      errorNote.after(retryMeta);
    }

    if (incident.imageBlob) {
      const imageUrl = URL.createObjectURL(incident.imageBlob);
      imageEl.src = imageUrl;
      imageEl.classList.remove("hidden");
      imageEl.addEventListener("load", () => URL.revokeObjectURL(imageUrl), { once: true });
    }

    incidentListEl.appendChild(fragment);
  });
}

function renderDirectory(contacts) {
  directoryListEl.innerHTML = "";

  if (!contacts.length) {
    directoryListEl.innerHTML = '<li class="empty-state">No contacts found.</li>';
    return;
  }

  contacts.forEach((contact) => {
    const fragment = directoryItemTemplate.content.cloneNode(true);
    const nameEl = fragment.querySelector(".contact-name");
    const roleEl = fragment.querySelector(".contact-role");
    const numberEl = fragment.querySelector(".contact-number");

    nameEl.textContent = contact.name;
    roleEl.textContent = contact.role;
    numberEl.textContent = contact.phone;
    numberEl.href = `tel:${contact.phone}`;

    directoryListEl.appendChild(fragment);
  });
}

async function refreshIncidents() {
  const incidents = await getAllIncidents();
  renderIncidents(incidents);
}

async function loadAndCacheContacts() {
  try {
    const response = await fetch("./assets/contacts.json");
    if (response.ok) {
      const contacts = await response.json();
      await bulkSaveContacts(contacts);
    }
  } catch {
    // Fallback to existing IndexedDB contacts when offline.
  }

  allContactsCache = await getAllContacts();
  filterContacts();
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return null;
  }

  if (swRegistration) {
    return swRegistration;
  }

  if (swRegistrationPromise) {
    return swRegistrationPromise;
  }

  swRegistrationPromise = navigator.serviceWorker
    .register("./sw.js")
    .then((registration) => {
      swRegistration = registration;
      return registration;
    })
    .catch(() => null)
    .finally(() => {
      swRegistrationPromise = null;
    });

  return swRegistrationPromise;
}

async function registerBackgroundSync() {
  if (!swRegistration || !("SyncManager" in window)) {
    return;
  }

  try {
    await swRegistration.sync.register(BG_SYNC_TAG);
  } catch {
    // Ignore registration errors; manual sync remains available.
  }
}

async function trySyncPendingIncidents() {
  if (!navigator.onLine) {
    setSyncStatus("status-idle", t("syncWaiting"));
    return { synced: 0, failed: false, reason: "offline" };
  }

  const config = getEffectiveSyncConfig();
  if (!isSyncConfigured(config)) {
    setSyncStatus("status-idle", t("syncWaitingService"));
    return { synced: 0, failed: false, reason: "not-configured" };
  }

  const endpointValidation = validateSyncEndpoint(config.endpoint);
  if (!endpointValidation.isValid) {
    setSyncStatus("status-idle", t("syncWaitingService"));
    return { synced: 0, failed: false, reason: "not-configured" };
  }

  if (config.authMode !== "none" && !config.authToken) {
    setSyncStatus("status-idle", t("syncWaitingService"));
    return { synced: 0, failed: false, reason: "not-configured" };
  }

  if (config.signingEnabled && !config.signingSecret) {
    setSyncStatus("status-idle", t("syncWaitingService"));
    return { synced: 0, failed: false, reason: "not-configured" };
  }

  const pending = await getPendingIncidents();
  if (!pending.length) {
    setSyncStatus("status-idle", t("syncSavedLocal"));
    return { synced: 0, failed: false, reason: "none-pending" };
  }

  const now = Date.now();
  const readyToSync = pending.filter((incident) => {
    if (!incident.nextRetryAt) {
      return true;
    }
    return new Date(incident.nextRetryAt).getTime() <= now;
  });

  if (!readyToSync.length) {
    setSyncStatus("status-idle", t("syncDelayed"));
    return { synced: 0, failed: false, reason: "retry-window" };
  }

  setSyncStatus("status-syncing", `${t("syncInProgress")} (${readyToSync.length})...`);

  let syncedCount = 0;

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

      const signingHeaders = await getSigningHeaders(config, incident);

      const response = await fetch(config.endpoint, {
        method: "POST",
        body: payload,
        headers: {
          ...getRoleHeaders(),
          ...getAuthHeaders(config),
          ...signingHeaders,
        },
      });

      if (!response.ok) {
        throw new Error(`Sync failed (${response.status})`);
      }

      let remoteId = null;
      try {
        const result = await response.json();
        remoteId = extractRemoteId(result);
      } catch {
        remoteId = null;
      }

      await markIncidentSynced(incident.localId, remoteId);
      syncedCount += 1;
    } catch (error) {
      await markIncidentSyncError(incident.localId, error.message || "Server unreachable");
      setSyncStatus("status-error", t("syncDelayed"));
      await refreshIncidents();
      return { synced: syncedCount, failed: true, reason: "sync-error" };
    }
  }

  setSyncStatus("status-idle", t("syncComplete"));
  await refreshIncidents();
  await refreshServerIncidents();
  return { synced: syncedCount, failed: false, reason: "completed" };
}

captureLocationBtn.addEventListener("click", () => {
  if (!("geolocation" in navigator)) {
    locationStatusEl.className = "status-pill status-error";
    locationStatusEl.textContent = t("locationUnavailable");
    return;
  }

  locationStatusEl.className = "status-pill status-syncing";
  locationStatusEl.textContent = t("locationPending");

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = Number(position.coords.latitude.toFixed(6));
      const lng = Number(position.coords.longitude.toFixed(6));
      const label = `${lat}, ${lng}`;
      locationMeta = {
        lat,
        lng,
        source: "gps",
      };
      incidentLocationEl.value = label;
      locationStatusEl.className = "status-pill status-online";
      locationStatusEl.textContent = `${t("locationReady")}: ${label}`;
    },
    () => {
      locationStatusEl.className = "status-pill status-error";
      locationStatusEl.textContent = t("locationDenied");
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    }
  );
});

clearLocationBtn.addEventListener("click", () => {
  incidentLocationEl.value = "";
  locationMeta = null;
  locationStatusEl.className = "status-pill status-idle";
  locationStatusEl.textContent = t("locationCleared");
});

incidentImageEl.addEventListener("change", () => {
  const file = incidentImageEl.files?.[0];
  if (!file) {
    imagePreviewEl.classList.add("hidden");
    imagePreviewEl.src = "";
    return;
  }

  const previewUrl = URL.createObjectURL(file);
  imagePreviewEl.src = previewUrl;
  imagePreviewEl.classList.remove("hidden");
  imagePreviewEl.addEventListener("load", () => URL.revokeObjectURL(previewUrl), { once: true });
});

incidentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const description = incidentTextEl.value.trim();
  const incidentType = incidentTypeEl.value;
  const severity = incidentSeverityEl.value;
  const locationText = incidentLocationEl.value.trim();

  if (!description || !incidentType || !severity) {
    incidentTextEl.focus();
    return;
  }

  const imageBlob = incidentImageEl.files?.[0] ?? null;
  const incident = {
    localId: crypto.randomUUID(),
    description,
    incidentType,
    severity,
    locationText,
    location: locationMeta,
    imageBlob,
    createdAt: new Date().toISOString(),
    status: "pending",
  };

  await saveIncident(incident);
  notifyAllActorsProcessUpdate({
    incidentType,
    severity,
  });

  incidentForm.reset();
  locationMeta = null;
  locationStatusEl.className = "status-pill status-idle";
  locationStatusEl.textContent = getDefaultLocationStatusText();
  imagePreviewEl.classList.add("hidden");
  imagePreviewEl.src = "";

  await refreshIncidents();
  await registerBackgroundSync();
  const syncResult = await trySyncPendingIncidents();
  announceSyncOutcome(syncResult, "submit");
});

manualSyncBtn.addEventListener("click", async () => {
  await registerBackgroundSync();
  const syncResult = await trySyncPendingIncidents();
  announceSyncOutcome(syncResult, "manual");
});

async function bootDashboard() {
  if (dashboardInitialized) {
    return;
  }

  await registerServiceWorker();
  await initializeSyncConfig();
  setupQuickAccessScrollSpy();
  await loadAndCacheContacts();
  await refreshIncidents();
  await refreshServerIncidents();

  if (navigator.onLine) {
    await registerBackgroundSync();
    await trySyncPendingIncidents();
  }

  dashboardInitialized = true;
}

async function signInUser(user) {
  saveSession(user);
  setAuthenticatedState(user);
  closeAuthModal();
  await bootDashboard();
}

function bindAuthEvents() {
  [welcomeSignInBtnEl, heroSignInBtnEl].forEach((btn) => {
    btn?.addEventListener("click", () => {
      setHeaderMenuOpen(false);
      openAuthModal("signin");
    });
  });

  [welcomeSignUpBtnEl, heroSignUpBtnEl].forEach((btn) => {
    btn?.addEventListener("click", () => {
      setHeaderMenuOpen(false);
      openAuthModal("signup");
    });
  });

  headerSignOutBtnEl?.addEventListener("click", () => {
    setHeaderMenuOpen(false);
    clearSession();
    setAuthenticatedState(null);
  });

  authSwitchBtnEl?.addEventListener("click", () => {
    const nextMode = authMode === "signin" ? "signup" : "signin";
    setAuthMode(nextMode);
  });

  authModalCloseBtnEl?.addEventListener("click", () => {
    closeAuthModal();
  });

  authModalEl?.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.dataset.authClose === "true") {
      closeAuthModal();
    }
  });

  authFormEl?.addEventListener("submit", async (event) => {
    event.preventDefault();
    resetAuthError();

    const email = authEmailEl.value;
    const password = authPasswordEl.value;
    const role = authRoleEl.value;

    if (authMode === "signup") {
      const fullName = authFullNameEl.value;
      const confirmPassword = authConfirmPasswordEl.value;

      if (password !== confirmPassword) {
        showAuthError("Password confirmation does not match.");
        return;
      }

      const result = registerAccount({ fullName, email, password, role });
      if (!result.ok) {
        showAuthError(result.message);
        return;
      }

      await signInUser(result.user);
      return;
    }

    const result = authenticateAccount({ email, password, role });
    if (!result.ok) {
      showAuthError(result.message);
      return;
    }

    await signInUser(result.user);
  });
}

directorySearchEl.addEventListener("input", filterContacts);
directoryFilterEl.addEventListener("change", filterContacts);
serverIncidentSearchEl?.addEventListener("input", applyServerIncidentFilters);
serverIncidentSeverityFilterEl?.addEventListener("change", applyServerIncidentFilters);
refreshServerIncidentsBtnEl?.addEventListener("click", async () => {
  await refreshServerIncidents();
});

languageSelectEl.addEventListener("change", (event) => {
  applyLanguage(event.target.value);
  filterContacts();
  setHeaderMenuOpen(false);
});

window.addEventListener("online", async () => {
  setNetworkStatus(true);

  if (!dashboardInitialized || !currentUser) {
    return;
  }

  await registerBackgroundSync();
  await trySyncPendingIncidents();
  await refreshServerIncidents();
});

window.addEventListener("offline", () => {
  setNetworkStatus(false);
  setServerIncidentStatus("status-offline", "Offline");
});

(async function init() {
  ensureSeedUsers();
  initializeNotificationSystem();
  bindHeaderMenuEvents();
  bindAuthEvents();
  await registerServiceWorker();
  setNetworkStatus(navigator.onLine);
  setSyncStatus("status-idle", t("syncSavedLocal"));
  applyLanguage("en");

  const session = getStoredSession();
  if (session) {
    setAuthenticatedState(session);
    await bootDashboard();
  } else {
    setAuthenticatedState(null);
    openAuthModal("signin");
  }
})();
