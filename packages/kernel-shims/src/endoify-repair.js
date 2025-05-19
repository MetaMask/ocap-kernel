/* global repairIntrinsics */
import 'ses';
import '@endo/eventual-send/shim.js';

const isTest = import.meta?.env?.MODE === 'test';

repairIntrinsics({
  consoleTaming: 'unsafe',
  errorTaming: isTest ? 'unsafe-debug' : 'unsafe',
  overrideTaming: 'severe',
  domainTaming: 'unsafe',
  stackFiltering: isTest ? 'verbose' : 'concise',
});
