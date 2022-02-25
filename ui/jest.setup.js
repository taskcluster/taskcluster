import React from "react"
React.useLayoutEffect = React.useEffect

const nodeCrypto = require('crypto');
// required for slugid test
window.crypto = {
  getRandomValues: function (buffer) {
    return nodeCrypto.randomFillSync(buffer);
  }
};

window.env = Object.assign({}, window.env, {
  TASKCLUSTER_ROOT_URL: 'https://taskcluster.net',
});


// Set up fake timer
jest.useFakeTimers('modern').setSystemTime(new Date('2022-02-17 13:00:00').getTime());