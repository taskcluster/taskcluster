'use strict';

const errors = require('./errors');
const {WMObject} = require('./object');

/**
 * Conditions encapsulate how a set of conditions are evaluated.  Conditions
 * are objects which map condition name (e.g. workerType) to either an
 * acceptable value (e.g. 'worker1') or to a list of acceptable values (e.g.
 * ['worker1', 'worker2']).  Conditions are evaluated against a set of
 * satisfiers, which is an object which maps condition name to value.  In the
 * case of a list of acceptable values, if any acceptable value matches, the
 * condition is considered satisfied
 */
class Conditions extends WMObject {

  /**
   * Construct a Conditions class given an object representation of a
   * conditions class and the rule to which the conditions belong
   */
  constructor({id, conditions}) {
    super({id});

    if (conditions !== null && typeof conditions !== 'object') {
        this._throw(errors.InvalidConditions, 'conditions must be null or an object');
    }

    // Validate that every condition is either a string or a list of strings
    if (conditions) {
      for (let condition of Object.keys(conditions)) {
        if (typeof conditions[condition] !== 'string') {
          if (Array.isArray(conditions[condition])) {
            for (let aCondition of conditions[condition]) {
              if (typeof aCondition !== 'string') {
                this._throw(errors.InvalidConditions, `condition ${condition} ${aCondition} must be string`);
              }
            }
          } else {
            this._throw(errors.InvalidConditions, `condition ${condition} must be a string or list of strings`);
          }
        }
      }
    }

    this.conditions = conditions;
  }

  /**
   * Compare the specified value to the required value.  This is its own
   * function to make it easier to replace the comparison system, e.g.
   * switching from globbing to regular expressions
   *
   * Return true if the value satisfies the specification
   */
  _compare(condition, satisfier) {
    return condition === satisfier;
  }

  // Evaluate a specific condition of the conditions against the value
  // provided.  It is important that a missing satisfier results in the condition
  // being unmet instead of throwing an error
  _evaluateCondition(condition, satisfier) {
    if (typeof condition === 'string') {
      return this._compare(condition, satisfier);
    }

    // condition can be a single item or a list which makes naming icky. Think
    // as if this were "let condition of conditions"
    for (let aCondition of condition) {
      if (this._compare(aCondition, satisfier)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Evaluate all provided conditions.  Return true if the conditions are
   * satisfied or false if any condition is not satisified
   */
  evaluate(satisfiers) {
    if (this.conditions === null) {
      return true;
    }

    if (typeof satisfiers !== 'object') {
      this._throw(errors.InvalidSatisfiers);
    }

    for (let condition of Object.keys(this.conditions)) {
      if (!this._evaluateCondition(this.conditions[condition], satisfiers[condition])) {
        return false;
      }
    }

    return true;
  }

  /**
   * Return a list of satisfier keys which are required to evaluate this
   * ruleset
   */
  requiredSatisfiers() {
    if (!this.conditions) {
      return [];
    }
    return Object.keys(this.conditions);
  }
}

/**
 * Rule encapsulates how a rule is to be evaluated.
 */
class Rule extends WMObject {
  constructor({id, conditions, values, description}) {
    super({id});

    if (typeof conditions !== 'object') {
      this._throw(errors.InvalidConditions, 'conditions must be an object');
    }
    this.conditions = new Conditions({id: `${id}_conditions`, conditions});

    if (typeof values !== 'object') {
      this._throw(errors.InvalidValues, 'values must be an object');
    }
    this.values = values;

    if (typeof description !== 'string') {
      this._throw(errors.InvalidRules, 'description must be a string');
    }
  }

  /**
   * Evaluate a rule's conditions against provided condition satisfiers and if
   * the conditions are satisfied, set the rule's values to the provided target
   * object
   */
  evaluate(satisfiers, target) {
    if (this.conditions.evaluate(satisfiers)) {
      assign(target, this.values);
      return true;
    }
    return false;
  }

  /**
   * Return a list of satisfier keys which are required to evaluate this
   * ruleset
   */
  requiredSatisfiers() {
    return this.conditions.requiredSatisfiers();
  }
}

/**
 * Assign into the target object, the properties from the values object.
 * Assignments are nested, so if values has a property 'a.b.c: 1', the target
 * will have a, a.b and a.b.c created as objects.  If property already exists
 * on the target object, it is overwritten with the new property.  If a
 * property was an object, a non-object can overwrite it and vice-versa.  If a
 * values object property is the value `null`, that property on the target
 * object is deleted
 */
function assign (target, values) {
  function assignProperty(target, targetProperty, value) {
    if (value === null) {
      delete target[targetProperty];
    } else if (['string', 'number', 'boolean'].includes(typeof value)) {
      target[targetProperty] = value;
    } else if (Array.isArray(value)) {
      target[targetProperty] = value.slice();
    } else if (typeof value === 'object') {
      if (typeof target[targetProperty] !== 'object') {
        target[targetProperty] = {};
      }
      for (let valueProperty of Object.keys(value)) {
        assignProperty(target[targetProperty], valueProperty, value[valueProperty]);
      }
    } else {
      throw new errors.InvalidValues('Only null, string, number, boolean and objects are supported');
    }
  }

  for (let property of Object.keys(values)) {
    assignProperty(target, property, values[property]);
  }
}

/**
 * Ruleset represents all rules as well as an interface to evaluate them
 * against a set of condition satisfiers.
 */
class Ruleset extends WMObject {
  constructor({id, rules}) {
    super({id});
    if (!Array.isArray(rules)) {
      this._throw(errors.InvalidRules);
    }

    // We're going to slightly change the rule id to append the ruleset id.
    // This should hopefully result in error messages where the ID property can
    // be used to trace back exactly where the error originates from without
    // needing a stack and code.  This should result in something like
    // gecko-3-b-linux_rule-1_conditions, which combined with an error code of
    // "InvalidSatisfiers" should give a pretty good idea of what went wrong
    // without needing to look at the source
    this.rules = rules.map(({id: ruleId, conditions, values, description}) => new Rule({
      id: `${id}_${ruleId}`,
      conditions,
      values,
      description,
    }));
  }

  /**
   * Given a set of condition satisfiers, return the values set according to
   * the rules.  A condition satisfier is an object which maps condition name
   * to a string value to compare against.  For information about how
   * Conditions work, see the Conditions class.
   *
   * Returns an object which is built from all the values in each rule.
   */
  evaluate(satisfiers) {
    let target = {};
    for (let rule of this.rules) {
      rule.evaluate(satisfiers, target);
    }
    return target;
  }

  /**
   * Return a list of satisfier keys which are required to evaluate this
   * ruleset
   */
  requiredSatisfiers() {
    let requiredSatisfiers = [];
    for (let rule of this.rules) {
      for (let requiredSatisfier of rule.requiredSatisfiers()) {
        if (!requiredSatisfiers.includes(requiredSatisfier)) {
          requiredSatisfiers.push(requiredSatisfier);
        }
      }
    }
    return requiredSatisfiers;
  }

}

module.exports = {
  Conditions,
  Rule,
  Ruleset,
  assign,
}
