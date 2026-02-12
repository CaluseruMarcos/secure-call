import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables, // Erstellt automatisch alle Tabellen, die Auth braucht
  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    publicKey: v.optional(v.string()),
    encryptedPrivateKey: v.optional(v.string()), // AES-GCM verschlüsselter RSA Private Key
    vaultSalt: v.optional(v.string()),           // Salt für PBKDF2 (Passwort-Ableitung)
    vaultIv: v.optional(v.string()),             // Initialisierungsvektor für AES-GCM
  }).index("by_email", ["email"]),

  challenges: defineTable({
    nonce: v.string(),           // Die Zufallszahl (Challenge)
    targetUserId: v.id("users"), // Wer soll geprüft werden?
    challengerUserId: v.id("users"), // Wer prüft?
    status: v.string(),          // "pending" | "verified" | "failed"
  }),
calls: defineTable({

  callerId: v.id("users"),
  calleeId: v.id("users"),
  offer: v.optional(v.string()),      // JSON-stringified SDP offer
  answer: v.optional(v.string()),     // JSON-stringified SDP answer
  status: v.string(),                 // "pending", "connected", "ended"
  createdAt: v.number(),
}).index("by_callee", ["calleeId"]),

});