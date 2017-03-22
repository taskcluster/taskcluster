import fs from 'fs';
import { settingsPath } from '../../../.test/settings';
import Debug from 'debug';

let debug = Debug('docker-worker:host:test');

export function billingCycleUptime() {
  let path = settingsPath('billingCycleUptime');

  try {
    return parseInt(fs.readFileSync(path), 10);
  } catch (e) {
    return 0;
  }
}

function billingCycleInterval() {
  let path = settingsPath('billingCycleInterval');

  try {
    return parseInt(fs.readFileSync(path), 10);
  } catch(e) {
    return 0;
  }
}

export function getTerminationTime() {
  let path = settingsPath('nodeTermination');
  let content;
  try {
    content = fs.readFileSync(path, 'utf8');
  }
  catch (e) {
    content = '';
  }

  return content;
}

export function configure() {
  let path = settingsPath('configure');
  let config = {
    publicIp: '127.0.0.1',
    billingCycleInterval: billingCycleInterval(),
    privateIp: '169.254.1.1',
    workerNodeType: 'test-worker',
    instanceId: 'test-worker-instance',
    region: 'us-middle-1a',
    instanceType: 'r3-superlarge'
  };
  try {
    let content = fs.readFileSync(path, 'utf8');
    debug('configure read:', content);
    content = JSON.parse(content);
    Object.assign(config, content);
    return config;
  } catch (e) {
    return config;
  }
}
