// ============================================================================
// audio-worker.js — Web Worker fuer Audio-Frame HMAC-Signierung
//
// Laeuft in einem eigenen Thread, blockiert nicht die UI.
// Empfaengt den HMAC-Key ueber MessageChannel vom Main Thread.
// Wird via RTCRtpScriptTransform in die WebRTC-Pipeline eingebunden.
//
// Frame-Layout: [Original-Audio-Bytes][HMAC 32 Bytes][Counter 4 Bytes]
// ============================================================================

const HMAC_SIZE = 32;
const COUNTER_SIZE = 4;
const TAG_SIZE = HMAC_SIZE + COUNTER_SIZE;

let hmacKey = null;
let counter = 0;
let lastReceivedCounter = 0;
let messagePort = null;
let role = null;

// Stats
let signedFrames = 0;
let validFrames = 0;
let invalidFrames = 0;
let statsInterval = null;

// Test-Modus: Wenn true, werden Frames NICHT signiert (simuliert Angreifer)
let signingPaused = false;

// ============================================================================
// MessageChannel: Key-Updates und Befehle vom Main Thread empfangen
// ============================================================================

function setupMessagePort(port) {
  messagePort = port;
  messagePort.onmessage = (event) => {
    const { type, key } = event.data;

    if (type === "set-key") {
      hmacKey = key;
      counter = 0;
      lastReceivedCounter = 0;
      signedFrames = 0;
      validFrames = 0;
      invalidFrames = 0;
      console.log("[AudioWorker] HMAC-Key gesetzt, Counter zurueckgesetzt");
    }

    if (type === "update-key") {
      hmacKey = key;
      counter = 0;
      lastReceivedCounter = 0;
      // invalidFrames wird NICHT zurueckgesetzt — laeuft weiter bei Angriff
      console.log("[AudioWorker] HMAC-Key rotiert (Heartbeat), Counter zurueckgesetzt");
    }

    // Test-Befehle
    if (type === "pause-signing") {
      signingPaused = true;
      console.log("[AudioWorker] TEST: Signierung pausiert — Frames werden ungeschuetzt gesendet");
    }

    if (type === "resume-signing") {
      signingPaused = false;
      console.log("[AudioWorker] TEST: Signierung wieder aktiviert");
    }

    if (type === "get-stats") {
      sendStats();
    }
  };

  // Stats alle 2 Sekunden automatisch senden
  statsInterval = setInterval(() => {
    sendStats();
  }, 2000);
}

function sendStats() {
  if (messagePort) {
    messagePort.postMessage({
      type: "stats",
      role: role,
      signedFrames: signedFrames,
      validFrames: validFrames,
      invalidFrames: invalidFrames,
      counter: counter,
      lastReceivedCounter: lastReceivedCounter,
      signingPaused: signingPaused,
    });
  }
}

// ============================================================================
// HMAC Berechnung
// ============================================================================

async function computeHMAC(key, data) {
  return await crypto.subtle.sign("HMAC", key, data);
}

async function verifyHMAC(key, signature, data) {
  return await crypto.subtle.verify("HMAC", key, signature, data);
}

// ============================================================================
// Sender Transform: HMAC + Counter an jedes Frame anhaengen
// ============================================================================

function createSenderTransform() {
  let frameCount = 0;
  return new TransformStream({
    async transform(frame, controller) {
      frameCount++;
      if (frameCount === 1) {
        console.log("[AudioWorker] Sender: Erstes Frame empfangen, Signierung", hmacKey ? "aktiv" : "inaktiv (kein Key)");
      }

      if (!hmacKey || signingPaused) {
        controller.enqueue(frame);
        return;
      }

      try {
        const originalData = new Uint8Array(frame.data);
        counter++;

        // Counter als 4 Bytes (Big-Endian)
        const counterBytes = new Uint8Array(4);
        new DataView(counterBytes.buffer).setUint32(0, counter, false);

        // HMAC berechnen ueber: Audio-Daten + Counter
        const dataToSign = new Uint8Array(originalData.byteLength + COUNTER_SIZE);
        dataToSign.set(originalData, 0);
        dataToSign.set(counterBytes, originalData.byteLength);

        const hmac = new Uint8Array(await computeHMAC(hmacKey, dataToSign.buffer));

        // Neues Frame: [Audio][HMAC 32B][Counter 4B]
        const signedData = new Uint8Array(originalData.byteLength + TAG_SIZE);
        signedData.set(originalData, 0);
        signedData.set(hmac, originalData.byteLength);
        signedData.set(counterBytes, originalData.byteLength + HMAC_SIZE);

        frame.data = signedData.buffer;
        signedFrames++;
        controller.enqueue(frame);
      } catch (err) {
        controller.enqueue(frame);
      }
    },
  });
}

// ============================================================================
// Receiver Transform: HMAC pruefen, Counter pruefen
// ============================================================================

function createReceiverTransform() {
  let frameCount = 0;
  return new TransformStream({
    async transform(frame, controller) {
      frameCount++;
      if (frameCount === 1) {
        console.log("[AudioWorker] Receiver: Erstes Frame empfangen, Verifikation", hmacKey ? "aktiv" : "inaktiv (kein Key)");
      }

      if (!hmacKey) {
        controller.enqueue(frame);
        return;
      }

      try {
        const fullData = new Uint8Array(frame.data);

        // Frame muss mindestens TAG_SIZE Bytes haben
        if (fullData.byteLength <= TAG_SIZE) {
          controller.enqueue(frame);
          return;
        }

        // Abtrennen: Audio | HMAC | Counter
        const audioEnd = fullData.byteLength - TAG_SIZE;
        const audioData = fullData.slice(0, audioEnd);
        const receivedHMAC = fullData.slice(audioEnd, audioEnd + HMAC_SIZE);
        const counterBytes = fullData.slice(audioEnd + HMAC_SIZE);
        const frameCounter = new DataView(
          counterBytes.buffer, counterBytes.byteOffset, counterBytes.byteLength
        ).getUint32(0, false);

        // Counter pruefen
        if (frameCounter <= lastReceivedCounter) {
          invalidFrames++;
          return;
        }

        // HMAC verifizieren
        const dataToVerify = new Uint8Array(audioData.byteLength + COUNTER_SIZE);
        dataToVerify.set(audioData, 0);
        dataToVerify.set(counterBytes, audioData.byteLength);

        const hmacToVerify = receivedHMAC.buffer.slice(
          receivedHMAC.byteOffset,
          receivedHMAC.byteOffset + receivedHMAC.byteLength
        );

        const isValid = await verifyHMAC(hmacKey, hmacToVerify, dataToVerify.buffer);

        if (!isValid) {
          invalidFrames++;
          return;
        }

        lastReceivedCounter = frameCounter;
        validFrames++;

        frame.data = audioData.buffer.slice(
          audioData.byteOffset,
          audioData.byteOffset + audioData.byteLength
        );
        controller.enqueue(frame);
      } catch (err) {
        controller.enqueue(frame);
      }
    },
  });
}

// ============================================================================
// RTCRtpScriptTransform Event Handler
// ============================================================================

console.log("[AudioWorker] Worker geladen, warte auf rtctransform Event...");

addEventListener("rtctransform", (event) => {
  const transformer = event.transformer;
  const options = transformer.options || {};
  role = options.role;

  console.log("[AudioWorker] rtctransform Event empfangen, Rolle:", role);

  if (options.port) {
    setupMessagePort(options.port);
  }

  if (role === "sender") {
    console.log("[AudioWorker] Sender-Transform aktiviert");
    transformer.readable
      .pipeThrough(createSenderTransform())
      .pipeTo(transformer.writable)
      .catch((err) => console.error("[AudioWorker] Sender-Pipeline Fehler:", err));
  } else if (role === "receiver") {
    console.log("[AudioWorker] Receiver-Transform aktiviert");
    transformer.readable
      .pipeThrough(createReceiverTransform())
      .pipeTo(transformer.writable)
      .catch((err) => console.error("[AudioWorker] Receiver-Pipeline Fehler:", err));
  }
});