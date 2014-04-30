# aws-sdk-promise

Hack for adding the .promise() method to all aws-sdk request objects (aws-sdk is a peerDependency).

## How it works?

Take a look at [the source](/index.js) the short version its a terrible
hack into the AWS.Request object (which aws-sdk returns from just about
all api calls).

## Usage

```js
// AWS is identical to aws-sdk but it has .promise method on all
// requests
var AWS = require('aws-sdk-promise');
var ec2 = new AWS.EC2({ region: 'us-west-2' });

ec2.describeAccountAttributes({}).promise().then(
  function(req) {
    // the promise is resolved on the 'complete' event of request object
    console.log(JSON.stringify(req.data, null, 2));
  },
  function(error) {
    // rejected if the 'complete' event contains an error
    console.log(error);
  }
);

```

(credit https://github.com/jonasfj who may not want credit not sure)
