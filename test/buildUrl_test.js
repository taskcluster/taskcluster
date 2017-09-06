import { expect } from 'chai';
import { Client } from '../src';
import reference from './reference-harness';

// This suite exercises the request and response functionality of
// a client against a fake service defined by this reference

const signed = (url) => url.includes('?') ?
  new RegExp(`^${url.replace('?', '\\?')}&bewit=(.*)`) :
  new RegExp(`^${url}\\?bewit=(.*)`);

describe('Building URLs', function() {
  this.timeout(30000);

  const Fake = Client.create(reference);
  const client = new Fake({
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
    expect(client.buildSignedUrl(client.get))
      .to.match(signed('https://fake.taskcluster.net/v1/get-test'));
  });

  it('should build URL with parameter', () => {
    expect(client.buildUrl(client.param, 'test'))
      .to.equal('https://fake.taskcluster.net/v1/url-param/test/list');
  });

  it('should build signed URL with parameter', () => {
    expect(client.buildSignedUrl(client.param, 'test'))
      .to.match(signed('https://fake.taskcluster.net/v1/url-param/test/list'));
  });

  it('should build URL with 2 parameters', () => {
    expect(client.buildUrl(client.param2, 'test', 'te/st'))
      .to.equal('https://fake.taskcluster.net/v1/url-param2/test/te%2Fst/list');
  });

  it('should build signed URL with 2 parameters', () => {
    expect(client.buildSignedUrl(client.param2, 'test', 'te/st'))
      .to.match(signed('https://fake.taskcluster.net/v1/url-param2/test/te%2Fst/list'));
  });

  it('should not build URL with missing parameter', () => {
    expect(() => client.buildUrl(client.param2, 'te/st'))
      .to.throw();
  });

  it('should not build signed URL with missing parameter', () => {
    expect(() => client.buildSignedUrl(client.param2, 'te/st'))
      .to.throw();
  });

  it('should build URL with query options', () => {
    expect(client.buildUrl(client.query, { option: 2 }))
      .to.equal('https://fake.taskcluster.net/v1/query/test?option=2');
  });

  it('should build signed URL with query options', () => {
    expect(client.buildSignedUrl(client.query, { option: 2 }))
      .to.match(signed('https://fake.taskcluster.net/v1/query/test?option=2'));
  });

  it('should build URL with empty query options', () => {
    expect(client.buildUrl(client.query, {}))
      .to.equal('https://fake.taskcluster.net/v1/query/test');
  });

  it('should build signed URL with empty query options', () => {
    expect(client.buildSignedUrl(client.query, {}))
      .to.match(new RegExp('^https://fake.taskcluster.net/v1/query/test'));
  });

  it('should not build URL with incorrect query option', () => {
    expect(() => client.buildUrl(client.query, { wrongKey: 2 }))
      .to.throw();
  });

  it('should not build signed URL with incorrect query option', () => {
    expect(() => client.buildSignedUrl(client.query, { wrongKey: 2 }))
      .to.throw();
  });

  it('should build URL with parameter and query option', () => {
    expect(client.buildUrl(client.paramQuery, 'test', { option: 2 }))
      .to.equal('https://fake.taskcluster.net/v1/param-query/test?option=2');
  });

  it('should build signed URL with parameter and query option', () => {
    expect(client.buildSignedUrl(client.paramQuery, 'test', { option: 2 }))
      .to.match(signed('https://fake.taskcluster.net/v1/param-query/test?option=2'));
  });

  it('should build URL with parameter and empty query options', () => {
    expect(client.buildUrl(client.paramQuery, 'test', {}))
      .to.equal('https://fake.taskcluster.net/v1/param-query/test');
  });

  it('should build signed URL with parameter and empty query options', () => {
    expect(client.buildSignedUrl(client.paramQuery, 'test', {}))
      .to.match(signed('https://fake.taskcluster.net/v1/param-query/test'));
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
    expect(() => client.buildSignedUrl('non-existent'))
      .to.throw();
  });
});