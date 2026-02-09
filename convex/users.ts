import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";

export const storeVault = mutation({
  args: {
    publicKey: v.string(),
    encryptedPrivateKey: v.string(),
    vaultSalt: v.string(),
    vaultIv: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Nicht autorisiert");

    await ctx.db.patch(userId, {
      publicKey: args.publicKey,
      encryptedPrivateKey: args.encryptedPrivateKey,
      vaultSalt: args.vaultSalt,
      vaultIv: args.vaultIv,
    });
  },
});

export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;
    return await ctx.db.get(userId);
  },
});

// Weg 1: Public Key über E-Mail finden
export const getPublicKeyByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    return user?.publicKey || null;
  },
});

// Weg 2: Public Key über User-ID finden
export const getPublicKeyById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    return user?.publicKey || null;
  },
});