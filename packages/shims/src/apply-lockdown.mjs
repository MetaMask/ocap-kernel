import './lockdown.mjs';

lockdown({
  consoleTaming: 'unsafe',
  errorTaming: 'unsafe',
  mathTaming: 'unsafe',
  dateTaming: 'unsafe',
  domainTaming: 'unsafe',
  overrideTaming: 'severe',
});
