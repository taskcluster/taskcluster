
const assume = require('assume');
const errors = require('../lib/errors');
const {WMObject} = require('../lib/object');

suite('WMObject', () => {
  test('should be creatable', () => {
    const actual = new WMObject({id: 'wm-1'});
    assume(actual).has.property('id', 'wm-1');
    assume(actual.__proto__).has.property('_throw');
  });

  test('should throw with a bad id', () => {
    assume(() => {
      new WMObject();
    }).throws(errors.InvalidIdentifier);
  });

  test('should throw with a no id', () => {
    assume(() => {
      new WMObject({});
    }).throws(errors.InvalidIdentifier);
  });

  test('should throw with a options', () => {
    assume(() => {
      new WMObject({});
    }).throws(errors.InvalidIdentifier);
  });

  // Yes, we could externally call the ._throw() method directly on WMObject,
  // but we don't care about that.  We care that derived classes of WMObject
  // have a few specific characteristics.
  suite('._throw()', () => {
    test('should throw UnknownError with no args', () => {
      class TestObject extends WMObject {
        throwIt() {
          this._throw();
        }
      }

      const obj = new TestObject({id: 'to-1'});
      try {
        obj.throwIt();
      } catch (err) {
        assume(err).is.instanceof(Error);
        assume(err).is.instanceof(errors.UnknownError);
        assume(err).has.property('code', errors.UnknownError.name);
        assume(err).has.property('id', 'to-1');
        assume(err).has.property('fromType', 'TestObject');
        assume(err).has.property('message', errors.UnknownError.name);
      }
    });
  
    test('should throw correct code', () => {
      class TestObject extends WMObject {
        throwIt() {
          this._throw(errors.InvalidSatisfiers);
        }
      }

      const obj = new TestObject({id: 'to-1'});
      try {
        obj.throwIt();
      } catch (err) {
        assume(err).is.instanceof(errors.InvalidSatisfiers);
        assume(err).has.property('code', errors.InvalidSatisfiers.name);
        assume(err).has.property('message', errors.InvalidSatisfiers.name);
      }
    });

    test('should throw correct msg', () => {
      class TestObject extends WMObject {
        throwIt() {
          this._throw(errors.InvalidSatisfiers, 'test-message');
        }
      }

      const obj = new TestObject({id: 'to-1'});
      try {
        obj.throwIt(errors.InvalidSatisfiers, 'test-message');
      } catch (err) {
        assume(err).is.instanceof(errors.InvalidSatisfiers);
        assume(err).has.property('message', `${errors.InvalidSatisfiers.name}: test-message`);
      }
    });

    test('should throw correct msg', () => {
      class TestObject extends WMObject {
        throwIt() {
          this._throw(errors.InvalidSatisfiers, 'test-message', {a:1});
        }
      }

      const obj = new TestObject({id: 'to-1'});
      try {
        obj.throwIt(errors.InvalidSatisfiers, 'test-message');
      } catch (err) {
        assume(err).is.instanceof(errors.InvalidSatisfiers);
        assume(err).has.property('message', `${errors.InvalidSatisfiers.name}: test-message`);
        assume(err).has.property('a', 1);
      }
    });
  });
});
