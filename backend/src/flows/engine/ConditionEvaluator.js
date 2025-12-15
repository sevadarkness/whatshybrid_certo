const { CONDITION_OPERATORS } = require('../constants/flowConstants');

class ConditionEvaluator {
  constructor(contextManager) {
    this.context = contextManager;
  }

  evaluate(group) {
    const logic = group?.logic || 'and';
    const rules = group?.rules || [];
    if (!rules.length) return { result: true, details: [] };

    const details = [];
    const results = [];

    for (const rule of rules) {
      if (rule && rule.logic && Array.isArray(rule.rules)) {
        const nested = this.evaluate(rule);
        results.push(nested.result);
        details.push({ type: 'group', logic: rule.logic, result: nested.result, details: nested.details });
      } else {
        const rr = this.evaluateRule(rule);
        results.push(rr.result);
        details.push(rr);
      }
    }

    const finalResult = logic === 'and' ? results.every(Boolean) : results.some(Boolean);
    return { result: finalResult, logic, details };
  }

  evaluateRule(rule) {
    const field = rule?.field;
    const operator = rule?.operator;
    const expected = rule?.value;

    const actual = this.context.get(field);

    const base = { field, operator, expected, actual, result: false };

    try {
      base.result = this.compare(actual, operator, expected);
    } catch (e) {
      base.error = e.message;
      base.result = false;
    }

    return base;
  }

  compare(actual, operator, expected) {
    switch (operator) {
      case CONDITION_OPERATORS.EQUALS:
        return this.equals(actual, expected);
      case CONDITION_OPERATORS.NOT_EQUALS:
        return !this.equals(actual, expected);
      case CONDITION_OPERATORS.CONTAINS:
        return this.contains(actual, expected);
      case CONDITION_OPERATORS.NOT_CONTAINS:
        return !this.contains(actual, expected);
      case CONDITION_OPERATORS.STARTS_WITH:
        return typeof actual === 'string' && String(actual).toLowerCase().trim().startsWith(String(expected).toLowerCase().trim());
      case CONDITION_OPERATORS.ENDS_WITH:
        return typeof actual === 'string' && String(actual).toLowerCase().trim().endsWith(String(expected).toLowerCase().trim());
      case CONDITION_OPERATORS.GREATER_THAN:
        return Number(actual) > Number(expected);
      case CONDITION_OPERATORS.LESS_THAN:
        return Number(actual) < Number(expected);
      case CONDITION_OPERATORS.GREATER_OR_EQUAL:
        return Number(actual) >= Number(expected);
      case CONDITION_OPERATORS.LESS_OR_EQUAL:
        return Number(actual) <= Number(expected);
      case CONDITION_OPERATORS.IS_EMPTY:
        return this.isEmpty(actual);
      case CONDITION_OPERATORS.IS_NOT_EMPTY:
        return !this.isEmpty(actual);
      case CONDITION_OPERATORS.MATCHES_REGEX:
        return this.matchesRegex(actual, expected);
      case CONDITION_OPERATORS.IN_LIST:
        return this.inList(actual, expected);
      case CONDITION_OPERATORS.NOT_IN_LIST:
        return !this.inList(actual, expected);
      default:
        throw new Error(`Unknown operator: ${operator}`);
    }
  }

  equals(actual, expected) {
    if (actual === expected) return true;

    if (typeof actual === 'string' && typeof expected === 'string') {
      return actual.toLowerCase().trim() === expected.toLowerCase().trim();
    }

    if (Array.isArray(actual) && Array.isArray(expected)) {
      if (actual.length !== expected.length) return false;
      return actual.every((v, i) => this.equals(v, expected[i]));
    }

    return false;
  }

  contains(actual, expected) {
    if (actual === null || actual === undefined) return false;

    if (typeof actual === 'string') {
      return actual.toLowerCase().includes(String(expected).toLowerCase());
    }

    if (Array.isArray(actual)) {
      return actual.some((x) => this.equals(x, expected));
    }

    if (typeof actual === 'object') {
      return Object.prototype.hasOwnProperty.call(actual, String(expected));
    }

    return false;
  }

  isEmpty(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
  }

  matchesRegex(actual, pattern) {
    if (typeof actual !== 'string') return false;
    const re = new RegExp(String(pattern), 'i');
    return re.test(actual);
  }

  inList(actual, list) {
    let arr = list;

    if (!Array.isArray(arr)) {
      if (typeof arr === 'string') {
        try {
          arr = JSON.parse(arr);
        } catch {
          arr = arr.split(',').map((s) => s.trim());
        }
      } else {
        return false;
      }
    }

    return arr.some((x) => this.equals(actual, x));
  }
}

module.exports = ConditionEvaluator;