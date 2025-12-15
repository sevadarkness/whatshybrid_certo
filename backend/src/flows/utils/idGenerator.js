const crypto = require('crypto');

const IdGenerator = {
  generate(prefix = 'id') {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(6).toString('hex');
    return `${prefix}_${timestamp}_${random}`;
  },

  stepId() {
    return this.generate('step');
  },

  executionId() {
    return this.generate('exec');
  },

  logId() {
    return this.generate('log');
  },

  flowId() {
    return this.generate('flow');
  },

  isValidId(id, prefix) {
    if (!id || typeof id !== 'string') return false;
    const re = new RegExp(`^${prefix}_[a-z0-9]+_[a-f0-9]+$`);
    return re.test(id);
  },
};

module.exports = IdGenerator;
