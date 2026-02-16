import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel";
import { ReactMutation } from "convex/react";

const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 10
}

export interface WebRTCState {
  pc: RTCPeerConnection | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
}

export async function initializeLocalStream(): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });
  return stream;
}

export function createPeerConnection(
  callId: Id<"calls">,
  addIceCandidateMutation: ReactMutation<typeof api.calls.addIceCandidate>,
  onRemoteStream: (stream: MediaStream) => void
): RTCPeerConnection {
  const pc = new RTCPeerConnection(iceServers);

  // ICE Kandidaten sammeln und senden
  pc.onicecandidate = async (event) => {
    if (event.candidate) {
      try {
        await addIceCandidateMutation({
          callId,
          candidate: JSON.stringify(event.candidate.toJSON())
        });
        console.log('ICE candidate sent');
      } catch (err) {
        console.error('Error sending ICE candidate:', err);
      }
    }
  };

  // ICE Connection State überwachen
  pc.oniceconnectionstatechange = () => {
    console.log('ICE Connection State:', pc.iceConnectionState);
    if (pc.iceConnectionState === 'failed') {
      console.error('ICE Connection failed');
    }
  };

  // Remote Stream empfangen
  pc.ontrack = (event) => {
    console.log('Remote track received:', event.streams[0]);
    onRemoteStream(event.streams[0]);
  };

  return pc;
}

export async function sendSDPOffer(
  callId: Id<"calls">,
  pc: RTCPeerConnection,
  localStream: MediaStream,
  updateCall: ReactMutation<typeof api.calls.updateCall>
): Promise<void> {
  // Lokale Tracks zur Verbindung hinzufügen
  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
  });

  // Offer erstellen
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // Offer in Convex speichern
  await updateCall({ 
    callId, 
    payload: { offer: JSON.stringify(offer) } 
  });
  
  console.log('SDP Offer sent');
}

export async function sendSDPAnswer(
  callId: Id<"calls">,
  pc: RTCPeerConnection,
  offer: string,
  localStream: MediaStream,
  updateCall: ReactMutation<typeof api.calls.updateCall>
): Promise<void> {
  // Remote Description setzen (Offer vom Caller)
  await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(offer)));
  
  // Lokale Tracks zur Verbindung hinzufügen
  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
  });

  // Answer erstellen
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  // Answer in Convex speichern
  await updateCall({ 
    callId, 
    payload: { answer: JSON.stringify(answer) } 
  });
  
  console.log('SDP Answer sent');
}

export async function handleReceivedAnswer(
  pc: RTCPeerConnection,
  answer: string
): Promise<void> {
  if (pc.signalingState !== 'have-local-offer') {
    console.warn('Cannot set remote answer, invalid signaling state:', pc.signalingState);
    return;
  }
  
  await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(answer)));
  console.log('Remote Answer set');
}

export async function addIceCandidateToPC(
  pc: RTCPeerConnection,
  candidate: string
): Promise<void> {
  try {
    
    if (!pc.remoteDescription) {
      console.warn('Cannot add ICE candidate: no remote description yet');
      return;
    }
    
    await pc.addIceCandidate(new RTCIceCandidate(JSON.parse(candidate)));
    console.log('ICE candidate added');
  } catch (err) {
    console.error('Error adding ICE candidate:', err);
  }
}

export function cleanupPeerConnection(pc: RTCPeerConnection | null, localStream: MediaStream | null): void {
  if (pc) {
    pc.close();
  }
  
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
}

export function createDataChannel(pc: RTCPeerConnection, label: string): RTCDataChannel {

  const dataChannel = pc.createDataChannel(label);

  dataChannel.onopen = () => {
    console.log('Data channel opened');
  };


  return dataChannel;
}

export function sendDataChannelMessage(dataChannel: RTCDataChannel, message: any): void {

  if (dataChannel.readyState === 'open') {
    dataChannel.send(JSON.stringify(message));
    console.log('Data channel message sent:', message);
  } else {
    console.warn('Data channel is not open. Current state:', dataChannel.readyState);
  }


}

export function closeDataChannel(dataChannel: RTCDataChannel): void {
  if (dataChannel) {
    dataChannel.close();
    console.log('Data channel closed');
  }
  
}