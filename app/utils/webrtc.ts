import { updateCall } from '../convex/calls'

const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ]
}

export default async function sendSDPOffer(callId: string) {
const pc = new RTCPeerConnection(iceServers)
const offer = await pc.createOffer()
await pc.setLocalDescription(offer)
// Offer in Convex speichern
await updateCall({ callId, offer: JSON.stringify(offer) })



}