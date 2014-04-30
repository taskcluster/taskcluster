//
// Not a general URI parser. Just enough to meet our needs.
//

'use strict';

var url = require('url')
  ;

var URN_REGEX = /^([Uu][Rr][Nn]:[^#\?\/]+)(\/[^#\?]+)?([#].*)?$/;

// ******************************************************************
// Parse a URI. Returns an object that can be passed to format().
// ******************************************************************
function parse(uri) {
  var result = { baseUri: '', fragment: '#' };

  if (uri.slice(0, 4).toLowerCase() === 'urn:') {
    result.kind = 'urn';
    var parts = uri.match(URN_REGEX);
    if (parts) {
        result.baseUri = parts[1] + (parts[2] || '');
      result.host = parts[1];
      if (parts[2]) { result.pathname = parts[2]; }
      if (parts[3]) { result.fragment = parts[3]; }
    }
  } else {
    result.kind = 'url';
    var parsed = url.parse(uri);
    if (parsed.hash) {
      result.fragment = parsed.hash;
      delete parsed.hash;
    }
    result.absolute =
      (parsed.host && parsed.pathname && parsed.pathname[0] === '/') ?
      true : false;
    result.baseUri = url.format(parsed);
  }

  return result;
}
exports.parse = parse;

// ******************************************************************
// Format an object (as returned by the parse method) into a URI.
// ******************************************************************
function format(uriObj) {
  return uriObj.baseUri + uriObj.fragment;
}
exports.format = format;

// ******************************************************************
// resolve a relative URI
// ******************************************************************
function resolve(from, to) {
  var objFrom = parse(from);
  var objTo = parse(to);

  if (objFrom.kind === 'url' && objTo.kind === 'url') {
    return format(parse(url.resolve(from, to)));
  }

  if (objFrom.kind === 'urn') {
    // In our world all URNs are absolute (if they weren’t they’d be
    // seen as a non-absolute URL).

    if (objTo.kind === 'urn') {
      return format(objTo);
    }

    // "from" is a urn and "to" is a url
    if (objTo.kind === 'url' && objTo.absolute) {
      return format(objTo);
    } else {
      if (objFrom.pathname) {
        objFrom.pathname = url.resolve(objFrom.pathname, objTo.baseUri);
      }
      objFrom.baseUri = objFrom.host + (objFrom.pathname || '');
      objFrom.fragment = objTo.fragment;
      return format(objFrom);
    }
  } else {
    // "from" is a url and "to" is a urn (!)
    return format(objTo);
  }
}
exports.resolve = resolve;
