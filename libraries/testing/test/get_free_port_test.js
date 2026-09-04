import assert from 'node:assert';
import net from 'node:net';
import testing from '@taskcluster/lib-testing';

suite(testing.suiteName(), () => {
  test('returns a usable free port', async () => {
    const port = await testing.getFreePort();
    assert.equal(typeof port, 'number');
    assert(port > 0);

    // Rebind the same way @taskcluster/lib-app does: listen(port) with no host
    // (unspecified / dual-stack `::` when IPv6 is available).
    await new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once('error', reject);
      server.listen(port, () => {
        server.close(err => (err ? reject(err) : resolve()));
      });
    });
  });

  test('returns distinct ports for concurrent callers', async () => {
    const ports = await Promise.all([testing.getFreePort(), testing.getFreePort(), testing.getFreePort()]);
    assert.equal(new Set(ports).size, ports.length);
  });
});
