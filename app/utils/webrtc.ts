import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ReactMutation } from "convex/react";

const iceServers: any = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
  iceCandidatePoolSize: 10,
  // Chrome braucht dies fuer RTCRtpScriptTransform auf Receivern
  // Firefox ignoriert es einfach
  encodedInsertableStreams: true,
};

export interface WebRTCState {
  pc: RTCPeerConnection | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  handshakeChannel: RTCDataChannel | null;
}

export async function initializeLocalStream(): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });
  return stream;
}

/**
 * Erstellt eine PeerConnection mit einem dedizierten DataChannel für den Handshake.
 *
 * Der Caller erstellt den DataChannel (createDataChannel),
 * der Callee empfängt ihn über ondatachannel.
 */
export function createPeerConnection(
  callId: Id<"calls">,
  addIceCandidateMutation: ReactMutation<typeof api.calls.addIceCandidate>,
  onRemoteStream: (stream: MediaStream) => void,
  onHandshakeChannel: (channel: RTCDataChannel) => void,
  isCaller: boolean,
  onAudioReceiver?: (receiver: RTCRtpReceiver) => void,
): RTCPeerConnection {
  const pc = new RTCPeerConnection(iceServers);

  // ICE Kandidaten sammeln und senden
  pc.onicecandidate = async (event) => {
    if (event.candidate) {
      try {
        await addIceCandidateMutation({
          callId,
          candidate: JSON.stringify(event.candidate.toJSON()),
        });
      } catch (err) {
        console.error("Error sending ICE candidate:", err);
      }
    }
  };

  // ICE Connection State überwachen
  pc.oniceconnectionstatechange = () => {
    console.log("ICE Connection State:", pc.iceConnectionState);
    if (pc.iceConnectionState === "failed") {
      console.error("ICE Connection failed");
    }
  };

  // Remote Stream empfangen
  pc.ontrack = (event) => {
    console.log("Remote track received:", event.track.kind);
    onRemoteStream(event.streams[0]);

    // Audio-Receiver sofort an den AudioSigningManager uebergeben
    // MUSS hier passieren, bevor Frames fliessen!
    if (event.track.kind === "audio" && onAudioReceiver) {
      onAudioReceiver(event.receiver);
    }
  };

  if (isCaller) {
    // Caller erstellt den Handshake-DataChannel
    const handshakeChannel = pc.createDataChannel("handshake", {
      ordered: true, // Reihenfolge ist wichtig für den Handshake
    });

    handshakeChannel.onopen = () => {
      console.log("[WebRTC] Handshake DataChannel geöffnet (Caller)");
      onHandshakeChannel(handshakeChannel);
    };

    handshakeChannel.onerror = (err) => {
      console.error("[WebRTC] Handshake DataChannel Fehler:", err);
    };
  } else {
    // Callee empfängt den DataChannel
    pc.ondatachannel = (event) => {
      if (event.channel.label === "handshake") {
        const channel = event.channel;
        channel.onopen = () => {
          console.log("[WebRTC] Handshake DataChannel geöffnet (Callee)");
          onHandshakeChannel(channel);
        };
        channel.onerror = (err) => {
          console.error("[WebRTC] Handshake DataChannel Fehler:", err);
        };
      }
    };
  }

  return pc;
}

export async function sendSDPOffer(
  callId: Id<"calls">,
  pc: RTCPeerConnection,
  localStream: MediaStream,
  updateCall: ReactMutation<typeof api.calls.updateCall>,
  onTracksAdded?: (pc: RTCPeerConnection) => void,
): Promise<void> {
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Callback DIREKT nach addTrack — hier Sender-Transform setzen
  if (onTracksAdded) {
    onTracksAdded(pc);
  }

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  await updateCall({
    callId,
    payload: { offer: JSON.stringify(offer) },
  });

  console.log("SDP Offer sent");
}

export async function sendSDPAnswer(
  callId: Id<"calls">,
  pc: RTCPeerConnection,
  offer: string,
  localStream: MediaStream,
  updateCall: ReactMutation<typeof api.calls.updateCall>,
  onTracksAdded?: (pc: RTCPeerConnection) => void,
): Promise<void> {
  await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(offer)));

  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Callback DIREKT nach addTrack
  if (onTracksAdded) {
    onTracksAdded(pc);
  }

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  await updateCall({
    callId,
    payload: { answer: JSON.stringify(answer) },
  });

  console.log("SDP Answer sent");
}

export async function handleReceivedAnswer(
  pc: RTCPeerConnection,
  answer: string,
): Promise<void> {
  if (pc.signalingState !== "have-local-offer") {
    console.warn(
      "Cannot set remote answer, invalid signaling state:",
      pc.signalingState,
    );
    return;
  }

  await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(answer)));
  console.log("Remote Answer set");
}

export async function addIceCandidateToPC(
  pc: RTCPeerConnection,
  candidate: string,
): Promise<void> {
  try {
    if (!pc.remoteDescription) {
      console.warn("Cannot add ICE candidate: no remote description yet");
      return;
    }

    await pc.addIceCandidate(new RTCIceCandidate(JSON.parse(candidate)));
  } catch (err) {
    console.error("Error adding ICE candidate:", err);
  }
}

export function cleanupPeerConnection(
  pc: RTCPeerConnection | null,
  localStream: MediaStream | null,
  handshakeChannel: RTCDataChannel | null,
): void {
  if (handshakeChannel) {
    handshakeChannel.close();
  }
  if (pc) {
    pc.close();
  }
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
  }
}
