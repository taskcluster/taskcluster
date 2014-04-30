var AWS = require('../');
var ec2 = new AWS.EC2({ region: 'us-west-2' });

ec2.describeAccountAttributes({}).promise().then(
  function(req) {
    console.log(JSON.stringify(req.data, null, 2));
  },
  function(error) {
    console.log(error);
  }
);
