import { expect } from 'chai';
import { Queue } from '../src';
import helper from './helper';

helper.describe('Queue', () => {
  let queue;
  beforeAll(() => {
    queue = new Queue({ rootUrl: helper.rootUrl });
  });

  it('should be loaded', () => {
    expect(queue).to.be.ok;
  });

  it('should successfully ping', () => {
    return queue.ping().then(({ alive }) => expect(alive).to.be.ok);
  });

  it('should successfully ping with `.use`', () => {
    return queue
      .use({ authorizedScopes: [] })
      .ping()
      .then(({ alive }) => expect(alive).to.be.ok);
  });

  it('should handle a 404 correctly', () => {
    return queue
      .task('uTOskJejRr-DFMqUB_bpLw')
      .then(() => {
        throw new Error('expected an error');
      })
      .catch(err => {
        expect(err.response).to.be.ok;
        expect(err.response.status).to.equal(404);
      });
  });
});
