// ============================================================================
// handshake.ts — Challenge-Response Handshake über WebRTC DataChannel
//
// Ablauf:
// 1. Alice sendet: { type: "challenge", challenge, userId, deviceId, timestamp }
// 2. Bob empfängt, verifiziert Alices Public Key via Convex,
//    signiert Alices Challenge und sendet zurück:
//    { type: "challenge-response", challengeResponse (signiert),
//      challenge (Bobs eigene), userId, deviceId, timestamp }
// 3. Alice verifiziert Bobs Signatur, signiert Bobs Challenge, sendet:
//    { type: "response", challengeResponse (signiert) }
// 4. Bob verifiziert → beide Seiten sind verifiziert ✓
// ============================================================================

import {
  generateChallenge,
  signData,
  verifySignature,
  importPublicKey,
  loadKeyPair,
  buildChallengePayload,
  arrayBufferToBase64,
  base64ToArrayBuffer,
} from "./crypto";

// ============================================================================
// Types
// ============================================================================

export type HandshakeStatus =
  | "idle"
  | "waiting" // Challenge gesendet, warte auf Antwort
  | "responding" // Challenge empfangen, antworte
  | "verifying" // Antwort empfangen, verifiziere
  | "verified" // Beide Seiten verifiziert ✓
  | "failed"; // Verifikation fehlgeschlagen ✗

export interface HandshakeResult {
  status: HandshakeStatus;
  peerUserId?: string;
  peerDeviceId?: string;
  peerName?: string;
  error?: string;
}

// Nachrichten-Typen für den DataChannel
interface ChallengeMessage {
  type: "challenge";
  challenge: string; // Base64-encoded Challenge-Nonce
  userId: string;
  deviceId: string;
  timestamp: number;
}

interface ChallengeResponseMessage {
  type: "challenge-response";
  challengeResponse: string; // Base64-encoded Signatur der empfangenen Challenge
  challenge: string; // Eigene Challenge (Base64)
  userId: string;
  deviceId: string;
  timestamp: number;
}

interface ResponseMessage {
  type: "response";
  challengeResponse: string; // Base64-encoded Signatur
}

interface HandshakeErrorMessage {
  type: "handshake-error";
  error: string;
}

type HandshakeMessage =
  | ChallengeMessage
  | ChallengeResponseMessage
  | ResponseMessage
  | HandshakeErrorMessage;

// Callback um Public Key vom Convex zu holen
export type FetchPublicKeyFn = (
  userId: string,
  deviceId: string,
) => Promise<string | null>; // Gibt JWK-String zurück oder null

// Callback um Nutzername zu holen
export type FetchUserNameFn = (userId: string) => Promise<string | null>;

// ============================================================================
// Handshake Manager
// ============================================================================

export class HandshakeManager {
  private dataChannel: RTCDataChannel;
  private myUserId: string;
  private myDeviceId: string;
  private fetchPublicKey: FetchPublicKeyFn;
  private fetchUserName: FetchUserNameFn;
  private onStatusChange: (result: HandshakeResult) => void;

  // Interner State
  private myChallenge: Uint8Array | null = null;
  private myChallengeTimestamp: number = 0;
  private status: HandshakeStatus = "idle";
  private peerUserId: string | null = null;
  private peerDeviceId: string | null = null;

  // Timeout für abgelaufene Challenges (30 Sekunden)
  private static CHALLENGE_TIMEOUT_MS = 30_000;

  constructor(params: {
    dataChannel: RTCDataChannel;
    myUserId: string;
    myDeviceId: string;
    fetchPublicKey: FetchPublicKeyFn;
    fetchUserName: FetchUserNameFn;
    onStatusChange: (result: HandshakeResult) => void;
  }) {
    this.dataChannel = params.dataChannel;
    this.myUserId = params.myUserId;
    this.myDeviceId = params.myDeviceId;
    this.fetchPublicKey = params.fetchPublicKey;
    this.fetchUserName = params.fetchUserName;
    this.onStatusChange = params.onStatusChange;

    // DataChannel-Nachrichten verarbeiten
    this.dataChannel.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  // ============================================================================
  // Phase 1: Challenge senden (Initiator / Alice)
  // ============================================================================

  async startHandshake(): Promise<void> {
    try {
      this.myChallenge = generateChallenge();
      this.myChallengeTimestamp = Date.now();
      this.updateStatus("waiting");

      const message: ChallengeMessage = {
        type: "challenge",
        challenge: arrayBufferToBase64(this.myChallenge.buffer as ArrayBuffer),
        userId: this.myUserId,
        deviceId: this.myDeviceId,
        timestamp: this.myChallengeTimestamp,
      };

      this.sendMessage(message);
      console.log("[Handshake] Challenge gesendet");
    } catch (err) {
      this.fail(`Fehler beim Senden der Challenge: ${err}`);
    }
  }

  // ============================================================================
  // Nachrichten-Handler
  // ============================================================================

  private async handleMessage(rawData: string): Promise<void> {
    try {
      const message: HandshakeMessage = JSON.parse(rawData);

      switch (message.type) {
        case "challenge":
          await this.handleChallenge(message);
          break;
        case "challenge-response":
          await this.handleChallengeResponse(message);
          break;
        case "response":
          await this.handleResponse(message);
          break;
        case "handshake-error":
          this.fail(`Peer-Fehler: ${message.error}`);
          break;
        default:
          // Ignoriere unbekannte Nachrichten (könnten von anderen Features sein)
          break;
      }
    } catch (err) {
      console.error("[Handshake] Fehler beim Verarbeiten der Nachricht:", err);
    }
  }

  // ============================================================================
  // Phase 2: Challenge empfangen & beantworten (Bob)
  // ============================================================================

  private async handleChallenge(msg: ChallengeMessage): Promise<void> {
    try {
      this.updateStatus("responding");
      this.peerUserId = msg.userId;
      this.peerDeviceId = msg.deviceId;

      // Timestamp prüfen (gegen Replay)
      if (Date.now() - msg.timestamp > HandshakeManager.CHALLENGE_TIMEOUT_MS) {
        this.sendError("Challenge abgelaufen");
        this.fail("Empfangene Challenge ist abgelaufen");
        return;
      }

      // Private Key laden
      const keyPair = await loadKeyPair(this.myUserId, this.myDeviceId);
      if (!keyPair) {
        this.fail("Kein Schlüsselpaar für dieses Gerät gefunden");
        return;
      }

      // Challenge-Payload bauen und signieren
      const challengeNonce = new Uint8Array(base64ToArrayBuffer(msg.challenge));
      const payload = buildChallengePayload(
        challengeNonce,
        msg.userId,
        msg.deviceId,
        msg.timestamp,
      );
      const signature = await signData(keyPair.privateKey, payload);

      // Eigene Challenge generieren
      this.myChallenge = generateChallenge();
      this.myChallengeTimestamp = Date.now();

      // Antwort mit eigener Challenge senden
      const response: ChallengeResponseMessage = {
        type: "challenge-response",
        challengeResponse: arrayBufferToBase64(signature),
        challenge: arrayBufferToBase64(this.myChallenge.buffer as ArrayBuffer),
        userId: this.myUserId,
        deviceId: this.myDeviceId,
        timestamp: this.myChallengeTimestamp,
      };

      this.sendMessage(response);
      this.updateStatus("verifying");
      console.log(
        "[Handshake] Challenge beantwortet + eigene Challenge gesendet",
      );
    } catch (err) {
      this.fail(`Fehler beim Beantworten der Challenge: ${err}`);
    }
  }

  // ============================================================================
  // Phase 3: Antwort empfangen & verifizieren (Alice)
  // ============================================================================

  private async handleChallengeResponse(
    msg: ChallengeResponseMessage,
  ): Promise<void> {
    try {
      this.peerUserId = msg.userId;
      this.peerDeviceId = msg.deviceId;
      this.updateStatus("verifying");

      // 1. Bobs Signatur auf meine Challenge verifizieren
      const peerPublicKeyJwk = await this.fetchPublicKey(
        msg.userId,
        msg.deviceId,
      );

      if (!peerPublicKeyJwk) {
        this.fail(
          `Kein Public Key für Gerät ${msg.deviceId} von User ${msg.userId} gefunden`,
        );
        return;
      }

      const peerPublicKey = await importPublicKey(peerPublicKeyJwk);

      // Challenge-Payload rekonstruieren (meine Challenge, meine userId/deviceId)
      const payload = buildChallengePayload(
        this.myChallenge!,
        this.myUserId,
        this.myDeviceId,
        this.myChallengeTimestamp,
      );

      const signatureBuffer = base64ToArrayBuffer(msg.challengeResponse);
      const isValid = await verifySignature(
        peerPublicKey,
        signatureBuffer,
        payload,
      );

      if (!isValid) {
        this.sendError("Signatur-Verifikation fehlgeschlagen");
        this.fail("Peer-Signatur ist ungültig — möglicherweise ein Angreifer!");
        return;
      }

      console.log("[Handshake] Peer-Signatur verifiziert ✓");

      // 2. Bobs Challenge beantworten
      const keyPair = await loadKeyPair(this.myUserId, this.myDeviceId);
      if (!keyPair) {
        this.fail("Kein Schlüsselpaar für dieses Gerät gefunden");
        return;
      }

      // Timestamp prüfen
      if (Date.now() - msg.timestamp > HandshakeManager.CHALLENGE_TIMEOUT_MS) {
        this.sendError("Challenge abgelaufen");
        this.fail("Peer-Challenge ist abgelaufen");
        return;
      }

      const peerChallengeNonce = new Uint8Array(
        base64ToArrayBuffer(msg.challenge),
      );
      const responsePayload = buildChallengePayload(
        peerChallengeNonce,
        msg.userId,
        msg.deviceId,
        msg.timestamp,
      );
      const responseSignature = await signData(
        keyPair.privateKey,
        responsePayload,
      );

      const response: ResponseMessage = {
        type: "response",
        challengeResponse: arrayBufferToBase64(responseSignature),
      };

      this.sendMessage(response);

      // Alice ist jetzt verifiziert (hat Bobs Signatur geprüft)
      // und hat Bobs Challenge beantwortet
      await this.completeHandshake();
    } catch (err) {
      this.fail(`Fehler bei Challenge-Response-Verarbeitung: ${err}`);
    }
  }

  // ============================================================================
  // Phase 4: Finale Antwort empfangen & verifizieren (Bob)
  // ============================================================================

  private async handleResponse(msg: ResponseMessage): Promise<void> {
    try {
      if (!this.peerUserId || !this.peerDeviceId || !this.myChallenge) {
        this.fail("Ungültiger Handshake-State");
        return;
      }

      // Alices Signatur auf meine Challenge verifizieren
      const peerPublicKeyJwk = await this.fetchPublicKey(
        this.peerUserId,
        this.peerDeviceId,
      );

      if (!peerPublicKeyJwk) {
        this.fail("Kein Public Key für Peer gefunden");
        return;
      }

      const peerPublicKey = await importPublicKey(peerPublicKeyJwk);

      const payload = buildChallengePayload(
        this.myChallenge,
        this.myUserId,
        this.myDeviceId,
        this.myChallengeTimestamp,
      );

      const signatureBuffer = base64ToArrayBuffer(msg.challengeResponse);
      const isValid = await verifySignature(
        peerPublicKey,
        signatureBuffer,
        payload,
      );

      if (!isValid) {
        this.sendError("Signatur-Verifikation fehlgeschlagen");
        this.fail("Peer-Signatur ist ungültig — möglicherweise ein Angreifer!");
        return;
      }

      console.log("[Handshake] Finale Verifikation erfolgreich ✓");
      await this.completeHandshake();
    } catch (err) {
      this.fail(`Fehler bei finaler Verifikation: ${err}`);
    }
  }

  // ============================================================================
  // Hilfsfunktionen
  // ============================================================================

  private async completeHandshake(): Promise<void> {
    let peerName: string | null = null;
    if (this.peerUserId) {
      peerName = await this.fetchUserName(this.peerUserId);
    }

    this.status = "verified";
    this.onStatusChange({
      status: "verified",
      peerUserId: this.peerUserId ?? undefined,
      peerDeviceId: this.peerDeviceId ?? undefined,
      peerName: peerName ?? undefined,
    });

    console.log(
      `[Handshake] ✅ Verifiziert! Peer: ${peerName ?? this.peerUserId}`,
    );
  }

  private fail(error: string): void {
    this.status = "failed";
    this.onStatusChange({
      status: "failed",
      error,
      peerUserId: this.peerUserId ?? undefined,
      peerDeviceId: this.peerDeviceId ?? undefined,
    });
    console.error(`[Handshake] ❌ Fehlgeschlagen: ${error}`);
  }

  private sendMessage(message: HandshakeMessage): void {
    if (this.dataChannel.readyState === "open") {
      this.dataChannel.send(JSON.stringify(message));
    } else {
      console.warn(
        "[Handshake] DataChannel nicht offen, Nachricht konnte nicht gesendet werden",
      );
    }
  }

  private sendError(error: string): void {
    const msg: HandshakeErrorMessage = { type: "handshake-error", error };
    this.sendMessage(msg);
  }

  private updateStatus(status: HandshakeStatus): void {
    this.status = status;
    this.onStatusChange({
      status,
      peerUserId: this.peerUserId ?? undefined,
      peerDeviceId: this.peerDeviceId ?? undefined,
    });
  }

  /** Aktuellen Status abfragen */
  getStatus(): HandshakeStatus {
    return this.status;
  }

  /** Cleanup */
  destroy(): void {
    this.status = "idle";
    this.myChallenge = null;
    this.peerUserId = null;
    this.peerDeviceId = null;
  }
}
