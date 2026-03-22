// ============================================================================
// crypto.ts — Web Crypto API basierte Schlüsselverwaltung
//
// Private Keys werden mit extractable: false generiert, sodass sie NIEMALS
// als Rohbytes aus dem Browser exportiert werden können (auch nicht per JS).
// Der CryptoKey-Handle wird in IndexedDB gespeichert.
// ============================================================================

const DB_NAME = "secure-call-keys";
const DB_VERSION = 1;
const STORE_NAME = "keyPairs";
const DEVICE_ID_KEY = "secure-call-device-id";

// ECDSA P-256 Algorithmus-Parameter
const ECDSA_PARAMS: EcKeyGenParams = {
  name: "ECDSA",
  namedCurve: "P-256",
};

const SIGN_PARAMS: EcdsaParams = {
  name: "ECDSA",
  hash: "SHA-256",
};

// ============================================================================
// Geräte-ID Verwaltung
// ============================================================================

/**
 * Gibt die Geräte-ID zurück oder erstellt eine neue.
 * Wird in localStorage gespeichert und bleibt pro Browser/Gerät bestehen.
 */
export function getOrCreateDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

/**
 * Gibt einen lesbaren Gerätenamen zurück (Browser + OS).
 */
export function getDeviceName(): string {
  const ua = navigator.userAgent;
  let browser = "Unknown";
  let os = "Unknown";

  if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Edg")) browser = "Edge";
  else if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Safari")) browser = "Safari";

  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

  return `${browser} auf ${os}`;
}

// ============================================================================
// IndexedDB Helpers
// ============================================================================

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ============================================================================
// Schlüsselgenerierung & Speicherung
// ============================================================================

interface StoredKeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

/**
 * Generiert ein neues ECDSA P-256 Schlüsselpaar.
 *
 * WICHTIG: Der Private Key wird mit extractable: false erstellt!
 * Das bedeutet, er kann NIEMALS aus dem Browser exportiert werden —
 * weder durch unser eigenes JS noch durch XSS-Angriffe.
 * Nur der Public Key ist exportierbar (um ihn an Convex zu senden).
 */
export async function generateKeyPair(): Promise<CryptoKeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    ECDSA_PARAMS,
    false, // extractable: false — Private Key ist nicht exportierbar!
    ["sign", "verify"],
  );
  return keyPair;
}

/**
 * Speichert das Schlüsselpaar in IndexedDB.
 * Der Key ist userId + deviceId, damit jeder User auf jedem Gerät sein eigenes Paar hat.
 * So kann User B auf dem gleichen Gerät nicht den Key von User A verwenden.
 */
export async function storeKeyPair(
  userId: string,
  deviceId: string,
  keyPair: CryptoKeyPair,
): Promise<void> {
  await idbPut(`keypair-${userId}-${deviceId}`, {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  });
}

/**
 * Lädt das Schlüsselpaar für einen bestimmten User + Gerät aus IndexedDB.
 * Gibt null zurück wenn noch keins existiert.
 */
export async function loadKeyPair(
  userId: string,
  deviceId: string,
): Promise<StoredKeyPair | null> {
  const stored = await idbGet<StoredKeyPair>(`keypair-${userId}-${deviceId}`);
  return stored ?? null;
}

// ============================================================================
// Public Key Export (für Convex-Speicherung)
// ============================================================================

/**
 * Exportiert den Public Key als JWK-String.
 * Nur der Public Key ist exportierbar — den brauchen wir für die
 * Verifikation auf der anderen Seite.
 */
export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
  const jwk = await crypto.subtle.exportKey("jwk", publicKey);
  return JSON.stringify(jwk);
}

/**
 * Importiert einen Public Key aus einem JWK-String.
 * Wird auf der verifizierenden Seite verwendet, um den Public Key
 * des Gegenübers aus Convex zu laden und Signaturen zu prüfen.
 */
export async function importPublicKey(jwkString: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkString);
  return await crypto.subtle.importKey(
    "jwk",
    jwk,
    ECDSA_PARAMS,
    true, // Public Keys dürfen exportierbar sein
    ["verify"],
  );
}

// ============================================================================
// Signieren & Verifizieren
// ============================================================================

/**
 * Signiert Daten mit dem Private Key (ECDSA SHA-256).
 */
export async function signData(
  privateKey: CryptoKey,
  data: ArrayBuffer,
): Promise<ArrayBuffer> {
  return await crypto.subtle.sign(SIGN_PARAMS, privateKey, data);
}

/**
 * Verifiziert eine Signatur mit dem Public Key.
 */
export async function verifySignature(
  publicKey: CryptoKey,
  signature: ArrayBuffer,
  data: ArrayBuffer,
): Promise<boolean> {
  return await crypto.subtle.verify(SIGN_PARAMS, publicKey, signature, data);
}

// ============================================================================
// Hilfsfunktionen für Challenge-Daten
// ============================================================================

/**
 * Generiert eine zufällige Challenge (32 Bytes).
 */
export function generateChallenge(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

/**
 * Konvertiert ArrayBuffer zu Base64-String (für DataChannel-Transport).
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Konvertiert Base64-String zurück zu ArrayBuffer.
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Erstellt die zu signierende Challenge-Payload.
 * Enthält die Challenge-Nonce + userId + deviceId + Timestamp,
 * damit Replay-Angriffe verhindert werden.
 */
export function buildChallengePayload(
  challenge: Uint8Array,
  userId: string,
  deviceId: string,
  timestamp: number,
): ArrayBuffer {
  const encoder = new TextEncoder();
  const meta = encoder.encode(`${userId}:${deviceId}:${timestamp}`);

  // Challenge + Metadaten zusammenführen
  const combined = new Uint8Array(challenge.byteLength + meta.byteLength);
  combined.set(challenge, 0);
  combined.set(meta, challenge.byteLength);

  return combined.buffer;
}

// ============================================================================
// ECDH Key Exchange (fuer Audio-Signierung)
// ============================================================================

const ECDH_PARAMS: EcKeyGenParams = {
  name: "ECDH",
  namedCurve: "P-256",
};

/**
 * Generiert ein temporaeres ECDH-Keypair fuer den Key-Exchange.
 * Wird bei jedem Handshake/Heartbeat neu generiert.
 */
export async function generateECDHKeyPair(): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey(
    ECDH_PARAMS,
    false, // Private Key nicht exportierbar
    ["deriveKey"],
  );
}

/**
 * Exportiert den ECDH Public Key als JWK-String (fuer DataChannel-Transport).
 */
export async function exportECDHPublicKey(
  publicKey: CryptoKey,
): Promise<string> {
  const jwk = await crypto.subtle.exportKey("jwk", publicKey);
  return JSON.stringify(jwk);
}

/**
 * Importiert einen ECDH Public Key aus JWK-String.
 */
export async function importECDHPublicKey(
  jwkString: string,
): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkString);
  return await crypto.subtle.importKey(
    "jwk",
    jwk,
    ECDH_PARAMS,
    false,
    [], // Public Key fuer deriveKey braucht keine usages
  );
}

/**
 * Leitet aus ECDH Private Key + Peer Public Key einen HMAC-Key ab.
 * Beide Seiten berechnen den gleichen Key, ohne ihn zu uebertragen.
 */
export async function deriveHMACKey(
  myPrivateKey: CryptoKey,
  peerPublicKey: CryptoKey,
): Promise<CryptoKey> {
  return await crypto.subtle.deriveKey(
    {
      name: "ECDH",
      public: peerPublicKey,
    },
    myPrivateKey,
    {
      name: "HMAC",
      hash: "SHA-256",
      length: 256,
    },
    false, // Nicht exportierbar
    ["sign", "verify"],
  );
}

/**
 * Berechnet HMAC-SHA256 ueber Daten.
 */
export async function computeHMAC(
  hmacKey: CryptoKey,
  data: ArrayBuffer,
): Promise<ArrayBuffer> {
  return await crypto.subtle.sign("HMAC", hmacKey, data);
}

/**
 * Verifiziert einen HMAC-SHA256 Tag.
 */
export async function verifyHMAC(
  hmacKey: CryptoKey,
  signature: ArrayBuffer,
  data: ArrayBuffer,
): Promise<boolean> {
  return await crypto.subtle.verify("HMAC", hmacKey, signature, data);
}

// ============================================================================
// Kompletter Setup-Flow
// ============================================================================

/**
 * Initialisiert die Kryptographie für dieses Gerät + User.
 *
 * 1. Holt oder erstellt die Geräte-ID
 * 2. Prüft ob schon ein Schlüsselpaar für diesen User + Gerät in IndexedDB existiert
 * 3. Falls nicht, generiert ein neues Paar
 * 4. Gibt den exportierten Public Key zurück (für Convex-Registrierung)
 *
 * WICHTIG: userId wird benötigt, damit User B nicht den Key von User A benutzen kann!
 */
export async function initializeDeviceCrypto(userId: string): Promise<{
  deviceId: string;
  deviceName: string;
  publicKeyJwk: string;
  isNew: boolean;
}> {
  const deviceId = getOrCreateDeviceId();
  const deviceName = getDeviceName();

  // Prüfen ob schon ein Schlüsselpaar für diesen User existiert
  let keyPair = await loadKeyPair(userId, deviceId);
  let isNew = false;

  if (!keyPair) {
    // Neues Schlüsselpaar generieren
    const newKeyPair = await generateKeyPair();
    await storeKeyPair(userId, deviceId, newKeyPair);
    keyPair = {
      publicKey: newKeyPair.publicKey,
      privateKey: newKeyPair.privateKey,
    };
    isNew = true;
  }

  const publicKeyJwk = await exportPublicKey(keyPair.publicKey);

  return { deviceId, deviceName, publicKeyJwk, isNew };
}

/**
 * Prüft ob für diesen User + Gerät bereits ein Schlüsselpaar in IndexedDB existiert.
 * Wird beim Login verwendet um zu entscheiden ob BundID nötig ist.
 */
export async function hasKeyPairForDevice(userId: string): Promise<{
  exists: boolean;
  deviceId: string;
}> {
  const deviceId = getOrCreateDeviceId();
  const keyPair = await loadKeyPair(userId, deviceId);
  return { exists: keyPair !== null, deviceId };
}
