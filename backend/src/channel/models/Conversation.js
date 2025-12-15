/**
 * @fileoverview Minimal Conversation model
 *
 * Some analytics modules reference a Conversation model to aggregate response times,
 * assignment and status. The original .txt referenced this model but it wasn't
 * part of the base project. This implementation provides the missing model.
 */

const mongoose = require('mongoose');

const { Schema } = mongoose;

const ConversationSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    contactId: { type: Schema.Types.ObjectId, ref: 'Contact', index: true },
    channelId: { type: Schema.Types.ObjectId, ref: 'Channel', index: true },

    status: {
      type: String,
      enum: ['open', 'pending', 'closed'],
      default: 'open',
      index: true,
    },

    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', index: true },

    messageCount: { type: Number, default: 0 },
    lastMessageAt: { type: Date },

    metrics: {
      avgResponseTime: { type: Number, default: 0 },
      firstResponseTime: { type: Number, default: 0 },
      resolutionTime: { type: Number, default: 0 },
    },

    tags: { type: [String], default: [] },

    deletedAt: { type: Date, default: null, index: true },
  },
  {
    timestamps: true,
    collection: 'conversations',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

ConversationSchema.index({ workspaceId: 1, createdAt: -1 });
ConversationSchema.index({ workspaceId: 1, status: 1, createdAt: -1 });
ConversationSchema.index({ workspaceId: 1, assignedTo: 1, createdAt: -1 });

module.exports = mongoose.models.Conversation || mongoose.model('Conversation', ConversationSchema);
