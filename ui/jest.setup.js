const nodeCrypto = require('crypto');

// required for slugid test

window.crypto = {
  getRandomValues: function (buffer) {
    return nodeCrypto.randomFillSync(buffer);
  }
};
