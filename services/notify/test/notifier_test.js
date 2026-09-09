import assert from 'node:assert';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import helper from './helper.js';
import testing from '@taskcluster/lib-testing';

helper.secrets.mockSuite(testing.suiteName(), ['aws'], (mock, skipping) => {
  if (!mock) {
    return;
  }

  helper.withDenier(skipping);
  helper.withFakeQueue(skipping);
  helper.withFakeMatrix(skipping);
  helper.withFakeSlack(skipping);
  helper.withSES(mock, skipping);
  helper.withPulse(skipping);

  test('isDuplicate', async () => {
    const notifier = await helper.load('notifier');

    const a = 'valueA';
    const b = 8;
    const c = { key: 'valueC' };

    assert.equal(false, notifier.isDuplicate(a, b, c));
    notifier.markSent(a, b, c);
    assert.equal(true, notifier.isDuplicate(a, b, c));
  });

  test('email', async () => {
    const notifier = await helper.load('notifier');

    const address = 'test@taskcluster.net';
    const subject = 'Test Subject';
    const content = 'Test Content';
    const link = 'https://taskcluster.net';
    const replyTo = 'test@taskcluster.net';
    const template = 'simple';

    assert.ok(await notifier.email({ address, subject, content, link, replyTo, template }));
    assert.equal(false, await notifier.email({ address, subject, content, link, replyTo, template }));

    // denied email
    assert.equal(
      false,
      await notifier.email({
        address: 'test+denied@taskcluster.net',
        subject,
        content,
        link,
        replyTo,
        template,
      })
    );
  });

  test('email inlines stylesheet rules as style attributes', async () => {
    const notifier = await helper.load('notifier');

    for (const template of ['simple', 'fullscreen']) {
      const res = await notifier.email({
        address: `test+${template}@taskcluster.net`,
        subject: 'Test Subject',
        content: 'Test Content',
        link: { href: 'https://taskcluster.net', text: 'Click me' },
        replyTo: 'test@taskcluster.net',
        template,
      });

      const { html } = res.originalMessage;
      assert.match(
        html,
        /<body style="[^"]*background-color: #f6f6f6/,
        `${template}: stylesheet rules were not inlined into style attributes`
      );
    }
  });

  test('email does not inline resources', async () => {
    const notifier = await helper.load('notifier');

    const templates = new URL('../src/templates', import.meta.url).pathname;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notify'));
    const resource = 'SHOULDNNOTINLINE';

    // an inlined <img> would be base64 encoded
    const resourceB64 = Buffer.from(resource).toString('base64');
    fs.writeFileSync(path.join(tmpDir, 'foo'), resource);

    const requested = [];
    const server = http.createServer((req, res) => {
      requested.push(req.url);
      res.end(resource);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

    try {
      const local = path.relative(templates, path.join(tmpDir, 'foo'));
      const remote = `http://127.0.0.1:${server.address().port}/foo`;
      const elements = [
        `<script src="${local}"></script>`,
        `<link rel="stylesheet" href="${local}">`,
        `<img src="${local}" data-inline>`,
        `<script src="${remote}"></script>`,
        `<img src="${remote}" data-inline>`,
      ];

      for (const [i, element] of elements.entries()) {
        for (const template of ['simple', 'fullscreen']) {
          const res = await notifier.email({
            address: `test+inline${i}-${template}@taskcluster.net`,
            subject: 'Test',
            content: element,
            link: { href: 'https://taskcluster.net', text: 'Click me' },
            replyTo: 'test@taskcluster.net',
            template,
          });

          const { html, text } = res.originalMessage;
          for (const part of [html, text]) {
            for (const needle of [resource, resourceB64]) {
              assert.ok(!part.includes(needle), `${template}: ${element} pulled the resource into the message`);
            }
          }
        }
      }

      assert.deepEqual(requested, [], 'a resource named in content was fetched');
    } finally {
      server.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('pulse', async () => {
    const notifier = await helper.load('notifier');

    const routingKey = 'test.routing.key';
    const message = {
      version: 1,
      message: {
        title: 'Test',
        description: 'No comments',
      },
    };

    assert.ok(await notifier.pulse({ routingKey, message }));
    assert.equal(false, await notifier.pulse({ routingKey, message }));

    assert.equal(
      false,
      await notifier.pulse({
        routingKey: 'test.denied.routing.key',
        message,
      })
    );
  });

  test('matrix', async () => {
    const notifier = await helper.load('notifier');

    const roomId = '!gBxblkbeeBSadzOniu:mozilla.org';
    const body = 'Test Body';
    const formattedBody = '<h1>Test Body</h1>';
    const msgtype = 'm.text';

    assert.ok(await notifier.matrix({ roomId, body, formattedBody, msgtype }));
    assert.equal(false, await notifier.matrix({ roomId, body, formattedBody, msgtype }));

    assert.equal(
      false,
      await notifier.matrix({
        roomId: '!denied:mozilla.org',
        body,
        formattedBody,
        msgtype,
      })
    );
  });

  test('slack', async () => {
    const notifier = await helper.load('notifier');

    const channelId = 'test-channel-id';
    const text = 'Test Text';
    const blocks = [{ type: 'header', text: { type: 'plain_text', text: 'Test Blocks' } }];
    const attachments = [];

    assert.ok(await notifier.slack({ channelId, text, blocks, attachments }));
    assert.equal(false, await notifier.slack({ channelId, text, blocks, attachments }));

    assert.equal(
      false,
      await notifier.slack({
        channelId: 'denied-channel-id',
        text,
        blocks,
        attachments,
      })
    );
  });
});
