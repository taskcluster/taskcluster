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

  start() {
    this.started = true;
  }

  send(message) {
    this.sent.push(message);
  }

  fakeReceive(message) {
    assert(this.started);
    this.emit('message', message);
  }
}

suite('worker-runner-protocol', function() {
  suite('transport', function() {
    test('receive', async function() {
      const messages = [];
      const input = new PassThrough();
      const output = new PassThrough();
      const st = new StreamTransport(input, output);
      const end = endEvent(st);

      // streams do all manner of buffering internally, so we can't test that
      // here.  However, empirically when the input is stdin, that buffering
      // is disabled and we get new lines immediately.
      input.push('ignored line\n');
      input.push('~{"type": "test"}\n');

      // only add the 'message' listener after the input has been pushed.  This
      // is a check that the stream doesn't start flowing until the listener
      // is started.
      st.start();
      st.on('message', msg => messages.push(msg));

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
      const st = new StreamTransport(input, output);
      output.on('data', chunk => written.push(chunk));

      st.send({type: 'test'});
      st.send({type: 'test-again'});

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

      left.start();
      right.start();

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
      const prot = new Protocol(transp);
      prot.addCapability('worker-only');
      prot.addCapability('shared');
      prot.start();

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
      const prot = new Protocol(transp);
      prot.start();

      prot.send({type: 'test'});
      assert.deepEqual(transp.sent, [{type: 'test'}]);
    });

    test('receiving', async function() {
      const transp = new TestTransport();
      const prot = new Protocol(transp);
      const received = [];
      prot.start();

      prot.on('test-msg', msg => received.push(msg));
      transp.fakeReceive({type: 'test'});

      assert.deepEqual(received, [{type: 'test'}]);
    });
  });
});
