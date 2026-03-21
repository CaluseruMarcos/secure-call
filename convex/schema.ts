import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
  }).index("by_email", ["email"]),

  // Jeder Nutzer kann mehrere Geräte haben, jedes mit eigenem Public Key
  devices: defineTable({
    userId: v.id("users"),
    deviceId: v.string(), // UUID aus localStorage
    publicKey: v.string(), // JWK-exportierter ECDSA Public Key
    deviceName: v.optional(v.string()), // z.B. "Chrome auf Windows"
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_device", ["userId", "deviceId"]),

  calls: defineTable({
    callerId: v.id("users"),
    calleeId: v.id("users"),
    offer: v.optional(v.string()),
    answer: v.optional(v.string()),
    status: v.string(), // "pending" | "accepted" | "connected" | "ended" | "rejected"
    createdAt: v.number(),
  }).index("by_callee", ["calleeId"]),

  iceCandidates: defineTable({
    callId: v.id("calls"),
    senderId: v.id("users"),
    candidate: v.string(),
    createdAt: v.number(),
  }).index("by_call", ["callId"]),
});
