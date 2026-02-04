# SecureCall

A secure video calling application that uses **RSA cryptographic authentication** combined with **facial recognition** to verify caller identity.

## What is SecureCall?

SecureCall prevents caller identity spoofing and deepfake attacks by combining two security layers:

1. **Biometric Authentication (Face Unlock)** - Uses TensorFlow FaceMesh to detect the user's face in real-time
2. **Cryptographic Challenge-Response** - Uses RSA key pairs to mathematically prove identity

## How It Works

### Registration
- Each user generates an RSA key pair (2048-bit) **in their browser**
- **Private key** stays locked in browser localStorage (never leaves the device)
- **Public key** is sent to the server and stored in the database

### Making a Call
1. **Face Unlock**: TensorFlow FaceMesh detects your face to unlock the private key
2. **Challenge Request**: Backend generates a random challenge string
3. **Signing**: Your browser signs the challenge with your private key
4. **Verification**: Backend verifies the signature using your public key
5. **Call Start**: Once verified, the WebRTC call begins

### Why This Is Secure

**Against Deepfakes**: Even if an attacker fakes your face on video, they cannot fake the cryptographic signature without your private key.

**Against Replay Attacks**: Each challenge is unique and single-use. Old signatures cannot be reused.

**Against Key Theft**: The private key never leaves your browser. It's only unlocked when your face is detected.

**Mathematical Security**: RSA signatures are mathematically impossible to forge without the private key.

## Technology Stack

- **Frontend**: React, TensorFlow.js (FaceMesh), WebRTC
- **Backend**: Node.js/Express (assumed from architecture)
- **Cryptography**: RSA-2048, SHA-256
- **Database**: Stores public keys and session challenges (never private keys)

## Key Features

✅ Zero-knowledge authentication (server never sees private keys)  
✅ Biometric + cryptographic dual-factor security  
✅ Real-time face detection using ML  
✅ Challenge-response protocol prevents replay attacks  
✅ Peer-to-peer encrypted calls via WebRTC  

## Security Model

```
User's Browser          Backend Server          Receiver's Browser
     │                       │                         │
     ├─ Private Key (🔒)     │                         │
     ├─ Face Detection       │                         │
     ├─ Signs Challenge  ────▶ Verifies Signature      │
     │                       ├─ Challenge (random)     │
     │                       ├─ Public Key (stored) ───▶ Verifies Again
     │                       └─ Signature (proof)  ────▶│
     │                                                   │
     └─────────────────── WebRTC Audio/Video ──────────┘
```

**The private key never touches the network. Only signatures travel to the server.**
