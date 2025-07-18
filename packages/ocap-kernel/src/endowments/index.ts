import makeAbortEndowment from './abort.ts';
import makeFetchEndowment from './fetch.ts';

const endowmentFactories = {
  fetch: makeFetchEndowment,
  abort: makeAbortEndowment,
} as const;

export type EndowmentName = keyof typeof endowmentFactories;

type EndowmentConfig = Parameters<
  (typeof endowmentFactories)[EndowmentName]
>[0];

type EndowmentFactory = (config: EndowmentConfig) => Record<string, unknown>;

type EndowmentFactories = typeof endowmentFactories;

type EndowmentConfigs = {
  [Name in EndowmentName]: Parameters<EndowmentFactories[Name]>[0];
};

// The output of makeEndowments is a record ready to assign to global scope.
type Endowments<EndowmentNames extends EndowmentName> = {
  [Name in EndowmentNames]: ReturnType<EndowmentFactories[Name]>;
}[EndowmentNames];

/**
 * The configuration for makeEndowments.
 * It is a partial record mapping endowment names to the config objects to pass to their respective factories.
 */
export type MakeEndowmentsConfig<EndowmentNames extends EndowmentName> =
  Partial<EndowmentConfigs> & { [Name in EndowmentNames]: unknown };

/**
 * Make endowments from a configuration.
 *
 * @param config - A record mapping endowment names to the config objects to pass to their respective factories. Omitted endowments are not constructed.
 * @returns The endowments, conglommerated into a single record.
 */
export default function makeEndowments<EndowmentNames extends EndowmentName>(
  config: MakeEndowmentsConfig<EndowmentNames>,
): Endowments<EndowmentNames> {
  return Object.assign(
    {},
    ...(Object.keys(config) as EndowmentName[]).map((name) =>
      (endowmentFactories[name] as EndowmentFactory)(config[name]),
    ),
  );
}
