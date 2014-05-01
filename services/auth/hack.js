require('superagent-hawk')(require('superagent'));
var request = require('superagent-promise');

console.log("Sending request");
request
  .get('http://localhost:5050/v1/client/zluiWOFZQomIpolQLe0GfQ/scopes')
  .hawk({
    id:   'zluiWOFZQomIpolQLe0GfQ',
    key:  'jm-Kf79yRYuPLA8VUJQzcwAmKE0FC9T8KpzH9Tc1ONiQv-G1zJq7SRSzU0pWxOd-JQ',
    algorithm:  'sha256'
  })
  .end()
  .then(function(res) {
    console.log('------------');
    if (res.ok) {
      console.log("OK");
      console.log(JSON.stringify(res.body, null, 2));
    } else {
      console.log("ERROR: " + res.status);
      console.log(res.text);
    }
  });


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
  .end()
  .then(function (res) {
    console.log('------------1');
    console.log('ok:', res.ok);
    console.log('body:', res.body);
  });

