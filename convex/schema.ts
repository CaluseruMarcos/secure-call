// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables, // Erstellt automatisch alle Tabellen, die Auth braucht
  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    publicKey: v.optional(v.string()), 
  }).index("by_email", ["email"]),

  challenges: defineTable({
    nonce: v.string(), 
    userId: v.id("users"),
    status: v.string(), // "pending", "verified", "failed"
  }),
});