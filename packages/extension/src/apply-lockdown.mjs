import './ses.mjs.js';
import './lockdown.mjs.js';

lockdown({
  consoleTaming: 'unsafe',
  errorTaming: 'unsafe',
  mathTaming: 'unsafe',
  dateTaming: 'unsafe',
  domainTaming: 'unsafe',
  overrideTaming: 'severe',
});
