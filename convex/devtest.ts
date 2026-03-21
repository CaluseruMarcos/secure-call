// ============================================================================
// devtest.ts — NUR FÜR ENTWICKLUNG / TESTING
//
// Diese Datei enthält Mutationen um Sicherheitsfeatures zu testen.
// VOR DEM DEPLOYMENT LÖSCHEN!
// ============================================================================

import { mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * TEST 1: Public Key in Convex manipulieren
 *
 * Simuliert einen Angreifer der den Public Key in der Datenbank
 * ausgetauscht hat. Der Handshake MUSS fehlschlagen, weil die
 * Signatur nicht mehr zum manipulierten Key passt.
 *
 * Verwendung: Im Browser Console:
 *   const tamper = useMutation(api.devtest.tamperPublicKey);
 *   await tamper({ userId: "...", deviceId: "..." });
 */
export const tamperPublicKey = mutation({
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

    if (!device) throw new Error("Gerät nicht gefunden");

    // Einen komplett anderen (aber gültigen) ECDSA P-256 Public Key einsetzen
    // Dieser Key gehört niemandem — er ist nur zum Testen
    const fakePublicKey = JSON.stringify({
      kty: "EC",
      crv: "P-256",
      x: "f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU",
      y: "x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0",
      ext: true,
      key_ops: ["verify"],
    });

    await ctx.db.patch(device._id, {
      publicKey: fakePublicKey,
    });

    return {
      message: `Public Key von Gerät ${args.deviceId} manipuliert! Nächster Handshake wird fehlschlagen.`,
      originalKey: device.publicKey.substring(0, 50) + "...",
    };
  },
});

/**
 * TEST 2: Public Key wiederherstellen
 *
 * Setzt den Public Key zurück. Dafür muss der User sich neu
 * registrieren (ausloggen → einloggen → BundID).
 *
 * Oder einfacher: Gerät aus der DB löschen, dann wird es beim
 * nächsten Login automatisch neu registriert.
 */
export const deleteDevice = mutation({
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

    if (!device) throw new Error("Gerät nicht gefunden");

    await ctx.db.delete(device._id);

    return {
      message: `Gerät ${args.deviceId} gelöscht. Beim nächsten Login wird ein neues Schlüsselpaar generiert.`,
    };
  },
});
