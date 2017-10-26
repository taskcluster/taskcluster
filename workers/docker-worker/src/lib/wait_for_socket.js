const fs = require('fs');

/** Wait for a unix domain socket to be available */
let waitForSocket = async (path, timeout) => {
  // stat the path until we find a socket or deadline is exceeded
  let deadline = Date.now() + timeout;
  do {
    // Check if socket exists, and if so, return
    let exists = await new Promise(accept => {
      fs.stat(path, (err, stats) => {
        accept(!err && stats.isSocket());
      });
    });
    if (exists) {
      return;
    }

    // sleep for 150ms
    await new Promise(accept => setTimeout(accept, 150));
  } while (deadline > Date.now());

  // Throw error
  throw new Error("waitForSocket: Timed out waiting for socket: " + path);
};

// Export waitForSocket
module.exports = waitForSocket;
