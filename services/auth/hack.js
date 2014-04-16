


var _ = require('lodash');


var params = {
  test:   "TEST",
  id:     "my-id"
};
var template = {
  "{{test}}": [
    "id:{{id}} {{test}}",
    "{{other}}-thing"
  ]
};

console.log('---------------------------------------');
console.log("### Params:");
console.log(JSON.stringify(params, null ,2));
console.log("### Template:");
console.log(JSON.stringify(template, null ,2));

var substr = function(str) {
  return str.replace(/{{([^}]*)}}/g, function(orig, id) {
    var value = params[id];
    return value !== undefined ? value : orig;
  });
};

var substitute = function(obj) {
  if (typeof(obj) == 'string') {
    return substr(obj);
  } else if (typeof(obj) == 'object') {
    var clone = {};
    for(var k in obj) {
      clone[substr(k)] = _.cloneDeep(obj[k], substitute);
    }
    return clone;
  }
};

result = _.cloneDeep(template, substitute);


console.log("### Result");
console.log(JSON.stringify(result, null ,2));



