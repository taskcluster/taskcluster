import net from 'node:net';

/**
 * Allocate an unused TCP port on the unspecified address (the same bind
 * `@taskcluster/lib-app` uses when no host is given: dual-stack `::` when
 * IPv6 is available).
 *
 * Prefer this over hard-coded ports in test helpers so suites that each
 * start an HTTP server do not collide (EADDRINUSE). See
 * https://github.com/taskcluster/taskcluster/issues/3665
 *
 * Note: the port is released before the caller binds it, so another process
 * could claim it in between. This window is accepted because test helpers
 * need the port (via rootUrl) before the server starts, ruling out an atomic
 * `listen(0)`.
 *
 * @returns {Promise<number>}
 */
export default function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, () => {
      const { port } = server.address();
      server.close(err => (err ? reject(err) : resolve(port)));
    });
  });
}
