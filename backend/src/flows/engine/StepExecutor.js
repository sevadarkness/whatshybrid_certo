const {
  ACTION_TYPES,
  STEP_STATUS,
  DELAY_UNITS,
  FLOW_LIMITS,
} = require('../constants/flowConstants');

const ConditionEvaluator = require('./ConditionEvaluator');

class StepExecutor {
  constructor(options = {}) {
    this.actionHandlers = options.actionHandlers || {};
    this.logger = options.logger || console;
    this.isSimulation = Boolean(options.isSimulation);
  }

  registerHandler(actionType, handler) {
    this.actionHandlers[actionType] = handler;
    return this;
  }

  async execute(step, context, options = {}) {
    const start = Date.now();

    const result = {
      stepId: step.id,
      stepName: step.name,
      stepType: step.type,
      actionType: step.action?.type,
      status: STEP_STATUS.PENDING,
      startedAt: new Date(),
      input: null,
      output: null,
      error: null,
      nextStepId: step.nextStepId,
      conditionResult: null,
      conditionBranch: null,
      executeSteps: null,
      scheduleDelay: null,
      endFlow: false,
    };

    try {
      if (!step.enabled) {
        result.status = STEP_STATUS.SKIPPED;
        result.output = { reason: 'step_disabled' };
        result.completedAt = new Date();
        result.duration = Date.now() - start;
        return result;
      }

      if (!step.action) throw new Error(`Step ${step.id} has no action`);

      // parse templates
      result.input = context.parseObject(step.action.config || {});

      switch (step.action.type) {
        case ACTION_TYPES.CONDITION:
          await this.execCondition(step, context, result);
          break;

        case ACTION_TYPES.WAIT_DELAY:
          await this.execDelay(step, context, result);
          break;

        case ACTION_TYPES.SET_VARIABLE:
          await this.execSetVariable(step, context, result);
          break;

        case ACTION_TYPES.GO_TO_STEP:
          await this.execGoto(step, context, result);
          break;

        case ACTION_TYPES.END_FLOW:
          await this.execEnd(step, context, result);
          break;

        default:
          await this.execHandler(step, context, result, options);
          break;
      }

      if (result.status === STEP_STATUS.PENDING) result.status = STEP_STATUS.SUCCESS;
    } catch (err) {
      result.status = STEP_STATUS.FAILED;
      result.error = {
        message: err.message || String(err),
        code: err.code,
        stack: err.stack,
        retryable: this.isRetryableError(err),
      };
      this.logger.error(`Step failed: ${step.id}`, { error: result.error.message });
    }

    result.completedAt = new Date();
    result.duration = Date.now() - start;
    return result;
  }

  async execCondition(step, context, result) {
    const cfg = step.action.config;
    const evaluator = new ConditionEvaluator(context);
    const evaluation = evaluator.evaluate(cfg.conditions);

    result.conditionResult = evaluation.result;
    result.output = { evaluation, branch: evaluation.result ? 'true' : 'false' };

    if (evaluation.result) {
      result.conditionBranch = 'true';
      if (cfg.onTrue?.goToStep) result.nextStepId = cfg.onTrue.goToStep;
      else if (cfg.onTrue?.executeSteps?.length) result.executeSteps = cfg.onTrue.executeSteps;
    } else {
      result.conditionBranch = 'false';
      if (cfg.onFalse?.endFlow) {
        result.endFlow = true;
        result.nextStepId = null;
      } else if (cfg.onFalse?.goToStep) result.nextStepId = cfg.onFalse.goToStep;
      else if (cfg.onFalse?.executeSteps?.length) result.executeSteps = cfg.onFalse.executeSteps;
    }

    result.status = STEP_STATUS.SUCCESS;
  }

  async execDelay(step, _context, result) {
    const cfg = step.action.config;
    const ms = this.delayMs(cfg.duration, cfg.unit);
    const maxMs = (cfg.maxWaitSeconds ? Number(cfg.maxWaitSeconds) : FLOW_LIMITS.MAX_DELAY_DAYS * 24 * 3600) * 1000;
    const finalMs = Math.min(ms, maxMs);

    const resumeAt = new Date(Date.now() + finalMs);
    result.output = { delayMs: finalMs, resumeAt };

    if (this.isSimulation) {
      result.output.simulated = true;
      result.status = STEP_STATUS.SUCCESS;
      return;
    }

    // pequenos delays inline; longos viram scheduleDelay
    if (finalMs <= 5000) {
      await new Promise((r) => setTimeout(r, finalMs));
      result.status = STEP_STATUS.SUCCESS;
      return;
    }

    result.status = STEP_STATUS.WAITING;
    result.scheduleDelay = { delayMs: finalMs, resumeAt, nextStepId: step.nextStepId };
  }

  async execSetVariable(step, context, result) {
    const cfg = step.action.config;
    let v = cfg.value;
    if (typeof v === 'string') v = context.parseTemplate(v);

    context.setVariable(cfg.variableName, v);

    result.output = { variableName: cfg.variableName, value: v, scope: cfg.scope || 'execution' };
    result.status = STEP_STATUS.SUCCESS;
  }

  async execGoto(step, _context, result) {
    const cfg = step.action.config;
    result.nextStepId = cfg.stepId;
    result.output = { targetStepId: cfg.stepId, maxJumps: cfg.maxJumps };
    result.status = STEP_STATUS.SUCCESS;
  }

  async execEnd(step, _context, result) {
    const cfg = step.action.config || {};
    result.endFlow = true;
    result.nextStepId = null;
    result.output = { reason: cfg.reason || 'ended', status: cfg.status || 'completed' };
    result.status = STEP_STATUS.SUCCESS;
  }

  async execHandler(step, context, result, options = {}) {
    const actionType = step.action.type;
    const handler = this.actionHandlers[actionType];
    if (!handler) throw new Error(`No handler registered for action type: ${actionType}`);

    if (this.isSimulation) {
      result.output = { simulated: true, wouldExecute: actionType, config: result.input };
      result.status = STEP_STATUS.SUCCESS;
      return;
    }

    const handlerResult = await handler(result.input, context, {
      stepId: step.id,
      timeout: step.timeout || FLOW_LIMITS.MAX_WEBHOOK_TIMEOUT_MS,
      ...options,
    });

    result.output = handlerResult;
    context.setActionResult(actionType, handlerResult);
  }

  delayMs(duration, unit) {
    const m = {
      [DELAY_UNITS.SECONDS]: 1000,
      [DELAY_UNITS.MINUTES]: 60 * 1000,
      [DELAY_UNITS.HOURS]: 60 * 60 * 1000,
      [DELAY_UNITS.DAYS]: 24 * 60 * 60 * 1000,
    };
    return Number(duration) * (m[unit] || 1000);
  }

  isRetryableError(err) {
    const codes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'RATE_LIMIT', 'SERVICE_UNAVAILABLE', 'NETWORK_ERROR'];
    return Boolean(codes.includes(err?.code) || String(err?.message || '').toLowerCase().includes('timeout'));
  }
}

module.exports = StepExecutor;