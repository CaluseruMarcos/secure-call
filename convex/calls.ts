import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";
import { Id } from "./_generated/dataModel";


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
  args: { 
    callId: v.id("calls"), 
    payload: v.object({
      callerId: v.optional(v.id("users")),
      calleeId: v.optional(v.id("users")),
      offer: v.optional(v.string()),
      answer: v.optional(v.string()),
      status: v.optional(v.string()),
      createdAt: v.optional(v.number()),
    })
  },
  handler: async (ctx, args) => {
    const callerUserID = await auth.getUserId(ctx);
    if (!callerUserID) throw new Error("Nicht eingeloggt");

    const call = await ctx.db.patch(args.callId, args.payload);

    return { call };
  },
});

export const checkIfCalled = query({
  args: {},
  handler: async (ctx, args) => {
    const myUserId = await auth.getUserId(ctx);
    if (!myUserId) return null;

    const call = await ctx.db
      .query("calls")
      .withIndex("by_callee", (q) => q.eq("calleeId", myUserId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .order("desc")
      .first();

    return call;
  },
});

export const acceptCall = mutation({
  args: { callId: v.id("calls") },
  handler: async (ctx, args) => {
    const myUserId = await auth.getUserId(ctx);
    if (!myUserId) throw new Error("Nicht eingeloggt");

    const call = await ctx.db.get(args.callId);
    if (!call || call.calleeId !== myUserId) {
      throw new Error("Call nicht gefunden oder keine Berechtigung");
    }

    await ctx.db.patch(args.callId, { status: "accepted",  }); // Hier könnten wir später auch die SDP-Answer speichern
    return { success: true };
  },
});

export const rejectCall = mutation({
  args: { callId: v.id("calls") },
  handler: async (ctx, args) => {
    const myUserId = await auth.getUserId(ctx);
    if (!myUserId) throw new Error("Nicht eingeloggt");

    const call = await ctx.db.get(args.callId);
    if (!call || call.calleeId !== myUserId) {
      throw new Error("Call nicht gefunden oder keine Berechtigung");
    }

    await ctx.db.patch(args.callId, { status: "rejected" });
    return { success: true };
  },
});

export const getCallById = query({
  args: { callId: v.id("calls") },
  handler: async (ctx, args) => {
    const myUserId = await auth.getUserId(ctx);
    if (!myUserId) throw new Error("Nicht eingeloggt");

    const call = await ctx.db.get(args.callId);
    if (!call || (call.callerId !== myUserId && call.calleeId !== myUserId)) {
      throw new Error("Call nicht gefunden oder keine Berechtigung");
    }

    return call;
  },
});