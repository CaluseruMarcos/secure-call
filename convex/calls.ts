import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";

export const createCall = mutation({
  args: { calleeUserId: v.id("users") },
  handler: async (ctx, args) => {
    const callerUserID = await auth.getUserId(ctx);
    if (!callerUserID) throw new Error("Nicht eingeloggt");

    const call = await ctx.db.insert("calls", {
        callerId: callerUserID,
        calleeId: args.calleeUserId,
        status: "pending",
        createdAt: Date.now(),
    });

    return { call };
  },
});

export const updateCall = mutation({
  args: { calleeUserId: v.id("users") },
  handler: async (ctx, args) => {
    const callerUserID = await auth.getUserId(ctx);
    if (!callerUserID) throw new Error("Nicht eingeloggt");

    const call = await ctx.db.insert("calls", {
        callerId: callerUserID,
        calleeId: args.calleeUserId,
        status: "pending",
        createdAt: Date.now(),
    });

    return { call };
  },
});