# `@ocap/llm-mediator-vat`

Ocap kernel vat that mediates JSON-RPC calls from a local LLM tooling
process to kernel objects. Purpose is to replace the kernel-cli's
`queueMessage` RPC as the LLM's path into the kernel, tightening the
authority the tooling holds to just the specific objects the daemon
launcher chooses to hand it at startup.

## Protocol

The vat serves a line-delimited JSON-RPC 2.0 interface on a Unix
domain socket. Two methods:

- `initialize({ urls: string[] }) -> { refs: string[] }`

  Must be the first call on a new connection. Each URL is redeemed
  through the kernel's `ocapURLRedemptionService`; the resolved
  objects are named `o1`, `o2`, ... internally and returned as
  `"@@o1"`, `"@@o2"`, ... in the same order.

- `send({ target: string, method: string, args?: unknown[] }) -> unknown`

  Invokes `E(target)[method](...args)`. The `target` and any nested
  `"@@o<n>"` string in `args` is expanded to its live remotable
  before dispatch. The awaited result is walked and every remotable
  it contains (previously known or newly encountered) is replaced by
  its `"@@o<n>"` name in the response.

Object identity is preserved across calls: an object the LLM has
already seen keeps the same `@@o<n>` name.

## Session lifecycle

The naming tables live in memory only. On socket disconnect the vat
resets its state and awaits a new client; the new client must call
`initialize` again to establish its own set of names.

Restarting the daemon likewise resets the session — this is the
common case, since restart is typically how the operator triggers a
fresh state.
