var request = require('superagent');
require('superagent-hawk')(request);

console.log("Sending request");

request
  .get('http://localhost:5050/v1/restricted')
  .send({
    "Key": "Hello World"
  })
  .hawk({
    id:         'dfsadjfkdsjflsadfjsdfsd',
    key:        'dfsadjfkdsjflsadfjsdfsd',
    algorithm:  'sha256'
  })
  .end(function (res) {
    console.log('------------1');
    console.log('ok:', res.ok);
    console.log('body:', res.body);
  });

