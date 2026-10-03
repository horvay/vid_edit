import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// A shape drawn on a paused frame. Points are flat [x0, y0, x1, y1, ...] in
// 0..1 of the video frame, so they line up at any player size.
export const shape = v.object({
  tool: v.union(v.literal("pen"), v.literal("arrow"), v.literal("rect")),
  color: v.string(),
  points: v.array(v.number()),
});

// What the media server reports about an uploaded file (see media/server.ts).
export const fileInfo = {
  fileId: v.string(),
  fileName: v.string(),
  size: v.number(),
  duration: v.number(),
  width: v.number(),
  height: v.number(),
  fps: v.number(),
};

export default defineSchema({
  users: defineTable({
    name: v.string(),
    color: v.string(),
  }),

  videos: defineTable({
    title: v.string(),
    createdBy: v.id("users"),
    updatedAt: v.number(),
    trashed: v.boolean(),
    // Denormalized from the newest version, for the home grid.
    latestVersion: v.number(),
    latestFileId: v.string(),
    latestDuration: v.number(),
  }).index("by_trashed_updated", ["trashed", "updatedAt"]),

  versions: defineTable({
    videoId: v.id("videos"),
    number: v.number(),
    uploadedBy: v.id("users"),
    ...fileInfo,
  }).index("by_video", ["videoId", "number"]),

  comments: defineTable({
    videoId: v.id("videos"),
    versionId: v.id("versions"),
    authorId: v.id("users"),
    body: v.string(),
    // Replies have a parent and inherit its time; only top-level notes have one.
    parentId: v.optional(v.id("comments")),
    time: v.optional(v.number()),
    endTime: v.optional(v.number()),
    drawing: v.optional(v.array(shape)),
    resolved: v.boolean(),
    resolvedBy: v.optional(v.id("users")),
    editedAt: v.optional(v.number()),
  })
    .index("by_version", ["versionId"])
    .index("by_video", ["videoId"]),
});
