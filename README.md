# SecureCall

A secure peer-to-peer video calling application built with Next.js, Convex, and WebRTC. SecureCall uses **password-protected cryptographic vaults** to secure RSA key pairs, enabling encrypted video communication with end-to-end verification.

## What is SecureCall?

SecureCall is a modern video calling platform that prioritizes security and privacy through:

1. **Encrypted Key Vault** - RSA private keys are encrypted with AES-GCM using a password-derived master key
2. **Challenge-Response Authentication** - Optional RSA signature verification to prove caller identity
3. **WebRTC P2P Communication** - Direct peer-to-peer encrypted video and audio streams

## Technology Stack

- **Frontend**: Next.js 16 (React 19), TypeScript, Tailwind CSS
- **Backend**: Convex (real-time database and serverless functions)
- **Authentication**: @convex-dev/auth (password-based authentication)
- **Video/Audio**: WebRTC with ICE candidates
- **Cryptography**: 
  - RSA-PSS 2048-bit (signing/verification)
  - AES-GCM 256-bit (private key encryption)
  - PBKDF2 with 600,000 iterations (password derivation)
  - SHA-256 hashing

## Key Features

✅ **Password-Protected Vaults** - Private keys encrypted with user password  
✅ **WebRTC Peer-to-Peer** - Direct encrypted video/audio communication  
✅ **Real-time Call Management** - Incoming call notifications with accept/reject  
✅ **ICE Candidate Exchange** - Reliable NAT traversal using STUN servers  
✅ **Zero-Knowledge Architecture** - Server never sees unencrypted private keys  
✅ **Session Management** - Call status tracking (pending, connected, ended)  

## How It Works

### 1. Registration & Vault Creation
When a user registers:
1. **Password Entry**: User creates a password for their account
2. **RSA Key Generation**: A 2048-bit RSA-PSS key pair is generated in the browser
3. **Password Derivation**: PBKDF2 derives a 256-bit AES key from the password (600,000 iterations)
4. **Private Key Encryption**: The RSA private key is encrypted with AES-GCM
5. **Vault Storage**: Public key and encrypted vault data (encryptedPrivateKey, vaultSalt, vaultIv) are stored in Convex

**Code Reference**: `app/utils/crypto.ts:49` - `createVault()`

### 2. Login & Vault Unlock
When a user logs in:
1. **Password Authentication**: User enters their password
2. **Vault Retrieval**: Encrypted vault data is fetched from the database
3. **Key Derivation**: The same PBKDF2 process recreates the AES master key
4. **Decryption**: The RSA private key is decrypted using AES-GCM
5. **Session Ready**: User can now make/receive calls

**Code Reference**: `app/utils/crypto.ts:91` - `unlockVault()`

### 3. Making a Call
When initiating a call:
1. **User Selection**: Caller selects a user from the available users list
2. **Media Capture**: Browser requests camera and microphone access
3. **Call Creation**: A call record is created in Convex with status "pending"
4. **Peer Connection**: RTCPeerConnection is created with STUN servers
5. **SDP Offer**: Caller creates and sends an SDP offer to the database
6. **ICE Candidates**: ICE candidates are collected and stored in real-time
7. **Answer Wait**: Caller waits for the callee to accept and send an SDP answer

**Code Reference**: `app/videoCall/page.tsx:197` - `initiateCall()`

### 4. Receiving a Call
When receiving a call:
1. **Incoming Notification**: Callee sees an incoming call modal with caller info
2. **Accept/Reject**: Callee can accept or reject the call
3. **Media Setup**: On accept, callee's camera and microphone are activated
4. **SDP Answer**: Callee processes the offer and sends back an SDP answer
5. **ICE Exchange**: ICE candidates are exchanged for NAT traversal
6. **Connection**: WebRTC establishes a direct P2P connection
7. **Stream Display**: Both users can see and hear each other

**Code Reference**: `app/videoCall/page.tsx:123` - `handleAcceptCall()`

### 5. WebRTC Connection Flow
```
Caller Browser          Convex Database         Callee Browser
     │                       │                         │
     ├─ createCall ─────────▶│                         │
     ├─ SDP Offer ──────────▶│                         │
     ├─ ICE Candidates ─────▶│                         │
     │                       │◀────── Poll for call ───┤
     │                       │────── Call data ───────▶│
     │                       │◀────── acceptCall ──────┤
     │                       │◀────── SDP Answer ──────┤
     │◀── Poll for answer ───│                         │
     │─── Answer received ───│                         │
     │                       │◀────── ICE Candidates ──┤
     │◀── ICE Candidates ────│                         │
     │                                                  │
     └──────────── WebRTC P2P Audio/Video ────────────┘
```

## Security Model

### Vault Encryption (Password → Private Key)
```
User Password
     │
     ├─ PBKDF2 (600,000 iterations, SHA-256)
     │     + 16-byte random salt
     │
     ▼
256-bit AES Master Key
     │
     ├─ AES-GCM Encryption
     │     + 12-byte random IV
     │
     ▼
Encrypted RSA Private Key (stored in database)
```

**Security Properties:**
- **Password Protection**: Private key is inaccessible without the correct password
- **Salt**: Prevents rainbow table attacks
- **High Iteration Count**: Slows down brute-force attempts
- **Authenticated Encryption**: AES-GCM provides both confidentiality and integrity

### Challenge-Response (Optional Identity Verification)
While the core video calling functionality is implemented, SecureCall includes infrastructure for challenge-response authentication:

1. **Challenge Creation**: Party A requests to verify Party B's identity
2. **Nonce Generation**: A random nonce is created and stored
3. **Signing**: Party B signs the nonce with their RSA private key
4. **Verification**: The signature is verified using Party B's public key
5. **Proof**: Successful verification proves Party B controls the private key

**Code Reference**: `convex/challange.ts` and `app/utils/crypto.ts:129` - `signChallenge()`

## Database Schema

### Users Table
```typescript
users: {
  name?: string
  email?: string
  publicKey?: string              // RSA public key (base64 SPKI)
  encryptedPrivateKey?: string    // AES-GCM encrypted private key
  vaultSalt?: string              // PBKDF2 salt (base64)
  vaultIv?: string                // AES-GCM IV (base64)
}
```

### Calls Table
```typescript
calls: {
  callerId: Id<"users">
  calleeId: Id<"users">
  offer?: string                  // SDP offer (JSON stringified)
  answer?: string                 // SDP answer (JSON stringified)
  status: string                  // "pending" | "connected" | "ended"
  createdAt: number
}
```

### ICE Candidates Table
```typescript
iceCandidates: {
  callId: Id<"calls">
  senderId: Id<"users">
  candidate: string               // ICE candidate (JSON stringified)
  createdAt: number
}
```

## Getting Started

### Prerequisites
- Node.js 18+ 
- npm or pnpm
- Convex account (convex.dev)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/CaluseruMarcos/secure-call.git
cd secure-call
```

2. Install dependencies:
```bash
npm install
```

3. Set up Convex:
```bash
npx convex dev
```

4. Create a `.env.local` file with your Convex deployment URL:
```env
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
CONVEX_SITE_URL=http://localhost:3000
```

5. Run the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser

### Using HTTPS (Required for Camera/Microphone Access)
For local development with real camera/microphone access:
```bash
npm run dev-https
```

## Project Structure

```
secure-call/
├── app/
│   ├── page.tsx                 # Login/Register page
│   ├── videoCall/page.tsx       # Video call interface
│   ├── utils/
│   │   ├── crypto.ts            # RSA & AES cryptography functions
│   │   └── webrtc.ts            # WebRTC connection management
│   └── ConvexClientProvider.tsx # Convex client setup
├── convex/
│   ├── schema.ts                # Database schema
│   ├── auth.ts                  # Authentication config
│   ├── users.ts                 # User queries/mutations
│   ├── calls.ts                 # Call management
│   ├── challange.ts             # Challenge-response system
│   └── auth.config.ts           # Auth provider config
└── package.json
```

## API Reference

### Crypto Functions (`app/utils/crypto.ts`)

#### `createVault(password: string)`
Creates an encrypted vault with a new RSA key pair.
- **Returns**: `{ publicKey, encryptedPrivateKey, vaultSalt, vaultIv, localPrivateKey }`

#### `unlockVault(password, vaultData)`
Decrypts the private key using the user's password.
- **Returns**: `CryptoKey` (RSA private key)

#### `signChallenge(privateKey, nonce)`
Signs a challenge nonce with the RSA private key.
- **Returns**: `string` (base64 signature)

#### `verifyChallenge(publicKeyBase64, signatureBase64, nonce)`
Verifies a signature against a public key and nonce.
- **Returns**: `boolean`

### WebRTC Functions (`app/utils/webrtc.ts`)

#### `createPeerConnection(callId, addIceCandidateMutation, onRemoteStream)`
Creates an RTCPeerConnection with ICE candidate handling.

#### `sendSDPOffer(callId, pc, localStream, updateCall)`
Creates and sends an SDP offer.

#### `sendSDPAnswer(callId, pc, offer, localStream, updateCall)`
Processes an offer and sends an SDP answer.

## Security Considerations

### What is Protected
✅ **Private keys** are encrypted with password-derived keys  
✅ **WebRTC streams** are encrypted end-to-end by the browser  
✅ **ICE candidates** enable NAT traversal securely  
✅ **Passwords** are handled by Convex Auth with secure hashing  

### What is NOT Protected (in this prototype)
⚠️ **SDP offers/answers** are stored in plain text in the database  
⚠️ **Call metadata** (who called whom, when) is visible to the database  
⚠️ **No biometric verification** (face recognition removed in favor of password-based vault)  
⚠️ **Challenge-response** is implemented but not enforced in the call flow  

### Production Recommendations
For a production deployment, consider:
- **End-to-end encryption** of signaling data (SDP, ICE candidates)
- **TURN servers** for better NAT traversal in restrictive networks
- **Certificate pinning** for the Convex backend
- **Rate limiting** on call initiation to prevent spam
- **Monitoring** for failed authentication attempts

## License

ISC License - See LICENSE file for details

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- Backend powered by [Convex](https://convex.dev/)
- Authentication via [@convex-dev/auth](https://labs.convex.dev/auth)
- WebRTC implementation inspired by [WebRTC samples](https://webrtc.github.io/samples/)
