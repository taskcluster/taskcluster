import { expect } from 'chai';
import { Queue } from '../src';

describe('Queue', function() {
  this.timeout(30000);

  const queue = new Queue({ rootUrl: 'https://taskcluster.net' });

  it('should be loaded', () => {
    expect(queue).to.be.ok;
  });

  it('should successfully ping', () => {
    return queue
      .ping()
      .then(({ alive }) => expect(alive).to.be.ok);
  });

  it('should successfully ping with `.use`', () => {
    return queue
      .use({authorizedScopes: []})
      .ping()
      .then(({ alive }) => expect(alive).to.be.ok);
  });
});
