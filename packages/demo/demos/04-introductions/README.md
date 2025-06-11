Initially, vats in a cluster have no contact with one another. Their root objects are constructed in isolation.

Then, the bootstrap vat is passed a collection of all root objects, each labeled with the name of its home vat.

This is a good time to perform introductions, passing Alice a reference to Bob and Bob a reference to Alice.

Even better, the bootstrapper might introduce only a facet of each vat, limiting Bob's knowledge of Alice on a strict need-to-know basis.

Once Alice and Bob have been introduced, they can continue to communicate without the help of the bootstrapper.
