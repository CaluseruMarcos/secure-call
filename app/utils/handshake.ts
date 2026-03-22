// ============================================================================
// handshake.ts — Challenge-Response Handshake ueber WebRTC DataChannel
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
  generateECDHKeyPair,
  exportECDHPublicKey,
  importECDHPublicKey,
  deriveHMACKey,
} from "./crypto";

// ============================================================================
// Types
// ============================================================================

export type HandshakeStatus =
  | "idle"
  | "waiting"
  | "responding"
  | "verifying"
  | "verified"
  | "warning"
  | "failed";

export interface HandshakeResult {
  status: HandshakeStatus;
  peerUserId?: string;
  peerDeviceId?: string;
  peerName?: string;
  error?: string;
  heartbeatCount?: number;
  hmacKey?: CryptoKey;
  audioSigningEnabled?: boolean; // true nur wenn BEIDE Seiten es unterstuetzen
}

// DataChannel Nachrichten-Typen
interface ChallengeMessage {
  type: "challenge";
  challenge: string;
  userId: string;
  deviceId: string;
  timestamp: number;
  ecdhPublicKey: string;
  supportsAudioSigning: boolean; // Browser unterstuetzt Insertable Streams?
}

interface ChallengeResponseMessage {
  type: "challenge-response";
  challengeResponse: string;
  challenge: string;
  userId: string;
  deviceId: string;
  timestamp: number;
  ecdhPublicKey: string;
  supportsAudioSigning: boolean;
}

interface ResponseMessage {
  type: "response";
  challengeResponse: string;
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

export type FetchPublicKeyFn = (
  userId: string,
  deviceId: string,
) => Promise<string | null>;

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

  // State
  private myChallenge: Uint8Array | null = null;
  private myChallengeTimestamp: number = 0;
  private status: HandshakeStatus = "idle";
  private peerUserId: string | null = null;
  private peerDeviceId: string | null = null;
  private peerName: string | null = null;
  private isInitiator: boolean = false;

  // Heartbeat
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatCount: number = 0;
  private static HEARTBEAT_INTERVAL_MS = 30_000;

  // Retry
  private consecutiveFailures: number = 0;
  private static MAX_RETRIES = 1;

  // Sticky failure: Einmal failed → bleibt failed bis BEIDE Richtungen klappen
  // Wir tracken ob WIR den Peer erfolgreich verifiziert haben UND ob der Peer UNS verifiziert hat
  private iVerifiedPeer: boolean = false; // Habe ich den Peer verifiziert?
  private peerVerifiedMe: boolean = false; // Hat der Peer mich verifiziert? (kein Error von ihm)
  private hadFailure: boolean = false; // Gab es jemals einen Fehlschlag?

  // ECDH fuer Audio-Signierung
  private myECDHKeyPair: CryptoKeyPair | null = null;
  private peerECDHPublicKey: CryptoKey | null = null;
  private hmacKey: CryptoKey | null = null;

  // Audio-Signing Kompatibilitaet — nur wenn BEIDE Seiten es unterstuetzen
  private iSupportAudioSigning: boolean = false;
  private peerSupportsAudioSigning: boolean = false;

  // Challenge Timeout
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

    this.dataChannel.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    // Pruefen ob dieser Browser Insertable Streams unterstuetzt
    this.iSupportAudioSigning = this.detectInsertableStreamsSupport();
  }

  /**
   * Prueft ob der Browser RTCRtpScriptTransform unterstuetzt.
   */
  private detectInsertableStreamsSupport(): boolean {
    try {
      return typeof RTCRtpScriptTransform !== "undefined";
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Logging
  // ============================================================================

  private log(message: string): void {
    const prefix =
      this.heartbeatCount > 0
        ? `[Heartbeat #${this.heartbeatCount}]`
        : "[Handshake]";
    console.log(`${prefix} ${message}`);
  }

  private logError(message: string): void {
    const prefix =
      this.heartbeatCount > 0
        ? `[Heartbeat #${this.heartbeatCount}]`
        : "[Handshake]";
    console.error(`${prefix} FEHLER: ${message}`);
  }

  // ============================================================================
  // Phase 1: Challenge senden
  // ============================================================================

  async startHandshake(): Promise<void> {
    try {
      this.isInitiator = true;
      this.myChallenge = generateChallenge();
      this.myChallengeTimestamp = Date.now();

      // Neues ECDH-Keypair fuer diesen Handshake (wird bei jedem Heartbeat rotiert)
      this.myECDHKeyPair = await generateECDHKeyPair();
      const ecdhPubJwk = await exportECDHPublicKey(
        this.myECDHKeyPair.publicKey,
      );

      if (
        this.status !== "verified" &&
        this.status !== "warning" &&
        this.status !== "failed"
      ) {
        this.updateStatus("waiting");
      }

      const message: ChallengeMessage = {
        type: "challenge",
        challenge: arrayBufferToBase64(this.myChallenge.buffer as ArrayBuffer),
        userId: this.myUserId,
        deviceId: this.myDeviceId,
        timestamp: this.myChallengeTimestamp,
        ecdhPublicKey: ecdhPubJwk,
        supportsAudioSigning: this.iSupportAudioSigning,
      };

      this.sendMessage(message);
      this.log(
        `Challenge + ECDH Key gesendet (Audio-Signing: ${this.iSupportAudioSigning ? "unterstuetzt" : "nicht unterstuetzt"})`,
      );
    } catch (err) {
      this.handleVerificationFailure(
        `Fehler beim Senden der Challenge: ${err}`,
      );
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
          this.handlePeerReportedError(message.error);
          break;
      }
    } catch (err) {
      console.error("[Handshake] Fehler beim Verarbeiten der Nachricht:", err);
    }
  }

  // ============================================================================
  // Phase 2: Challenge empfangen, signieren, eigene Challenge senden
  // ============================================================================

  private async handleChallenge(msg: ChallengeMessage): Promise<void> {
    try {
      this.peerUserId = msg.userId;
      this.peerDeviceId = msg.deviceId;
      this.peerSupportsAudioSigning = msg.supportsAudioSigning ?? false;

      this.log(
        `Challenge von Peer (${msg.userId.slice(0, 8)}...) empfangen (Audio-Signing: ${this.peerSupportsAudioSigning ? "ja" : "nein"})`,
      );

      if (Date.now() - msg.timestamp > HandshakeManager.CHALLENGE_TIMEOUT_MS) {
        this.sendError("Challenge abgelaufen");
        this.handleVerificationFailure(
          "Empfangene Challenge ist abgelaufen (aelter als 30s)",
        );
        return;
      }

      // Peer ECDH Public Key speichern
      this.peerECDHPublicKey = await importECDHPublicKey(msg.ecdhPublicKey);

      const keyPair = await loadKeyPair(this.myUserId, this.myDeviceId);
      if (!keyPair) {
        this.handleVerificationFailure("Kein eigenes Schluesselpaar gefunden");
        return;
      }

      const challengeNonce = new Uint8Array(base64ToArrayBuffer(msg.challenge));
      const payload = buildChallengePayload(
        challengeNonce,
        msg.userId,
        msg.deviceId,
        msg.timestamp,
      );
      const signature = await signData(keyPair.privateKey, payload);

      this.log("Challenge mit eigenem Private Key signiert");

      // Eigenes ECDH-Keypair generieren
      this.myECDHKeyPair = await generateECDHKeyPair();
      const ecdhPubJwk = await exportECDHPublicKey(
        this.myECDHKeyPair.publicKey,
      );

      this.myChallenge = generateChallenge();
      this.myChallengeTimestamp = Date.now();

      const response: ChallengeResponseMessage = {
        type: "challenge-response",
        challengeResponse: arrayBufferToBase64(signature),
        challenge: arrayBufferToBase64(this.myChallenge.buffer as ArrayBuffer),
        userId: this.myUserId,
        deviceId: this.myDeviceId,
        timestamp: this.myChallengeTimestamp,
        ecdhPublicKey: ecdhPubJwk,
        supportsAudioSigning: this.iSupportAudioSigning,
      };

      this.sendMessage(response);
      this.log(
        "Signierte Antwort + eigene Challenge + ECDH Key an Peer gesendet",
      );
    } catch (err) {
      this.handleVerificationFailure(
        `Fehler beim Beantworten der Challenge: ${err}`,
      );
    }
  }

  // ============================================================================
  // Phase 3: Signierte Antwort verifizieren, Peers Challenge beantworten
  // ============================================================================

  private async handleChallengeResponse(
    msg: ChallengeResponseMessage,
  ): Promise<void> {
    try {
      this.peerUserId = msg.userId;
      this.peerDeviceId = msg.deviceId;
      this.peerSupportsAudioSigning = msg.supportsAudioSigning ?? false;

      this.log(
        `Signierte Antwort von Peer (${msg.userId.slice(0, 8)}...) empfangen (Audio-Signing: ${this.peerSupportsAudioSigning ? "ja" : "nein"})`,
      );

      // 1. Peers Signatur verifizieren
      const peerPublicKeyJwk = await this.fetchPublicKey(
        msg.userId,
        msg.deviceId,
      );
      if (!peerPublicKeyJwk) {
        this.handleVerificationFailure(
          `Kein Public Key fuer Peer in der Datenbank gefunden`,
        );
        return;
      }

      const peerPublicKey = await importPublicKey(peerPublicKeyJwk);
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
        this.handleVerificationFailure(
          "Signatur des Peers ist ungueltig — Die Identitaet des Gespraechspartners konnte nicht bestaetigt werden",
        );
        return;
      }

      this.log("Signatur des Peers verifiziert — Identitaet bestaetigt");
      this.iVerifiedPeer = true;

      // Peer ECDH Public Key speichern (erst NACH Signatur-Verifikation!)
      this.peerECDHPublicKey = await importECDHPublicKey(msg.ecdhPublicKey);

      // 2. Peers Challenge beantworten
      const keyPair = await loadKeyPair(this.myUserId, this.myDeviceId);
      if (!keyPair) {
        this.handleVerificationFailure("Kein eigenes Schluesselpaar gefunden");
        return;
      }

      if (Date.now() - msg.timestamp > HandshakeManager.CHALLENGE_TIMEOUT_MS) {
        this.sendError("Challenge abgelaufen");
        this.handleVerificationFailure("Peers Challenge ist abgelaufen");
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

      this.log("Peers Challenge mit eigenem Private Key signiert");

      this.sendMessage({
        type: "response",
        challengeResponse: arrayBufferToBase64(responseSignature),
      });

      this.log("Signierte Antwort an Peer gesendet");
      await this.tryCompleteHandshake();
    } catch (err) {
      this.handleVerificationFailure(`Fehler bei Verifikation: ${err}`);
    }
  }

  // ============================================================================
  // Phase 4: Finale Antwort verifizieren
  // ============================================================================

  private async handleResponse(msg: ResponseMessage): Promise<void> {
    try {
      if (!this.peerUserId || !this.peerDeviceId || !this.myChallenge) {
        this.handleVerificationFailure("Ungueltiger Handshake-Status");
        return;
      }

      this.log(
        `Finale signierte Antwort von Peer (${this.peerUserId.slice(0, 8)}...) empfangen`,
      );

      const peerPublicKeyJwk = await this.fetchPublicKey(
        this.peerUserId,
        this.peerDeviceId,
      );
      if (!peerPublicKeyJwk) {
        this.handleVerificationFailure("Kein Public Key fuer Peer gefunden");
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
        this.handleVerificationFailure(
          "Signatur des Peers ist ungueltig — Die Identitaet des Gespraechspartners konnte nicht bestaetigt werden",
        );
        return;
      }

      this.log("Signatur des Peers verifiziert — Identitaet bestaetigt");
      this.iVerifiedPeer = true;

      await this.tryCompleteHandshake();
    } catch (err) {
      this.handleVerificationFailure(`Fehler bei finaler Verifikation: ${err}`);
    }
  }

  // ============================================================================
  // Peer meldet Fehler — mein Key konnte nicht verifiziert werden
  // ============================================================================

  private handlePeerReportedError(peerError: string): void {
    this.peerVerifiedMe = false;
    this.hadFailure = true;

    this.logError(
      `Gegenseite konnte unsere Identitaet nicht bestaetigen (${peerError})`,
    );

    this.consecutiveFailures++;

    if (this.consecutiveFailures <= HandshakeManager.MAX_RETRIES) {
      this.status = "warning";
      this.onStatusChange({
        status: "warning",
        error:
          "Möglicher Angriff auf Sie — jemand könnte sich als Sie ausgeben. Wird überprüft...",
        peerUserId: this.peerUserId ?? undefined,
        peerDeviceId: this.peerDeviceId ?? undefined,
        peerName: this.peerName ?? undefined,
        heartbeatCount: this.heartbeatCount,
      });
    } else {
      this.status = "failed";
      this.onStatusChange({
        status: "failed",
        error:
          "Möglicher Angriff auf Sie — jemand könnte sich als Sie ausgeben.",
        peerUserId: this.peerUserId ?? undefined,
        peerDeviceId: this.peerDeviceId ?? undefined,
        peerName: this.peerName ?? undefined,
        heartbeatCount: this.heartbeatCount,
      });

      this.log("Heartbeat laeuft weiter — ueberwache Verbindung");
      this.startHeartbeat();
    }
  }

  // ============================================================================
  // Handshake abschliessen — nur wenn BEIDE Richtungen ok sind
  // ============================================================================

  private async tryCompleteHandshake(): Promise<void> {
    if (this.peerUserId && !this.peerName) {
      this.peerName = await this.fetchUserName(this.peerUserId);
    }

    this.peerVerifiedMe = true;

    if (this.hadFailure && (!this.iVerifiedPeer || !this.peerVerifiedMe)) {
      this.log(
        "Eigene Verifikation ok, warte aber noch auf Bestaetigung der Gegenseite",
      );
      return;
    }

    // HMAC-Key aus ECDH ableiten — NUR wenn BEIDE Seiten Audio-Signing unterstuetzen
    const bothSupportAudioSigning =
      this.iSupportAudioSigning && this.peerSupportsAudioSigning;

    if (
      bothSupportAudioSigning &&
      this.myECDHKeyPair?.privateKey &&
      this.peerECDHPublicKey
    ) {
      try {
        this.hmacKey = await deriveHMACKey(
          this.myECDHKeyPair.privateKey,
          this.peerECDHPublicKey,
        );
        this.log(
          "HMAC-Key fuer Audio-Signierung abgeleitet (beide Seiten unterstuetzen es)",
        );
      } catch (err) {
        console.error("[Handshake] HMAC-Key Ableitung fehlgeschlagen:", err);
      }
    } else if (!bothSupportAudioSigning) {
      this.hmacKey = null;
      if (this.heartbeatCount === 0) {
        this.log(
          `Audio-Signierung deaktiviert — ${!this.iSupportAudioSigning ? "eigener Browser" : "Peer"} unterstuetzt keine Insertable Streams`,
        );
      }
    }

    this.consecutiveFailures = 0;

    this.status = "verified";
    this.onStatusChange({
      status: "verified",
      peerUserId: this.peerUserId ?? undefined,
      peerDeviceId: this.peerDeviceId ?? undefined,
      peerName: this.peerName ?? undefined,
      heartbeatCount: this.heartbeatCount,
      hmacKey: this.hmacKey ?? undefined,
      audioSigningEnabled: bothSupportAudioSigning && !!this.hmacKey,
    });

    const name = this.peerName ?? this.peerUserId?.slice(0, 8) + "...";

    if (this.heartbeatCount === 0) {
      this.log(`Gegenseitig verifiziert mit ${name}`);
    } else if (this.hadFailure) {
      this.log(`Verbindung wieder sicher — ${name} erneut verifiziert`);
      this.hadFailure = false;
    } else {
      this.log(`Identitaet von ${name} erneut bestaetigt`);
    }

    this.startHeartbeat();
  }

  // ============================================================================
  // ICH konnte den Peer nicht verifizieren
  // ============================================================================

  private handleVerificationFailure(error: string): void {
    this.iVerifiedPeer = false;
    this.hadFailure = true;
    this.consecutiveFailures++;

    if (this.consecutiveFailures <= HandshakeManager.MAX_RETRIES) {
      this.logError(
        `${error} — Automatischer Retry (${this.consecutiveFailures}/${HandshakeManager.MAX_RETRIES})...`,
      );

      this.status = "warning";
      this.onStatusChange({
        status: "warning",
        error:
          "Möglicher Angriff — jemand könnte sich als Ihren Gesprächspartner ausgeben. Wird überprüft...",
        peerUserId: this.peerUserId ?? undefined,
        peerDeviceId: this.peerDeviceId ?? undefined,
        peerName: this.peerName ?? undefined,
        heartbeatCount: this.heartbeatCount,
      });

      setTimeout(() => {
        if (this.dataChannel.readyState === "open") {
          this.log("Starte Retry-Verifikation...");
          this.startHandshake();
        }
      }, 2000);
    } else {
      this.logError(
        `${error} — ENDGUELTIG FEHLGESCHLAGEN nach ${this.consecutiveFailures} Versuchen`,
      );

      this.status = "failed";
      this.onStatusChange({
        status: "failed",
        error:
          "Möglicher Angriff — jemand könnte sich als Ihren Gesprächspartner ausgeben. Seien Sie vorsichtig!",
        peerUserId: this.peerUserId ?? undefined,
        peerDeviceId: this.peerDeviceId ?? undefined,
        peerName: this.peerName ?? undefined,
        heartbeatCount: this.heartbeatCount,
      });

      this.log(
        "Heartbeat laeuft weiter — ueberwache ob Verbindung wieder sicher wird",
      );
      this.startHeartbeat();
    }
  }

  // ============================================================================
  // Heartbeat
  // ============================================================================

  private startHeartbeat(): void {
    this.stopHeartbeat();

    const offset = this.isInitiator ? 0 : 5_000;

    setTimeout(() => {
      this.heartbeatInterval = setInterval(async () => {
        if (this.dataChannel.readyState !== "open") {
          this.log("DataChannel geschlossen — stoppe Heartbeat");
          this.stopHeartbeat();
          return;
        }

        if (
          this.status !== "verified" &&
          this.status !== "failed" &&
          this.status !== "warning"
        ) {
          return;
        }

        this.heartbeatCount++;

        // Bei neuem Heartbeat-Zyklus die Richtungs-Flags zuruecksetzen
        this.iVerifiedPeer = false;
        this.peerVerifiedMe = !this.hadFailure; // Optimistisch, wird auf false gesetzt wenn Peer Error meldet

        this.log("Starte Re-Verifikation...");
        await this.startHandshake();
      }, HandshakeManager.HEARTBEAT_INTERVAL_MS);
    }, offset);

    if (this.heartbeatCount === 0) {
      this.log(
        `Heartbeat gestartet — pruefe alle ${HandshakeManager.HEARTBEAT_INTERVAL_MS / 1000}s` +
          (offset > 0 ? ` (${offset / 1000}s versetzt)` : ""),
      );
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // ============================================================================
  // Hilfsfunktionen
  // ============================================================================

  private sendMessage(message: HandshakeMessage): void {
    if (this.dataChannel.readyState === "open") {
      this.dataChannel.send(JSON.stringify(message));
    }
  }

  private sendError(error: string): void {
    this.sendMessage({ type: "handshake-error", error });
  }

  private updateStatus(status: HandshakeStatus): void {
    this.status = status;
    this.onStatusChange({
      status,
      peerUserId: this.peerUserId ?? undefined,
      peerDeviceId: this.peerDeviceId ?? undefined,
      peerName: this.peerName ?? undefined,
      heartbeatCount: this.heartbeatCount,
    });
  }

  getStatus(): HandshakeStatus {
    return this.status;
  }

  destroy(): void {
    this.stopHeartbeat();
    this.status = "idle";
    this.myChallenge = null;
    this.peerUserId = null;
    this.peerDeviceId = null;
    this.peerName = null;
    this.heartbeatCount = 0;
    this.consecutiveFailures = 0;
    this.isInitiator = false;
    this.iVerifiedPeer = false;
    this.peerVerifiedMe = false;
    this.hadFailure = false;
    this.myECDHKeyPair = null;
    this.peerECDHPublicKey = null;
    this.hmacKey = null;
    this.peerSupportsAudioSigning = false;
  }
}
