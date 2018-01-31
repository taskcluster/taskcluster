/**
Stub for the aws metadata server.
*/

const koa = require('koa');
const slugid = require('slugid');

let app = koa();

const PREFIX = '/latest';
const PROVISIONER_BASE_URL = 'https://taskcluster-aws-provisioner2.herokuapp.com/v1';

function route(context) {
  let path = context.url;

  if (path.indexOf(PREFIX) === 0) {
    path = path.slice(PREFIX.length);
  }

  switch (path) {
  case '/generate-secrets': {
    context.app.secretToken = slugid.v4();
    context.app.provisionerBaseUrl = PROVISIONER_BASE_URL;
    let payload = JSON.stringify({
      url: PROVISIONER_BASE_URL,
      token: context.app.secretToken
    });
    return payload;
  }
  case '/meta-data/public-hostname':
    return 'publichost';
  case '/meta-data/public-ipv4':
    return '22.33.44.252';
  case '/meta-data/local-ipv4':
    return '169.254.1.2';
  case '/user-data':
    return new Buffer(JSON.stringify({
      capacity: 1,
      provisionerBaseUrl: context.app.provisionerBaseUrl,
      securityToken: context.app.secretToken,
      workerType: 'ami-333333',
      provisionerId: 'aws-provisioner',
      data: {
        dockerConfig: {
          allowPrivileged: true
        }
      }
    }));
  case '/meta-data/ami-id':
    return 'ami-333333';
  case '/meta-data/instance-type':
    return 'c3.xlarge';
  case '/meta-data/placement/availability-zone':
    return 'us-west-2d';
  case '/meta-data/instance-id':
    return 'i-123456';
  default:
    throw new Error('unknown path: ' + path);
  }
}

module.exports = app.use(() => {
  let data = route(this);
  this.body = data;
});

