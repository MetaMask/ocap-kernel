import 'ses';
import '@endo/eventual-send/shim.js';

lockdown({
  consoleTaming: 'unsafe',
  // errorTaming: 'unsafe',
  mathTaming: 'unsafe',
  dateTaming: 'unsafe',
  domainTaming: 'unsafe',
  overrideTaming: 'severe',
  stackFiltering: 'verbose',
  // TODO: fix these
  errorTrapping: 'report',
  reporting: 'console',
  unhandledRejectionTrapping: 'report',
  errorTaming: 'unsafe-debug',
});
