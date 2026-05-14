---
name: discovery
description: Use the discovery tools to find services via a matcher and consume them through the contact protocol.
metadata:
  { 'openclaw': { 'emoji': '🧭', 'requires': { 'bins': ['discovery'] } } }
---

# Service discovery

Use the **discovery tools** to find services a user might want to use, inspect
their APIs, connect to them via the contact protocol, and invoke their
methods. Do not use `exec` or other CLIs for these operations.

## Tools

- **discovery_redeem_matcher** — Redeem the matcher's OCAP URL. Must be called first unless the matcher URL was pre-configured in the plugin config.
- **discovery_find_services** — Ask the matcher for services matching a natural-language description. Returns each candidate's description plus the contact URLs that can be used to initiate contact with it.
- **service_get_description** — Fetch the `ServiceDescription` from a contact endpoint (identified by OCAP URL, nickname, or kref). Use this to inspect a candidate's API before committing to it.
- **service_initiate_contact** — Call `initiateContact()` on a contact endpoint to obtain a reference to the actual service. For the Public access model, the returned reference is immediately usable; other models are reported as "not supported in this phase".
- **service_call** — Invoke a method on a service obtained via `service_initiate_contact`. Specify the service by nickname or kref, the method name, and optional JSON-encoded args.
- **discovery_list_tracked** — Report everything the plugin is currently tracking in this session: matcher connection, redeemed contacts, and obtained services.

## Workflow

1. If the matcher isn't already connected, ask the user for the matcher OCAP URL and call `discovery_redeem_matcher`.
2. Ask the user what they want to do. Call `discovery_find_services` with a natural-language description of their intent.
3. Review the candidate list. Usually one choice is obvious; if not, call `service_get_description` on one or more candidates to inspect their APIs.
4. Call `service_initiate_contact` on a chosen contact URL to obtain a usable service reference.
5. Call `service_call` to invoke methods on the service. Method names and argument shapes come from the service description — do not guess.

## Example: signing a message

1. **User**: "I want to sign 'hello' with my wallet."
2. Agent: `discovery_find_services(description: "sign a message with my wallet")` → returns a `PersonalMessageSigner` candidate with its contact URL.
3. Agent: `service_get_description(contact: "<that URL>")` → learns there are `getAccounts` and `signMessage` methods.
4. Agent: `service_initiate_contact(contact: "<that URL>")` → obtains the service (nickname `PersonalMessageSigner`).
5. Agent: `service_call(service: "PersonalMessageSigner", method: "getAccounts")` → returns list of wallet addresses.
6. Agent: `service_call(service: "PersonalMessageSigner", method: "signMessage", args: '["0xabc...", "hello", "0x1"]')` → returns the signature.

## Rules

- Always call `discovery_redeem_matcher` before `discovery_find_services` if the matcher is not yet connected.
- Always ask the user what they want before calling `discovery_find_services`.
- Do not guess method names or argument shapes — inspect `service_get_description` first when in doubt.
- If `service_initiate_contact` reports "non-public response" the service requires credentials or a validated code bundle; those access models are out of scope for this phase.
- Use `discovery_list_tracked` when you lose track of which services are in hand.
