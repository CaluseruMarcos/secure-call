// lib/crypto.ts

/**
 * Hilfsfunktionen für Base64-Konvertierung
 */
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
};

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
};

/**
 * 1. Passwort-Ableitung (PBKDF2)
 */
async function deriveMasterKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await window.crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 600000,
      hash: "SHA-256",
    } as any, 
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * 2. Erstellt den SecureCall-Tresor (Setup bei Registrierung)
 */
export async function createVault(password: string) {
  // A. RSA-Schlüsselpaar generieren
  const rsaKeys = (await window.crypto.subtle.generateKey(
    {
      name: "RSA-PSS",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"]
  )) as CryptoKeyPair;

  // B. Master-Key ableiten
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const masterKey = await deriveMasterKey(password, salt);

  // C. Private Key exportieren und verschlüsseln
  const privateKeyRaw = await window.crypto.subtle.exportKey("jwk", rsaKeys.privateKey);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  const encryptedPrivKey = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv } as any,
    masterKey,
    new TextEncoder().encode(JSON.stringify(privateKeyRaw))
  );

  // D. Public Key exportieren
  const pubKeyRaw = await window.crypto.subtle.exportKey("spki", rsaKeys.publicKey);

  return {
    publicKey: arrayBufferToBase64(pubKeyRaw),
    encryptedPrivateKey: arrayBufferToBase64(encryptedPrivKey),
    vaultSalt: arrayBufferToBase64(salt.buffer as ArrayBuffer),
    vaultIv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
    localPrivateKey: rsaKeys.privateKey
  };
}

/**
 * 3. Öffnet den Tresor (Login auf neuem Gerät)
 */
export async function unlockVault(password: string, vaultData: {
  encryptedPrivateKey: string,
  vaultSalt: string,
  vaultIv: string
}): Promise<CryptoKey> {
  const saltBuffer = base64ToArrayBuffer(vaultData.vaultSalt);
  const ivBuffer = base64ToArrayBuffer(vaultData.vaultIv);
  const encryptedData = base64ToArrayBuffer(vaultData.encryptedPrivateKey);

  const salt = new Uint8Array(saltBuffer);
  const iv = new Uint8Array(ivBuffer);

  // A. Master-Key wiederherstellen
  const masterKey = await deriveMasterKey(password, salt);

  // B. Entschlüsseln
  const decryptedRaw = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv } as any,
    masterKey,
    encryptedData
  );

  const jwk = JSON.parse(new TextDecoder().decode(decryptedRaw));

  // C. Zurück in ein CryptoKey-Objekt verwandeln
  return window.crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSA-PSS", hash: "SHA-256" } as any,
    false,
    ["sign"]
  );
}

/**
 * 4. Signieren (Alice beweist ihre Identität)
 * Nimmt die Zufallszahl (Nonce) von Bob und unterschreibt sie mit dem Private Key.
 */
export async function signChallenge(privateKey: CryptoKey, nonce: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(nonce);

  const signature = await window.crypto.subtle.sign(
    {
      name: "RSA-PSS",
      saltLength: 32, // Muss mit der Verifizierung übereinstimmen
    },
    privateKey,
    data
  );

  return arrayBufferToBase64(signature);
}

/**
 * 5. Verifizieren (Bob prüft Alices Beweis)
 * Nutzt den Public Key von Alice, um zu prüfen, ob die Signatur zur Nonce passt.
 */
export async function verifyChallenge(
  publicKeyBase64: string, 
  signatureBase64: string, 
  nonce: string
): Promise<boolean> {
  // A. Daten vorbereiten
  const pubKeyBuffer = base64ToArrayBuffer(publicKeyBase64);
  const sigBuffer = base64ToArrayBuffer(signatureBase64);
  const encoder = new TextEncoder();
  const nonceData = encoder.encode(nonce);

  // B. Den Public Key für die Web Crypto API importieren
  const publicKey = await window.crypto.subtle.importKey(
    "spki",
    pubKeyBuffer,
    {
      name: "RSA-PSS",
      hash: "SHA-256",
    },
    false,
    ["verify"]
  );

  // C. Die mathematische Prüfung
  return await window.crypto.subtle.verify(
    {
      name: "RSA-PSS",
      saltLength: 32,
    },
    publicKey,
    sigBuffer,
    nonceData
  );
}