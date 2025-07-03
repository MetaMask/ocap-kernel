## Transcript

It is often the responsibility of a well-connected vat to transfer a capability from one vat with means to another with ends.

In this demo, Bob transfers a counter from Carol to Alice.

One way to accomplish this is via proxy.

The proxy gives Bob local control over Alice's authority to Carol, but has a major drawback: if Bob is unreachable from Alice, then so is Carol('s capability).

Instead of a proxy, Bob can give Alice a direct connection to Carol, handing off all future responsibility for communicating this instance of authority.

The ocap kernel supports handoff of remotables automatically within clusters.

Now, Bob can respond to Alice's request with a remote capability that, even in his absence, she can still count on.
