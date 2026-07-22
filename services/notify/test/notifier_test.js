import assert from 'node:assert';
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
