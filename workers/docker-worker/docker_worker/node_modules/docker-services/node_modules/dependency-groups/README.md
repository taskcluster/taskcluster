# dependency-groups

Dependency groups is useful when you have a list of interrelated items
that need to be actioned on in the correct order (package managers are a
decent parallel).

## Features

  - cyclic dependencies throw errors
  - no duplicates in the final group
  - depth first ordering of services make it easy to action on groups

## Usage

```js
var group = require('dependency-groups');

// Imagine you have this list of services. The service can have many
// different dependencies (and dependencies can have dependencies,
// etc...) the goal is to launch them in the correct order and in
// parallel as much as possible.
var services = {
  worker: ['queue'],
  appworker: ['worker'],
  app: ['db', 'queue'],
  db: ['monit', 'xvfb'],
  queue: ['monit', 'amqp'],
  monit: [],
  xvfb: ['monit'],
  amqp: []
};

// group them together so you can take some action on each group
var launchGroups = group(services);

// the above will give you this list of groups
launchGroups = [
  ['monit', 'amqp'],
  ['queue', 'xvfb'],
  ['worker', 'db'],
  ['appworker', 'app']
];

// selectively group only some items
var workerGroups = group(services, ['worker']);
workerGroups = [
  ['monit', 'amqp'],
  ['queue'],
  ['worker']
];
```

## LICENSE

The MIT License (MIT)

Copyright (c) 2014 Sahaja James Lal

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
