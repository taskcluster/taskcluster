const assert = require('assert');
const {EventEmitter} = require('events');
const {Readable, PassThrough} = require('stream');
const {StreamTransport, Protocol} = require('../src/lib/worker-runner-protocol');

const endEvent = emitter => new Promise(resolve => emitter.on('end', resolve));

class TestTransport extends EventEmitter {
  constructor() {
    super();

    this.sent = [];
  }

  send(message) {
    this.sent.push(message);
  }

  fakeReceive(message) {
    this.emit('message', message);
  }
}

suite('worker-runner-protocol', function() {
  suite('transport', function() {
    test('receive', async function() {
      const messages = [];
      const input = new Readable();
      const output = new PassThrough();
      const sp = new StreamTransport(input, output);
      sp.on('message', msg => messages.push(msg));
      const end = endEvent(sp);

      // streams do all manner of buffering internally, so we can't test that
      // here.  However, empirically when the input is stdin, that buffering
      // is disabled and we get new lines immediately.
      input.push('ignored line\n');
      input.push('~{"type": "test"}\n');
      input.push('~{"xxx": "yyy"}\n'); // also ignored: no type
      input.push('~{"xxx", "yyy"}\n'); // also ignored: invalid JSON
      input.push(null);

      input.destroy();
      output.destroy();

      await end;

      assert.deepEqual(messages, [{type: 'test'}]);
    });

    test('send', async function() {
      const written = [];
      const input = new Readable();
      const output = new PassThrough();
      const sp = new StreamTransport(input, output);
      output.on('data', chunk => written.push(chunk));

      sp.send({type: 'test'});
      sp.send({type: 'test-again'});

      input.destroy();
      output.destroy();

      assert.deepEqual(written.join(''), '~{"type":"test"}\n~{"type":"test-again"}\n');
    });

    test('bidirectional', async function() {
      const leftward = new PassThrough();
      const rightward = new PassThrough();
      const left = new StreamTransport(leftward, rightward);
      const right = new StreamTransport(rightward, leftward);

      const leftMessages = [];
      left.on('message', msg => leftMessages.push(msg));

      const rightMessages = [];
      right.on('message', msg => rightMessages.push(msg));

      left.send({type: 'from-left'});
      right.send({type: 'from-right'});

      leftward.destroy();
      rightward.destroy();

      assert.deepEqual(leftMessages, [{type: 'from-right'}]);
      assert.deepEqual(rightMessages, [{type: 'from-left'}]);
    });
  });

  suite('protocol', function() {
    test('caps negotiation', async function() {
      const transp = new TestTransport();
      const prot = new Protocol(transp, new Set(['worker-only', 'shared']));

      // `capable` doesn't return yet..
      let returned = false;
      prot.capable('worker-only').then(() => { returned = true; });
      assert.equal(returned, false);

      transp.fakeReceive({type: 'welcome', capabilities: ['shared', 'runner-only']});

      assert.equal(await prot.capable('worker-only'), false);
      assert.equal(await prot.capable('shared'), true);
      assert.equal(await prot.capable('runner-only'), false);
    });

    test('sending', async function() {
      const transp = new TestTransport();
      const prot = new Protocol(transp, new Set([]));
      prot.send({type: 'test'});
      assert.deepEqual(transp.sent, [{type: 'test'}]);
    });

    test('receiving', async function() {
      const transp = new TestTransport();
      const prot = new Protocol(transp, new Set([]));
      const received = [];

      prot.on('test-msg', msg => received.push(msg));
      transp.fakeReceive({type: 'test'});

      assert.deepEqual(received, [{type: 'test'}]);
    });
  });
});
