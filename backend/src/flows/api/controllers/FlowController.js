const Flow = require('../../models/Flow');
const { validateFlow } = require('../../schemas/flowSchema');

class FlowController {
  constructor({ eventDispatcher, cronScheduler }) {
    this.eventDispatcher = eventDispatcher;
    this.cronScheduler = cronScheduler;
  }

  async create(req, res) {
    const { valid, errors, value } = validateFlow(req.body);
    if (!valid) return res.status(400).json({ error: 'VALIDATION_ERROR', details: errors });

    const flow = new Flow({
      ...value,
      userId: req.user.id,
      workspaceId: req.user.workspaceId,
    });

    await flow.save();

    // se tiver scheduled, agenda
    if (this.cronScheduler) await this.cronScheduler.refreshFlow(flow._id);

    res.status(201).json(flow);
  }

  async list(req, res) {
    const limit = Math.min(Number(req.query.limit || 20), 100);
    const page = Math.max(Number(req.query.page || 1), 1);

    const query = { userId: req.user.id, deletedAt: null };

    if (req.query.enabled !== undefined) query.enabled = req.query.enabled === 'true';

    const [data, total] = await Promise.all([
      Flow.find(query).limit(limit).skip((page - 1) * limit).sort({ updatedAt: -1 }),
      Flow.countDocuments(query),
    ]);

    res.json({ data, meta: { total, page, pages: Math.ceil(total / limit) } });
  }

  async getById(req, res) {
    const flow = await Flow.findOne({ _id: req.params.id, userId: req.user.id, deletedAt: null });
    if (!flow) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(flow);
  }

  async update(req, res) {
    const { valid, errors, value } = validateFlow(req.body);
    if (!valid) return res.status(400).json({ error: 'VALIDATION_ERROR', details: errors });

    const flow = await Flow.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id, deletedAt: null },
      { ...value },
      { new: true }
    );

    if (!flow) return res.status(404).json({ error: 'NOT_FOUND' });

    if (this.eventDispatcher) {
      // invalida cache do dispatcher para esse user
      this.eventDispatcher.invalidateCache(String(req.user.id));
    }

    if (this.cronScheduler) await this.cronScheduler.refreshFlow(flow._id);

    res.json(flow);
  }

  async delete(req, res) {
    const flow = await Flow.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id, deletedAt: null },
      { deletedAt: new Date(), enabled: false },
      { new: true }
    );

    if (!flow) return res.status(404).json({ error: 'NOT_FOUND' });

    if (this.cronScheduler) this.cronScheduler.unscheduleFlow(flow._id);

    res.json({ success: true });
  }

  async execute(req, res) {
    const flow = await Flow.findOne({ _id: req.params.id, userId: req.user.id, deletedAt: null });
    if (!flow) return res.status(404).json({ error: 'NOT_FOUND' });

    const triggerData = req.body?.triggerData || {};
    const options = req.body?.options || {};

    const execution = await this.eventDispatcher.flowEngine.execute(flow, triggerData, {
      isTest: Boolean(options.isTest),
      ignoreSchedule: true,
    });

    res.json({ success: true, executionId: execution.executionId });
  }
}

module.exports = FlowController;