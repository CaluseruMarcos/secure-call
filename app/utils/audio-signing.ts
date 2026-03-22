// ============================================================================
// audio-signing.ts — Audio-Signierung via RTCRtpScriptTransform
//
// WICHTIG: Der Receiver-Transform muss gesetzt werden BEVOR Frames fliessen,
// sonst werden die Frames nicht abgefangen. Deshalb:
// 1. setupSender() — nach addTrack aufrufen
// 2. setupReceiverForTrack() — im ontrack-Event aufrufen
// 3. activateWithKey() — nach Handshake aufrufen (sendet Key an Worker)
// 4. updateKey() — bei Heartbeat aufrufen
// ============================================================================

export interface AudioSigningStats {
  sender: {
    signedFrames: number;
    counter: number;
    signingPaused: boolean;
  };
  receiver: {
    validFrames: number;
    invalidFrames: number;
    lastReceivedCounter: number;
  };
}

export function supportsRtpScriptTransform(): boolean {
  return typeof RTCRtpScriptTransform !== "undefined";
}

export class AudioSigningManager {
  private senderPort: MessagePort | null = null;
  private receiverPort: MessagePort | null = null;
  private senderWorker: Worker | null = null;
  private receiverWorker: Worker | null = null;
  private senderReady: boolean = false;
  private receiverReady: boolean = false;
  private active: boolean = false;

  private senderStats = { signedFrames: 0, counter: 0, signingPaused: false };
  private receiverStats = {
    validFrames: 0,
    invalidFrames: 0,
    lastReceivedCounter: 0,
  };

  private onStatsUpdate?: (stats: AudioSigningStats) => void;
  private onInvalidFrames?: (count: number) => void;

  constructor(
    onStatsUpdate?: (stats: AudioSigningStats) => void,
    onInvalidFrames?: (count: number) => void,
  ) {
    this.onStatsUpdate = onStatsUpdate;
    this.onInvalidFrames = onInvalidFrames;
  }

  // ============================================================================
  // Schritt 1: Sender-Transform einrichten (nach addTrack)
  // ============================================================================

  setupSender(pc: RTCPeerConnection): boolean {
    if (!supportsRtpScriptTransform()) return false;

    const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
    if (!sender) {
      console.warn("[AudioSigning] Kein Audio-Sender gefunden");
      return false;
    }

    try {
      const channel = new MessageChannel();
      this.senderPort = channel.port1;

      this.senderPort.onmessage = (event) => {
        if (event.data.type === "stats" && event.data.role === "sender") {
          this.senderStats = {
            signedFrames: event.data.signedFrames,
            counter: event.data.counter,
            signingPaused: event.data.signingPaused,
          };
          this.reportStats();
        }
      };

      this.senderWorker = new Worker("/audio-worker.js");

      // @ts-ignore
      sender.transform = new RTCRtpScriptTransform(
        this.senderWorker,
        { role: "sender", port: channel.port2 },
        [channel.port2],
      );

      this.senderReady = true;
      console.log(
        "[AudioSigning] Sender-Transform eingerichtet (wartet auf Key)",
      );
      return true;
    } catch (err) {
      console.error("[AudioSigning] Sender-Setup fehlgeschlagen:", err);
      return false;
    }
  }

  // ============================================================================
  // Schritt 2: Receiver-Transform einrichten (im ontrack-Event!)
  // Muss SOFORT beim Track-Empfang aufgerufen werden, bevor Frames fliessen.
  // ============================================================================

  setupReceiverForTrack(receiver: RTCRtpReceiver): boolean {
    if (!supportsRtpScriptTransform()) return false;

    if (receiver.track?.kind !== "audio") return false;

    try {
      const channel = new MessageChannel();
      this.receiverPort = channel.port1;

      this.receiverPort.onmessage = (event) => {
        if (event.data.type === "stats" && event.data.role === "receiver") {
          this.receiverStats = {
            validFrames: event.data.validFrames,
            invalidFrames: event.data.invalidFrames,
            lastReceivedCounter: event.data.lastReceivedCounter,
          };
          this.reportStats();

          if (event.data.invalidFrames > 0 && this.onInvalidFrames) {
            this.onInvalidFrames(event.data.invalidFrames);
          }
        }
      };

      this.receiverWorker = new Worker("/audio-worker.js");

      // @ts-ignore
      receiver.transform = new RTCRtpScriptTransform(
        this.receiverWorker,
        { role: "receiver", port: channel.port2 },
        [channel.port2],
      );

      this.receiverReady = true;
      console.log(
        "[AudioSigning] Receiver-Transform eingerichtet (wartet auf Key)",
      );
      return true;
    } catch (err) {
      console.error("[AudioSigning] Receiver-Setup fehlgeschlagen:", err);
      return false;
    }
  }

  // ============================================================================
  // Schritt 3: Key senden (nach Handshake-Verifikation)
  // ============================================================================

  activateWithKey(hmacKey: CryptoKey): void {
    if (this.senderPort && this.senderReady) {
      this.senderPort.postMessage({ type: "set-key", key: hmacKey });
    }
    if (this.receiverPort && this.receiverReady) {
      this.receiverPort.postMessage({ type: "set-key", key: hmacKey });
    }
    this.active = this.senderReady || this.receiverReady;
    console.log(
      "[AudioSigning] HMAC-Key an Worker gesendet, Audio-Signierung aktiv",
    );
  }

  // ============================================================================
  // Schritt 4: Key rotieren (bei Heartbeat)
  // ============================================================================

  updateKey(hmacKey: CryptoKey): void {
    if (this.senderPort) {
      this.senderPort.postMessage({ type: "update-key", key: hmacKey });
    }
    if (this.receiverPort) {
      this.receiverPort.postMessage({ type: "update-key", key: hmacKey });
    }
    console.log("[AudioSigning] HMAC-Key rotiert (Heartbeat)");
  }

  // ============================================================================
  // Test-Funktionen
  // ============================================================================

  pauseSigning(): void {
    if (this.senderPort) {
      this.senderPort.postMessage({ type: "pause-signing" });
      console.log("[AudioSigning] TEST: Signierung pausiert");
    }
  }

  resumeSigning(): void {
    if (this.senderPort) {
      this.senderPort.postMessage({ type: "resume-signing" });
      console.log("[AudioSigning] TEST: Signierung wieder aktiviert");
    }
  }

  // ============================================================================
  // Stats & Status
  // ============================================================================

  private reportStats(): void {
    if (this.onStatsUpdate) {
      this.onStatsUpdate({
        sender: { ...this.senderStats },
        receiver: { ...this.receiverStats },
      });
    }
  }

  getStats(): AudioSigningStats {
    return {
      sender: { ...this.senderStats },
      receiver: { ...this.receiverStats },
    };
  }

  isActive(): boolean {
    return this.active;
  }

  destroy(): void {
    if (this.senderPort) {
      this.senderPort.close();
      this.senderPort = null;
    }
    if (this.receiverPort) {
      this.receiverPort.close();
      this.receiverPort = null;
    }
    if (this.senderWorker) {
      this.senderWorker.terminate();
      this.senderWorker = null;
    }
    if (this.receiverWorker) {
      this.receiverWorker.terminate();
      this.receiverWorker = null;
    }
    this.senderReady = false;
    this.receiverReady = false;
    this.active = false;
  }
}
