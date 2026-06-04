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
};

/**
 * Grid of provider cards, one per currently-registered service.
 *
 * Cards are ordered by registry id (insertion order in the map mirrors
 * the order the matcher accepted registrations). Empty state shows a
 * helpful placeholder rather than nothing — useful when the audience
 * arrives before the services daemon has finished booting.
 *
 * @param props - Component props.
 * @param props.services - Live map of registry id → ServiceDescriptionPayload.
 * @returns The rendered grid.
 */
export function MarketplaceGrid(props: MarketplaceGridProps): JSX.Element {
  const { services } = props;
  const entries = [...services.entries()];

  return (
    <section className="marketplace-grid">
      <header className="marketplace-grid__header">
        <h2>Marketplace</h2>
        <span className="marketplace-grid__count">
          {entries.length} provider{entries.length === 1 ? '' : 's'}
        </span>
      </header>
      {entries.length === 0 ? (
        <div className="marketplace-grid__empty">
          Waiting for providers to register…
        </div>
      ) : (
        <ul className="marketplace-grid__cards">
          {entries.map(([id, description]) => (
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
