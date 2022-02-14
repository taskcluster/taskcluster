import 'jest-enzyme'

import React from "react"
React.useLayoutEffect = React.useEffect

import { configure } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';

configure({ adapter: new Adapter() });

const nodeCrypto = require('crypto');
// required for slugid test
window.crypto = {
  getRandomValues: function (buffer) {
    return nodeCrypto.randomFillSync(buffer);
  }
};
