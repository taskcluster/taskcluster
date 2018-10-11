
const sinon = require('sinon');
const assume = require('assume');

const errors = require('../lib/errors');
const {Ruleset, Rule, Conditions, assign} = require('../lib/rules');

suite('assign()', () => {
  test('should be able to assign an empty object', () => {
    let expected = {a: 1, b: true, c: 'john'};
    let actual = {};

    assign(actual, expected);
    assume(actual).deeply.equals(expected);
  });

  test('should be able to overwrite non-nested properties in an object', () => {
    let expected = {a: 1, b: true, c: 'john'};
    let actual = {a: 2, b: false, c: 'notjohn'};

    assign(actual, expected);
    assume(actual).deeply.equals(expected);
  });

  test('should be able to overwrite nested properties in an object', () => {
    let expected = {a: 1, b: {c: {d: 2}}};
    let actual = {a: 1, b: {c: {d: 3}}};

    assign(actual, expected);
    assume(actual).deeply.equals(expected);
  });

  test('should be able to overwrite non-object property with object', () => {
    let expected = {a: 1, b: {c: {d: 2}}};
    let actual = {a: 1, b: {c: 3}};

    assign(actual, expected);
    assume(actual).deeply.equals(expected);
  });

  test('should be able to create non-existing object', () => {
    let expected = {a: 1, b: {c: {d: 2}}};
    let actual = {};

    assign(actual, expected);
    assume(actual).deeply.equals(expected);
  });

  test('should be able to delete properties in an object', () => {
    let expected = {a:1};
    let actual = {a:1, b:2};

    assign(actual, {b: null});
    assume(actual).deeply.equals(expected);
  });

  test('should throw for a function property', () => {
    assume(() => {
      assign({}, {a: () => {}});
    }).throws(errors.InvalidValues);
  });

});

suite('Conditions', () => {
  let nullCondition = new Conditions(null);
  suite('_compare()', () => {
    test('should return true', () => {
      assume(nullCondition._compare('string', 'string')).is.ok();
    });
    test('should return false', () => {
      assume(nullCondition._compare('string', 'string')).is.ok();
    });
  });

  suite('_evaluateCondition()', () => {
    test('should return true when a single string satisifies requirement', () => {
      let conditions = new Conditions({
        string: 'test',
      });
      assume(conditions.evaluate({string: 'test'})).is.ok();
    });
    
    test('should return true when one of many string satisifies requirement', () => {
      let conditions = new Conditions({
        string: ['abc', 'test', 'def'],
      });
      assume(conditions.evaluate({string: 'test'})).is.ok();
    });

    test('should return false when a single string does not satisfy requirement', () => {
      let conditions = new Conditions({
        string: 'nottest',
      });
      assume(conditions.evaluate({string: 'test'})).is.not.ok();
    });
    
    test('should return false when none of many string satisifies requirement', () => {
      let conditions = new Conditions({
        string: ['abc', 'def'],
      });
      assume(conditions.evaluate({string: 'test'})).is.not.ok();
    });
  });

  suite('evaluate()', () => {
    test('should return true when condition is null', () => {
      let conditions = new Conditions(null);
      assume(conditions.evaluate()).is.ok();
    });

    test('should throw when satisfiers is not object', () => {
      let conditions = new Conditions({string: 'test'});
      assume(() => {
        conditions.evaluate(() => {});
      }).throws(errors.InvalidSatisfiers);
    });

    test('should evaluate false with a missing condition', () => {
      let conditions = new Conditions({string: 'test'});
      assume(conditions.evaluate({other: 'test'})).is.not.ok();
    });

    test('should return true when all requirements are met', () => {
      let conditions = new Conditions({string: 'test'});
      assume(conditions.evaluate({string: 'test'})).is.ok();
    });

    test('should return false when not all requirements are met', () => {
      let conditions = new Conditions({string: 'test'});
      assume(conditions.evaluate({string: 'not-test'})).is.not.ok();
    });
  });

  suite('invalid input', () => {
    test('should not allow a non-string condition', () => {
      assume(() => {
        new Conditions({
          property: () => {},
        });
      }).throws(errors.InvalidConditions);
    });

    test('should not allow a non-string condition in a list', () => {
      assume(() => {
        new Conditions({
          property: [() => {}],
        });
      }).throws(errors.InvalidConditions);
    });
  });
});

suite('Rule', () => {
  suite('evaluate()', () => {
    let rule;
    let target;

    setup(() => {
      target = {
        rule1val: 'not-set',
      };
      rule = new Rule({
        id: 'rule-1',
        conditions: {
          string: 'test',
        },
        values: {
          rule1val: 'set',
        },
        description: 'test rule',
      });    
    });

    test('should return true and set values with satisfied requirements', () => {
      let outcome = rule.evaluate({string: 'test'}, target);
      assume(outcome).is.ok();
      assume(target).deeply.equals({rule1val: 'set'});
    });
    
    test('should return false and not set values with unsatisfied requirements', () => {
      let outcome = rule.evaluate({string: 'nottest'}, target);
      assume(outcome).is.not.ok();
      assume(target).deeply.equals({rule1val: 'not-set'});
    });
  });

  suite('invalid input', () => {
    test('should throw with invalid id', () => {
      assume(() => {
        new Rule({id: 123, conditions: {}, values: {}, description: ''});
      }).throws(/^id must be string/);
    });

    test('should throw with invalid conditions', () => {
      assume(() => {
        new Rule({id: 'id', conditions: 123, values: {}, description: ''});
      }).throws(/^conditions must be an object/);
    });

    test('should throw with invalid values', () => {
      assume(() => {
        new Rule({id: 'id', conditions: {}, values: 123, description: ''});
      }).throws(/^values must be an object/);
    });

    test('should throw with invalid description', () => {
      assume(() => {
        new Rule({id: 'id', conditions: {}, values: {}, description: 123});
      }).throws(/^description must be a string/);
    });
  });
});

suite('Ruleset', () => {
  
  let rules;

  setup(() => {
    rules = new Ruleset({
      rules: [{
        id: 'rule1',
        conditions: {
          workerType: 'worker1',
          provider: ['ec2', 'gcp'],
        },
        values: {
          rule1: 'matched',
        },
        description: 'worker1 in ec2 or gcp',
      }, {
        id: 'rule2',
        conditions: {
          workerType: 'worker1',
          provider: 'ec2',
        },
        values: {
          rule2: 'matched', 
        },
        description: 'worker1 in ec2 only',
      }, {
        id: 'rule3',
        conditions: {
          workerType: 'worker2',
          provider: ['ec2', 'gcp'],
        },
        values: {
          rule3: 'matched',
        },
        description: 'worker2 in ec2 or gcp',
      }, {
        id: 'rule4',
        conditions: {
          workerType: 'worker2',
          provider: 'gcp',
        },
        values: {
          rule4: 'matched',
        },
        description: 'worker2 in gcp only',
      }],
    });
  });

  test('should match worker1/ec2 correctly', () => {
    assume(rules.evaluate({workerType: 'worker1', provider: 'ec2'})).deeply.equals({
      rule1: 'matched',
      rule2: 'matched',
    });
  });

  test('should match worker1/gcp correctly', () => {
    assume(rules.evaluate({workerType: 'worker1', provider: 'ec2'})).deeply.equals({
      rule1: 'matched',
      rule2: 'matched',
    });
  });

  test('should match worker2/ec2 correctly', () => {
    assume(rules.evaluate({workerType: 'worker2', provider: 'ec2'})).deeply.equals({
      rule3: 'matched',
    });
  });
  test('should match worker2/gcp correctly', () => {
    assume(rules.evaluate({workerType: 'worker2', provider: 'gcp'})).deeply.equals({
      rule3: 'matched',
      rule4: 'matched',
    });
  });
});

suite('Required Satisfiers', () => {
  test('should be able to list required satisfiers on Conditions', () => {
    let cond = new Conditions({string1: 'abc', string2: 'def'});
    assume(cond.requiredSatisfiers()).is.array(['string1', 'string2']);
  });
  
  test('should be able to list required satisfiers on Rules', () => {
    let rule = new Rule({
      id: 'rule-1',
      conditions: {string1: 'abc', string2: 'def'},
      values: {},
      description: '',
    });
    assume(rule.requiredSatisfiers()).is.array(['string1', 'string2']);
  });
  
  test('should be able to list required satisfiers on Conditions', () => {
    let rules = new Ruleset({
      rules: [{
        id: 'rule1',
        conditions: {
          string1: 'worker1',
          string2: ['ec2', 'gcp'],
        },
        values: {},
        description: '',
      }, {
        id: 'rule2',
        conditions: {
          string2: 'worker1',
        },
        values: {},
        description: '',
      }, {
        id: 'rule3',
        conditions: {
          string3: 'worker2',
          string4: ['ec2', 'gcp'],
        },
        values: {},
        description: '',
      }, {
        id: 'rule4',
        conditions: {
          string5: 'worker2',
        },
        values: {},
        description: '',
      }],
    });
    assume(rules.requiredSatisfiers()).is.array([
      'string1',
      'string2', 
      'string3',
      'string4',
      'string5',
    ]);
  });
});
