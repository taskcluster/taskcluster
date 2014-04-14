// The MIT License (MIT)
//
// Copyright (c) 2014 Jonas Finnemann Jensen
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

var TimeChunkedStream = require('./index');
var PassThrough       = require('stream').PassThrough;


/** Create an input stream that creates small chunks */
var createInputStream = function() {
  var input = new PassThrough();
  var count = 500;
  var invl  = setInterval(function() {
    if (count > 0) {
      input.write("|" + count);
      count -= 1;
    } else {
      clearInterval(invl);
      input.end();
    }
  }, 1);
  return input;
}

/** Test that input stream writes a lot of small chunks */
exports.testInputStream = function(test) {
  test.expect(500);
  var input = createInputStream();
  input.on('data', function(chunk) {
    test.ok(chunk.length < 5);
  });
  input.on('end', function() {
    test.done();
  });
};

/** Time chunked stream */
exports.testTimeChunkedStream = function(test) {
  test.expect(1);
  var input   = createInputStream();
  var chunked = new TimeChunkedStream({timeout: 100});
  var chunks  = 0;
  input.pipe(chunked);
  chunked.on('data', function(chunk) {
    chunks += 1;
    if (chunk.length < 5) {
      test.ok(false);
    }
  });
  chunked.on('end', function() {
    test.ok(chunks < 10, "we shouldn't have more than 10 chunks");
    test.done();
  });
};
