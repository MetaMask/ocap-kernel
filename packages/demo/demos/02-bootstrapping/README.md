Vats enter the ocap kernel in logical groupings called clusters.

A cluster config specifies its vats by a mapping of names to vat bundles and the parameters to pass to the `buildRootObject` function exported by those bundles.

The cluster config also specifies by name a single vat to bootstrap the cluster. This vat must declare the `bootstrap` method in its root object.

Bootstrapping takes place after every vat's root object has been built. This is the first opportunity vats in the cluster have to contact one another.

During bootstrapping, the ocap kernel calls bootstrap vat's `bootstrap` method, passing as an argument a record mapping vat names to their root objects.
