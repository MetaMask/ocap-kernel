import type { ServiceDescriptionPayload } from '../types.ts';

/**
 * Walk a ServiceDescription's apiSpec to collect the names of every
 * method exposed on any top-level remotable. The matcher delivers
 * methods nested under apiSpec.properties.<key>.type.spec.methods, so
 * a defensive walk is needed rather than a flat field read.
 *
 * @param description - The wire-format ServiceDescription.
 * @returns The list of method names, in iteration order.
 */
function extractMethodNames(description: ServiceDescriptionPayload): string[] {
  const properties = description.apiSpec?.properties;
  if (properties === undefined) {
    return [];
  }
  const out: string[] = [];
  for (const property of Object.values(properties)) {
    if (property?.type?.kind !== 'remotable') {
      continue;
    }
    const methods = property.type.spec?.methods;
    if (methods === undefined) {
      continue;
    }
    for (const name of Object.keys(methods)) {
      out.push(name);
    }
  }
  return out;
}

type MarketplaceGridProps = {
  services: Map<string, ServiceDescriptionPayload>;
  discoveredProviderTags: string[];
};

/**
 * Grid of provider cards, one per provider the agent has discovered
 * via `discovery_find_services`.
 *
 * Cards are ordered by discovery order (first time a provider appeared
 * in a matcher reply). Empty state reflects the conceit that the
 * inventor's side doesn't know about a provider until the agent has
 * queried the matcher.
 *
 * @param props - Component props.
 * @param props.services - Live map of registry id → ServiceDescriptionPayload.
 *   Used internally to look up the description for each discovered
 *   provider tag; not iterated directly.
 * @param props.discoveredProviderTags - Provider tags that have appeared
 *   in a matcher reply, in discovery order.
 * @returns The rendered grid.
 */
export function MarketplaceGrid(props: MarketplaceGridProps): JSX.Element {
  const { services, discoveredProviderTags } = props;

  const byProviderTag = new Map<
    string,
    { id: string; description: ServiceDescriptionPayload }
  >();
  for (const [id, description] of services) {
    if (typeof description.providerTag === 'string') {
      byProviderTag.set(description.providerTag, { id, description });
    }
  }

  const entries: { id: string; description: ServiceDescriptionPayload }[] = [];
  for (const tag of discoveredProviderTags) {
    const found = byProviderTag.get(tag);
    if (found !== undefined) {
      entries.push(found);
    }
  }

  return (
    <section className="marketplace-grid">
      <header className="marketplace-grid__header">
        <h2>Marketplace</h2>
        <span className="marketplace-grid__count">
          {entries.length} discovered
        </span>
      </header>
      {entries.length === 0 ? (
        <div className="marketplace-grid__empty">
          No providers discovered yet — agent hasn't queried the matcher.
        </div>
      ) : (
        <ul className="marketplace-grid__cards">
          {entries.map(({ id, description }) => (
            <ProviderCard key={id} id={id} description={description} />
          ))}
        </ul>
      )}
    </section>
  );
}

type ProviderCardProps = {
  id: string;
  description: ServiceDescriptionPayload;
};

/**
 * A single provider's card in the marketplace grid. Shows the
 * provider tag, registry id, natural-language description, the list
 * of method names exposed, and the advisory price.
 *
 * @param props - Component props.
 * @param props.id - Matcher registry id (e.g. `svc:0`).
 * @param props.description - The service's wire-format description.
 * @returns The rendered card.
 */
function ProviderCard({ id, description }: ProviderCardProps): JSX.Element {
  const methodNames = extractMethodNames(description);
  const priceLabel =
    typeof description.priceUsd === 'number'
      ? `$${description.priceUsd.toLocaleString()}`
      : '—';

  return (
    <li className="provider-card">
      <header className="provider-card__header">
        <span className="provider-card__tag">{description.providerTag}</span>
        <span className="provider-card__id">{id}</span>
      </header>
      <p className="provider-card__description">{description.description}</p>
      <footer className="provider-card__footer">
        <span className="provider-card__methods">
          {methodNames.length === 0 ? 'no methods' : methodNames.join(' · ')}
        </span>
        <span className="provider-card__price">{priceLabel}</span>
      </footer>
    </li>
  );
}
