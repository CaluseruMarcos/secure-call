import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel";
import { ReactMutation, useMutation } from "convex/react";






const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ]
}

export default async function sendSDPOffer(callId: Id<"calls">,updateCall: ReactMutation<typeof api.calls.updateCall>) {
const pc = new RTCPeerConnection(iceServers)
const offer = await pc.createOffer()
await pc.setLocalDescription(offer)
// Offer in Convex speichern

await updateCall({ callId, payload: { offer: JSON.stringify(offer) } })



}

export async function sendSDPAnswer(callId: Id<"calls">, offer:string, updateCall: ReactMutation<typeof api.calls.updateCall>) {
  const pc = new RTCPeerConnection(iceServers)
  await pc.setRemoteDescription(JSON.parse(offer))
  const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

  // Answer in Convex speichern
  await updateCall({ callId, payload: { answer: JSON.stringify(answer) } })
}
