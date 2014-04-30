// Unit tests. Run with mocha.

/*global describe:true it:true */


var should = require('should')
  , SchemaRegistry = require('../lib/schemaRegistry.js')
  , uri = require('../lib/uri.js')
  ;

describe('URI module:', function() {

  describe('parse:', function() {

    it('should parse a URL', function() {
      var url = 'http://google.com/foo/bar/baz#qux';
      var uriObj = uri.parse(url);
      uriObj.kind.should.eql('url');
      uriObj.absolute.should.be.true;
      uriObj.baseUri.should.eql('http://google.com/foo/bar/baz');
      uriObj.fragment.should.eql('#qux');
    });

    it('should parse a URN', function() {
      var urn = 'urn:uuid:FB8E5076-BF6F-4DED-8165-8369A9158B46#foo';
      var uriObj = uri.parse(urn);
      uriObj.kind.should.eql('urn');
      uriObj.baseUri.should.eql('urn:uuid:FB8E5076-BF6F-4DED-8165-8369A9158B46');
      uriObj.fragment.should.eql('#foo');
    });

    it('should parse a URL with absolute path but no host', function() {
      var url = '/bar/baz#qux';
      var uriObj = uri.parse(url);
      uriObj.kind.should.eql('url');
      uriObj.absolute.should.be.false;
      uriObj.baseUri.should.eql('/bar/baz');
      uriObj.fragment.should.eql('#qux');
    });

    it('should parse a relative URL', function() {
      var url = 'bar/baz#qux';
      var uriObj = uri.parse(url);
      uriObj.kind.should.eql('url');
      uriObj.absolute.should.be.false;
      uriObj.baseUri.should.eql('bar/baz');
      uriObj.fragment.should.eql('#qux');
    });

    it('should round-trip format a URL', function() {
      var url = 'http://some.site/foo/bar/baz#qux';
      var uriObj = uri.parse(url);
      uri.format(uriObj).should.eql(url);
    });

    it('should round-trip format a URN', function() {
      var urn = 'urn:uuid:FB8E5076-BF6F-4DED-8165-8369A9158B46#foo';
      var uriObj = uri.parse(urn);
      uri.format(uriObj).should.eql(urn);
    });

    it('should add a hash sign to a URL that does not have one', function() {
      var url = 'http://some.site/foo/bar/baz';
      var uriObj = uri.parse(url);
      uri.format(uriObj).slice(-1).should.eql('#');
    });

    it('should add a hash sign to a URN that does not have one', function() {
      var urn = 'urn:uuid:FB8E5076-BF6F-4DED-8165-8369A9158B46';
      var uriObj = uri.parse(urn);
      uri.format(uriObj).slice(-1).should.eql('#');
    });

    it('should resolve in favor of an absolute URI', function() {
      var from = 'http://google.com/some/search';
      var to = 'http://bing.com/another/search';
      uri.resolve(from, to).should.eql(to + '#');
    });

    it('should resolve in favor of a URN', function() {
      var from = 'http://google.com/some/search';
      var to = 'urn:uuid:FB8E5076-BF6F-4DED-8165-8369A9158B46';
      uri.resolve(from, to).should.eql(to + '#');
    });

    it('should resolve a relative URL onto an absolute URL', function() {
      var from = 'http://google.com/some/search#foo';
      var to = 'other/page#bar';
      var expected = 'http://google.com/some/other/page#bar';
      uri.resolve(from, to).should.eql(expected);
    });

    it('should resolve an absolute pathname onto an absolute URL', function() {
      var from = 'http://google.com/some/search#foo';
      var to = '/other/page#bar';
      var expected = 'http://google.com/other/page#bar';
      uri.resolve(from, to).should.eql(expected);
    });

    it('should resolve a fragment onto an absolute URL', function() {
      var from = 'http://google.com/some/search#foo';
      var to = '#bar';
      var expected = 'http://google.com/some/search#bar';
      uri.resolve(from, to).should.eql(expected);
    });

    it('should resolve a relative URL onto a URN', function() {
      var from = 'urn:uuid:3AAB9A9E-65BD-4BDB-A514-318205A3E409/foo/bar#qux';
      var to = 'other/page#bar';
      var expected =
        'urn:uuid:3AAB9A9E-65BD-4BDB-A514-318205A3E409/foo/other/page#bar';
      uri.resolve(from, to).should.eql(expected);
    });

    it('should resolve an absolute pathname onto a URN', function() {
      var from = 'urn:uuid:3AAB9A9E-65BD-4BDB-A514-318205A3E409/foo/bar#qux';
      var to = '/other/page#bar';
      var expected =
        'urn:uuid:3AAB9A9E-65BD-4BDB-A514-318205A3E409/other/page#bar';
      uri.resolve(from, to).should.eql(expected);
    });

    it('should resolve a JSON pointer-like fragment onto an absolute URL',
    function()
    {
      var from = 'http://google.com/some/search#foo';
      var to = '#/bar/baz/qux';
      var expected = 'http://google.com/some/search#/bar/baz/qux';
      uri.resolve(from, to).should.eql(expected);
    });

    it('should resolve a fragment onto a URN', function() {
      var from = 'urn:uuid:FB8E5076-BF6F-4DED-8165-8369A9158B46';
      var to = '#qux';
      var expected = from + to;
      uri.resolve(from, to).should.eql(expected);
    });

    it('should resolve a JSON pointer-like fragment onto a URN', function() {
      var from = 'urn:uuid:FB8E5076-BF6F-4DED-8165-8369A9158B46';
      var to = '#/bar/baz/qux';
      var expected = from + to;
      uri.resolve(from, to).should.eql(expected);
    });

    it('should resolve a root JSON pointer', function() {
      var from = 'http://google.com/some#/search';
      var to = '#';
      var expected = 'http://google.com/some#';
      uri.resolve(from, to).should.eql(expected);
    });

    it('should resolve two URNs', function() {
      var from = 'urn:foo:bar';
      var to = 'urn:foo:bar';
      var expected = 'urn:foo:bar#';
      uri.resolve(from, to).should.eql(expected);
    });
  });
});
