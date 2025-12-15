class WebhookController {
  constructor({ eventDispatcher }) {
    this.eventDispatcher = eventDispatcher;
  }

  async handle(req, res) {
    const webhookId = req.params.webhookId;
    const payload = req.body;
    const headers = req.headers;

    const userId = req.query.userId; // ou resolva via token/assinatura
    if (!userId) return res.status(400).json({ error: 'userId_required' });

    await this.eventDispatcher.dispatch('webhook:received', {
      webhookId,
      payload,
      headers,
      userId,
      contact: req.body?.contact || null,
    });

    res.json({ received: true });
  }
}

module.exports = WebhookController;