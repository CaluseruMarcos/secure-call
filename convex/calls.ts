import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";

export const startCall = mutation({
  args: { offer: v.string() },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Nicht eingeloggt");
    return await ctx.db.insert("p2p_calls", {
      hostId: userId,
      offer: args.offer,
      status: "waiting",
    });
  },
});

export const joinCall = mutation({
  args: { callId: v.id("p2p_calls"), answer: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId, {
      answer: args.answer,
      status: "connected",
    });
  },
});

export const getCall = query({
  args: { callId: v.id("p2p_calls") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.callId);
  },
});

export const getLatestCall = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("p2p_calls").order("desc").first();
  },
});