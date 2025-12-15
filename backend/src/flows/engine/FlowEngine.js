const EventEmitter = require('events');

const Flow = require('../models/Flow');
const FlowExecution = require('../models/FlowExecution');
const FlowLog = require('../models/FlowLog');

const ContextManager = require('./ContextManager');
const StepExecutor = require('./StepExecutor');
const IdGenerator = require('../utils/idGenerator');

const {
  EXECUTION_STATUS,
  STEP_STATUS,
  STEP_TYPES,
  FLOW_LIMITS,
  LOG_LEVELS,
} = require('../constants/flowConstants');

class FlowEngine extends EventEmitter {
  constructor(options = {}) {
    super();

    this.logger = options.logger || console;

    this.delayQueue = options.delayQueue || null;

    this.config = {
      maxConcurrentExecutions: options.maxConcurrentExecutions || 100,
      defaultTimeout: options.defaultTimeout || FLOW_LIMITS.MAX_EXECUTION_TIME_MS,
      enableLogs: options.enableLogs !== false,
      logLevel: options.logLevel || LOG_LEVELS.INFO,
    };

    this.actionHandlers = new Map();
    this.activeExecutions = new Map();
  }

  registerActionHandler(actionType, handler) {
    this.actionHandlers.set(actionType, handler);
    this.logger.info(`Action handler registered: ${actionType}`);
    return this;
  }

  registerActionHandlers(handlers) {
    for (const [type, fn] of Object.entries(handlers || {})) {
      this.registerActionHandler(type, fn);
    }
    return this;
  }

  async execute(flowOrId, triggerData = {}, options = {}) {
    const executionId = IdGenerator.executionId();

    let flow = null;
    let execution = null;

    const startTime = Date.now();

    try {
      flow = typeof flowOrId === 'string' ? await Flow.findById(flowOrId) : flowOrId;
      if (!flow) throw new Error(`Flow not found: ${flowOrId}`);

      await this.validateExecution(flow, triggerData, options);

      const context = this.createContext(flow, triggerData, {
        executionId,
        isTest: Boolean(options.isTest),
        isSimulation: Boolean(options.isSimulation),
      });

      execution = await this.createExecution(flow, context, triggerData, options);

      this.activeExecutions.set(executionId, {
        execution,
        flow,
        context,
        startTime,
        timeoutHandle: null,
      });

      this.emit('execution:start', { executionId, flowId: String(flow._id), context: context.toSummary() });

      await this.log(execution, LOG_LEVELS.INFO, 'Flow execution started', {
        flowName: flow.name,
        triggerType: triggerData.type,
      });

      this.setupTimeout(executionId, flow.settings.maxExecutionTime);

      await execution.start();

      await this.executeSteps(flow, execution, context, options);

      return execution;
    } catch (err) {
      this.logger.error('Flow execution failed', { executionId, flowId: flow?._id, error: err.message });

      if (execution) {
        await execution.fail(err);
        await this.log(execution, LOG_LEVELS.ERROR, `Flow execution failed: ${err.message}`, { error: { message: err.message, stack: err.stack } });
      }

      this.emit('execution:error', { executionId, error: err });
      throw err;
    } finally {
      // se entrou em delay, cleanup foi feito no scheduleDelayedResume
      if (this.activeExecutions.has(executionId)) this.cleanupExecution(executionId);
    }
  }

  async simulate(flowOrId, triggerData = {}, options = {}) {
    return this.execute(flowOrId, triggerData, { ...options, isSimulation: true, isTest: true });
  }

  async test(flowOrId, triggerData = {}, options = {}) {
    return this.execute(flowOrId, triggerData, { ...options, isTest: true });
  }

  async executeSteps(flow, execution, context, options = {}) {
    const triggerStep = flow.getStepById(flow.entryStepId);
    let currentStepId = triggerStep?.nextStepId;

    if (!currentStepId) {
      await execution.complete();
      await this.log(execution, LOG_LEVELS.INFO, 'Flow completed (no steps after trigger)');
      this.emit('execution:complete', { executionId: execution.executionId });
      await flow.incrementStats(true, execution.totalDuration || 0);
      return;
    }

    const executor = new StepExecutor({
      actionHandlers: Object.fromEntries(this.actionHandlers),
      logger: this.logger,
      isSimulation: Boolean(options.isSimulation),
    });

    while (currentStepId) {
      if (execution.status === EXECUTION_STATUS.CANCELLED) break;

      const step = flow.getStepById(currentStepId);
      if (!step) throw new Error(`Step not found: ${currentStepId}`);

      const loopCheck = execution.checkLoopLimit(currentStepId);
      if (loopCheck.exceeded) {
        await this.log(execution, LOG_LEVELS.WARN, `Loop limit exceeded for step ${currentStepId}`, loopCheck);

        if (flow.settings.continueOnError) {
          currentStepId = step.nextStepId;
          continue;
        }
        throw new Error(`Loop limit exceeded: step ${currentStepId} executed ${loopCheck.count} times`);
      }

      await this.log(execution, LOG_LEVELS.DEBUG, `Executing step: ${step.name}`, {
        stepId: step.id,
        stepType: step.type,
        actionType: step.action?.type,
      });

      const stepResult = await executor.execute(step, context, { execution });

      execution.addStepResult(stepResult);
      await execution.save();

      await this.log(
        execution,
        stepResult.status === STEP_STATUS.SUCCESS ? LOG_LEVELS.DEBUG : LOG_LEVELS.WARN,
        `Step ${stepResult.status}: ${step.name}`,
        {
          stepId: step.id,
          status: stepResult.status,
          duration: stepResult.duration,
          output: stepResult.output,
          error: stepResult.error,
        }
      );

      this.emit('step:executed', { executionId: execution.executionId, stepId: step.id, result: stepResult });

      if (stepResult.status === STEP_STATUS.FAILED) {
        if (flow.settings.continueOnError) {
          currentStepId = step.nextStepId;
          continue;
        }
        throw new Error(`Step failed: ${step.name} - ${stepResult.error?.message}`);
      }

      // executeSteps inline (mini-branch)
      if (Array.isArray(stepResult.executeSteps) && stepResult.executeSteps.length) {
        for (const sid of stepResult.executeSteps) {
          const s = flow.getStepById(sid);
          if (!s) continue;
          const r = await executor.execute(s, context, { execution, forced: true });
          execution.addStepResult(r);
          await execution.save();
        }
      }

      if (stepResult.scheduleDelay) {
        await this.scheduleDelayedResume(execution, stepResult.scheduleDelay);
        return;
      }

      if (stepResult.endFlow) break;

      currentStepId = stepResult.nextStepId;
    }

    await execution.complete(execution.result);

    await this.log(execution, LOG_LEVELS.INFO, 'Flow execution completed', {
      totalSteps: execution.stepResults.length,
      duration: execution.totalDuration,
      result: execution.result,
    });

    await flow.incrementStats(true, execution.totalDuration || 0);

    this.emit('execution:complete', { executionId: execution.executionId, result: execution.result });
  }

  async resumeExecution(executionId) {
    const execution = await FlowExecution.findOne({ executionId });
    if (!execution) return;

    if (execution.status !== EXECUTION_STATUS.WAITING_DELAY) return;

    const flow = await Flow.findById(execution.flowId);
    if (!flow) {
      await execution.fail(new Error('Flow not found'));
      return;
    }

    try {
      const context = new ContextManager(execution.context);
      context.refreshSystemTime();

      await execution.resume();

      await this.log(execution, LOG_LEVELS.INFO, 'Execution resumed after delay', {
        nextStepId: execution.currentStepId,
      });

      this.activeExecutions.set(executionId, { execution, flow, context, startTime: Date.now(), timeoutHandle: null });

      // resume from currentStepId
      const fakeTriggerStep = flow.getStepById(flow.entryStepId);
      const originalNext = fakeTriggerStep?.nextStepId;
      fakeTriggerStep.nextStepId = execution.currentStepId;

      await this.executeSteps(flow, execution, context, {});

      // restore
      if (fakeTriggerStep) fakeTriggerStep.nextStepId = originalNext;
    } catch (err) {
      await execution.fail(err);
      await this.log(execution, LOG_LEVELS.ERROR, `Resume failed: ${err.message}`);
      this.emit('execution:error', { executionId, error: err });
    } finally {
      this.cleanupExecution(executionId);
    }
  }

  async validateExecution(flow, triggerData, options) {
    if (!flow.enabled && !options.isTest) throw new Error('Flow is disabled');

    if (this.activeExecutions.size >= this.config.maxConcurrentExecutions) {
      throw new Error('Maximum concurrent executions reached');
    }

    if (!options.isTest && !options.ignoreSchedule) {
      const can = flow.canExecuteNow();
      if (!can.allowed) throw new Error(`Flow cannot execute now: ${can.reason}`);
    }

    if (triggerData?.contact?.id && !options.isTest) {
      const recent = await FlowExecution.countRecentExecutions(
        flow._id,
        triggerData.contact.id,
        flow.settings.executionWindowMinutes || 60
      );

      if (recent >= (flow.settings.maxExecutionsPerContact || FLOW_LIMITS.MAX_EXECUTIONS_PER_CONTACT_PER_HOUR)) {
        throw new Error(`Contact execution limit reached: ${recent}/${flow.settings.maxExecutionsPerContact}`);
      }
    }
  }

  createContext(flow, triggerData, executionInfo) {
    return new ContextManager({
      contact: triggerData.contact || {},
      message: triggerData.message || {},
      campaign: triggerData.campaign || {},
      trigger: {
        type: triggerData.type,
        matchedKeyword: triggerData.matchedKeyword,
        matchedConditions: triggerData.matchedConditions,
      },
      variables: { ...(flow.variables || {}) },
      execution: {
        id: executionInfo.executionId,
        flowId: String(flow._id),
        flowName: flow.name,
        startedAt: new Date(),
        isTest: executionInfo.isTest,
        isSimulation: executionInfo.isSimulation,
      },
    });
  }

  async createExecution(flow, context, triggerData, options) {
    const execution = new FlowExecution({
      executionId: context.get('execution.id'),
      flowId: flow._id,
      flowName: flow.name,
      flowVersion: flow.version,
      userId: flow.userId,
      workspaceId: flow.workspaceId,

      contactId: triggerData.contact?.id,
      status: EXECUTION_STATUS.PENDING,
      isTest: Boolean(options.isTest),
      isSimulation: Boolean(options.isSimulation),

      context: context.toJSON(),

      trigger: {
        type: triggerData.type,
        stepId: flow.entryStepId,
        matchedKeyword: triggerData.matchedKeyword,
        matchedConditions: triggerData.matchedConditions,
      },

      priority: flow.settings.priority || 5,
    });

    await execution.save();
    return execution;
  }

  setupTimeout(executionId, timeoutMs) {
    const active = this.activeExecutions.get(executionId);
    if (!active) return;

    const ms = timeoutMs || this.config.defaultTimeout;

    active.timeoutHandle = setTimeout(async () => {
      const cur = this.activeExecutions.get(executionId);
      if (!cur) return;

      if (cur.execution.isRunning) {
        await cur.execution.timeout();
        await this.log(cur.execution, LOG_LEVELS.ERROR, 'Execution timeout');
        this.emit('execution:timeout', { executionId });
      }
      this.cleanupExecution(executionId);
    }, ms);
  }

  async scheduleDelayedResume(execution, delayConfig) {
    await execution.waitForDelay(delayConfig.resumeAt, delayConfig.nextStepId);

    await this.log(execution, LOG_LEVELS.INFO, 'Execution paused for delay', {
      resumeAt: delayConfig.resumeAt,
      delayMs: delayConfig.delayMs,
    });

    if (this.delayQueue?.add) {
      // bull: queue.add(name, data, opts) ou queue.add(data, opts)
      try {
        await this.delayQueue.add(
          'resume-execution',
          { executionId: execution.executionId },
          { delay: delayConfig.delayMs }
        );
      } catch {
        // fallback: no-op
      }
    }

    this.emit('execution:delayed', { executionId: execution.executionId, resumeAt: delayConfig.resumeAt });

    this.cleanupExecution(execution.executionId);
  }

  cleanupExecution(executionId) {
    const active = this.activeExecutions.get(executionId);
    if (active?.timeoutHandle) clearTimeout(active.timeoutHandle);
    this.activeExecutions.delete(executionId);
  }

  async log(execution, level, message, data = {}) {
    if (!this.config.enableLogs) return;

    const levels = [LOG_LEVELS.DEBUG, LOG_LEVELS.INFO, LOG_LEVELS.WARN, LOG_LEVELS.ERROR];
    if (levels.indexOf(level) < levels.indexOf(this.config.logLevel)) return;

    try {
      await FlowLog.log(execution.executionId, level, message, {
        flowId: execution.flowId,
        userId: execution.userId,
        workspaceId: execution.workspaceId,
        stepId: data.stepId,
        stepName: data.stepName,
        actionType: data.actionType,
        data,
        executionStartTime: execution.startedAt?.getTime(),
      });
    } catch (e) {
      this.logger.error('Failed to create flow log', { error: e.message });
    }
  }
}

module.exports = FlowEngine;