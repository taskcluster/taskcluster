suite("scopeMatch", function() {
  var assert  = require('assert');
  var utils   = require('../utils.js');

  var mktest = function(scopePatterns, scopesets, matches) {
    return function() {
      var res;
      try {
        res = utils.scopeMatch(scopePatterns, scopesets);
      } catch (e) {
        res = 'exception';
      }
      assert(res == matches,
        "Incorrect result for scopeMatch(" +
        JSON.stringify(scopePatterns) +
        ", " + JSON.stringify(scopesets) + ")")
    };
  };

  test("single exact match, string",
    mktest(["foo:bar"], "foo:bar", true));
  test("single exact match, [string]",
    mktest(["foo:bar"], ["foo:bar"], true));
  test("single exact match, [[string]]",
    mktest(["foo:bar"], [["foo:bar"]], true));
  test("empty string in scopesets",
    mktest(["foo:bar"], '', false));
  test("empty [string] in scopesets",
    mktest(["foo:bar"], [''], false));
  test("empty [[string]] in scopesets",
    mktest(["foo:bar"], [['']], false));
  test("prefix",
    mktest(["foo:*"], [['foo:bar']], true));
  test("prefix with no star",
    mktest(["foo:"], [['foo:bar']], false));
  test("star but not prefix",
    mktest(["foo:bar:*"], [['bar:bing']], false));
  test("star but not prefix",
    mktest(["bar:*"], [['foo:bar:bing']], false));
  test("disjunction strings",
    mktest(["bar:*"], ['foo:x', 'bar:x'], true));
  test("disjunction [strings]",
    mktest(["bar:*"], [['foo:x'], ['bar:x']], true));
  test("conjunction",
    mktest(["bar:*", 'foo:x'], [['foo:x', 'bar:y']], true));
  test("empty pattern",
    mktest([""], [['foo:bar']], false));
  test("empty patterns",
    mktest([], [['foo:bar']], false));
  test("bare star",
    mktest(["*"], [['foo:bar', 'bar:bing']], true));
  test("empty conjunction in scopesets",
    mktest(["foo:bar"], [[]], true));
  test("non-string scopesets",
    mktest(["foo:bar"], {}, 'exception'));
  test("non-string scopeset",
    mktest(["foo:bar"], [{}], 'exception'));
  test("empty disjunction in scopesets",
    mktest(["foo:bar"], [], false));
});

