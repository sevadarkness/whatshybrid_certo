// Alias for backward-compatibility.
// Some services reference `chat/models/Conversation` while others reference
// `channel/models/Conversation`. Both should resolve to the same model.

module.exports = require('../../channel/models/Conversation');
