The ocap kernel supports a delegation pattern for distributing computation over a network of vats.

When Bob delegates a request, he hands off to a third party precisely the information necessary to resolve the request, including how to route the response.

To delegate Alice's request to Carol, all Bob needs to do is return a promise for Carol's response as his own.

```js
{
  request: (x) => E(carol).request(x);
}
```

When Carol completes the request, the ocap kernel will route her response to directly to Alice, evebn if Bob is busy, unavailable, or offline.

This pattern can be extended to arbitrarily complex interactions.
