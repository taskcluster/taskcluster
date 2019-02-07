import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { Client } from '../src';
import reference from './reference-harness';

use(chaiAsPromised);

// This suite exercises the request and response functionality of
// a client against a fake service defined by this reference

const signed = (url) => url.includes('?') ?
  new RegExp(`^${url.replace('?', '\\?')}&bewit=(.*)`) :
  new RegExp(`^${url}\\?bewit=(.*)`);

// assert that the given promise is rejected; chai-as-promised's
// .rejected appears not to work
const assertRejected = (promise) => {
  let rejected = false;
  return promise
    .catch(() => { rejected = true; })
    .then(() => {
      if (!rejected) {
        throw new Error('expected rejection');
      }
    });
};

describe('Building URLs', function() {
  this.timeout(30000);

  const Fake = Client.create(reference);
  const client = new Fake({
    rootUrl: 'https://taskcluster.net',
    credentials: {
      // note that nothing in this suite actually verifies these, but it
      // exercises the request-signing code
      clientId: 'nobody',
      accessToken: 'nothing'
    }
  });

  it('should build URL', () => {
    expect(client.buildUrl(client.get))
      .to.equal('https://fake.taskcluster.net/v1/get-test');
  });

  it('should build signed URL', () => {
    return expect(client.buildSignedUrl(client.get))
      .to.eventually.match(signed('https://fake.taskcluster.net/v1/get-test'));
  });

  it('should build URL with parameter', () => {
    expect(client.buildUrl(client.param, 'test'))
      .to.equal('https://fake.taskcluster.net/v1/url-param/test/list');
  });

  it('should build signed URL with parameter', () => {
    return expect(client.buildSignedUrl(client.param, 'test'))
      .to.eventually.match(signed('https://fake.taskcluster.net/v1/url-param/test/list'));
  });

  it('should build URL with 2 parameters', () => {
    expect(client.buildUrl(client.param2, 'test', 'te/st'))
      .to.equal('https://fake.taskcluster.net/v1/url-param2/test/te%2Fst/list');
  });

  it('should build signed URL with 2 parameters', () => {
    return expect(client.buildSignedUrl(client.param2, 'test', 'te/st'))
      .to.eventually.match(signed('https://fake.taskcluster.net/v1/url-param2/test/te%2Fst/list'));
  });

  it('should not build URL with missing parameter', () => {
    expect(() => client.buildUrl(client.param2, 'te/st'))
      .to.throw();
  });

  it('should not build signed URL with missing parameter', () => {
    return assertRejected(client.buildSignedUrl(client.param2, 'te/st'));
  });

  it('should build URL with query options', () => {
    expect(client.buildUrl(client.query, { option: 2 }))
      .to.equal('https://fake.taskcluster.net/v1/query/test?option=2');
  });

  it('should build signed URL with query options', () => {
    return expect(client.buildSignedUrl(client.query, { option: 2 }))
      .to.eventually.match(signed('https://fake.taskcluster.net/v1/query/test?option=2'));
  });

  it('should build URL with empty query options', () => {
    expect(client.buildUrl(client.query, {}))
      .to.equal('https://fake.taskcluster.net/v1/query/test');
  });

  it('should build signed URL with empty query options', () => {
    return expect(client.buildSignedUrl(client.query, {}))
      .to.eventually.match(new RegExp('^https://fake.taskcluster.net/v1/query/test'));
  });

  it('should not build URL with incorrect query option', () => {
    expect(() => client.buildUrl(client.query, { wrongKey: 2 }))
      .to.throw();
  });

  it('should not build signed URL with incorrect query option', () => {
    return assertRejected(client.buildSignedUrl(client.query, { wrongKey: 2 }));
  });

  it('should build URL with parameter and query option', () => {
    expect(client.buildUrl(client.paramQuery, 'test', { option: 2 }))
      .to.equal('https://fake.taskcluster.net/v1/param-query/test?option=2');
  });

  it('should build signed URL with parameter and query option', () => {
    return expect(client.buildSignedUrl(client.paramQuery, 'test', { option: 2 }))
      .to.eventually.match(signed('https://fake.taskcluster.net/v1/param-query/test?option=2'));
  });

  it('should build URL with parameter and empty query options', () => {
    expect(client.buildUrl(client.paramQuery, 'test', {}))
      .to.equal('https://fake.taskcluster.net/v1/param-query/test');
  });

  it('should build signed URL with parameter and empty query options', () => {
    return expect(client.buildSignedUrl(client.paramQuery, 'test', {}))
      .to.eventually.match(signed('https://fake.taskcluster.net/v1/param-query/test'));
  });

  it('should not build URL with query options and missing parameter', () => {
    expect(() => client.buildUrl(client.paramQuery, { option: 2 }))
      .to.throw();
  });

  it('should not build signed URL with query options and missing parameter', () => {
    expect(() => client.buildUrl(client.paramQuery, { option: 2 }))
      .to.throw();
  });

  it('should not build URL for non-existent method', () => {
    expect(() => client.buildUrl('non-existent'))
      .to.throw();
  });

  it('should not build signed URL for non-existent method', () => {
    return assertRejected(client.buildSignedUrl('non-existent'));
  });
});
