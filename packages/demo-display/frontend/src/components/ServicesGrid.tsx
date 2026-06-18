import { useEffect, useRef } from 'react';

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

type ServicesGridProps = {
  services: Map<string, ServiceDescriptionPayload>;
  discoveredProviderTags: string[];
};

/**
 * Grid of provider cards, one per provider the agent has discovered
 * via `discovery_find_services`. The list auto-scrolls to the bottom
 * whenever new providers appear so the latest discoveries stay in view.
 *
 * Cards are ordered by discovery order (first time a provider appeared
 * in a matcher reply). Empty state reflects the conceit that the
 * inventor's side doesn't know about a provider until the agent has
 * queried the matcher.
 *
 * @param props - Component props.
 * @param props.services - Live map of provider tag → service description,
 *   populated by `service.discovered` events from the openclaw discovery
 *   plugin. Looked up by the entries below.
 * @param props.discoveredProviderTags - Provider tags that have appeared
 *   in a matcher reply, in discovery order.
 * @returns The rendered grid.
 */
export function ServicesGrid(props: ServicesGridProps): JSX.Element {
  const { services, discoveredProviderTags } = props;

  const entries: { tag: string; description: ServiceDescriptionPayload }[] = [];
  for (const tag of discoveredProviderTags) {
    const description = services.get(tag);
    if (description !== undefined) {
      entries.push({ tag, description });
    }
  }

  const listRef = useRef<HTMLUListElement | null>(null);
  useEffect(() => {
    const list = listRef.current;
    if (list !== null) {
      list.scrollTop = list.scrollHeight;
    }
  }, [entries.length]);

  return (
    <section className="services-grid">
      <header className="services-grid__header">
        <h2>Services</h2>
        <span className="services-grid__count">
          {entries.length} discovered
        </span>
      </header>
      {entries.length === 0 ? (
        <div className="services-grid__empty">
          No providers discovered yet — agent hasn't queried the matcher.
        </div>
      ) : (
        <ul className="services-grid__cards" ref={listRef}>
          {entries.map(({ tag, description }) => (
            <ProviderCard key={tag} description={description} />
          ))}
        </ul>
      )}
    </section>
  );
}

type ProviderCardProps = {
  description: ServiceDescriptionPayload;
};

/**
 * A single provider's card in the services grid. Shows the provider
 * tag, natural-language description, the list of method names exposed,
 * and the advisory price.
 *
 * @param props - Component props.
 * @param props.description - The service's wire-format description.
 * @returns The rendered card.
 */
function ProviderCard({ description }: ProviderCardProps): JSX.Element {
  const methodNames = extractMethodNames(description);
  const priceLabel =
    typeof description.priceUsd === 'number'
      ? `$${description.priceUsd.toLocaleString()}`
      : '—';

  return (
    <li className="provider-card">
      <header className="provider-card__header">
        <span className="provider-card__tag">{description.providerTag}</span>
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
