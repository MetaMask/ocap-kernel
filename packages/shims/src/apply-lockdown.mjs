import 'ses';

lockdown({
  consoleTaming: 'unsafe',
  dateTaming: 'unsafe',
  domainTaming: 'unsafe',
  errorTaming: 'unsafe',
  mathTaming: 'unsafe',
  overrideTaming: 'severe',
  stackFiltering: 'verbose',
});
