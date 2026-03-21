import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";

// Gerät registrieren oder Public Key aktualisieren
export const registerDevice = mutation({
  args: {
    deviceId: v.string(),
    publicKey: v.string(), // JWK-String des ECDSA Public Key
    deviceName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Nicht autorisiert");

    // Prüfen ob dieses Gerät schon registriert ist
    const existing = await ctx.db
      .query("devices")
      .withIndex("by_user_device", (q) =>
        q.eq("userId", userId).eq("deviceId", args.deviceId),
      )
      .unique();

    if (existing) {
      // Public Key aktualisieren (z.B. nach Key-Rotation)
      await ctx.db.patch(existing._id, {
        publicKey: args.publicKey,
        deviceName: args.deviceName,
      });
      return { deviceDocId: existing._id, updated: true };
    }

    // Neues Gerät registrieren
    const deviceDocId = await ctx.db.insert("devices", {
      userId,
      deviceId: args.deviceId,
      publicKey: args.publicKey,
      deviceName: args.deviceName,
      createdAt: Date.now(),
    });

    return { deviceDocId, updated: false };
  },
});

// Alle Geräte eines Nutzers abfragen
export const getDevicesByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("devices")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

// Public Key für ein bestimmtes Gerät finden (für Handshake-Verifikation)
export const getPublicKeyForDevice = query({
  args: {
    userId: v.id("users"),
    deviceId: v.string(),
  },
  handler: async (ctx, args) => {
    const device = await ctx.db
      .query("devices")
      .withIndex("by_user_device", (q) =>
        q.eq("userId", args.userId).eq("deviceId", args.deviceId),
      )
      .unique();

    if (!device) return null;
    return { publicKey: device.publicKey, deviceName: device.deviceName };
  },
});

// Prüfen ob aktuelles Gerät bereits registriert ist
export const isDeviceRegistered = query({
  args: { deviceId: v.string() },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return false;

    const device = await ctx.db
      .query("devices")
      .withIndex("by_user_device", (q) =>
        q.eq("userId", userId).eq("deviceId", args.deviceId),
      )
      .unique();

    return !!device;
  },
});
