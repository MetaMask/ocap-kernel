// @ts-nocheck
import '@metamask/kernel-shims/endoify-repair';

try {
  // Lock down the realm so harden becomes available and intrinsics are tamed.
  // Options mirror our repair step; SES will default sane values if omitted.
  // eslint-disable-next-line no-undef
  lockdown({
    consoleTaming: 'unsafe',
    errorTaming: (import.meta?.env?.MODE === 'test') ? 'unsafe-debug' : 'unsafe',
    overrideTaming: 'severe',
    domainTaming: 'unsafe',
    stackFiltering: (import.meta?.env?.MODE === 'test') ? 'verbose' : 'concise',
  } as Record<string, unknown>);
} catch (error) {
  // Surface SES initialization failures early
  // eslint-disable-next-line no-console
  console.error('SES lockdown failed:', error);
  throw error;
}

