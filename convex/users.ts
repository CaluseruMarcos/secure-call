// convex/users.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";

export const updatePublicKey = mutation({
  args: { publicKey: v.string() },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    
    if (userId === null) {
      throw new Error("Nicht autorisiert");
    }

    await ctx.db.patch(userId, {
      publicKey: args.publicKey,
    });
  },
});

export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (userId === null) return null;
    return await ctx.db.get(userId);
  },
});