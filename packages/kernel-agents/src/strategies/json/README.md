# Ocap Kernel JSON Agent

This strategy provides a capability interface that aligns closely with JSON tool calling generations abroad, but it relies on [JSON parsing](./sample-collector.ts) instead of special token use. The JSON agent is capable of capability composition by steps - the agent can choose to feed the result of one invocation as the arguments to another - but abstract capability composition is not supported.

## Action Space

Every step for the agent consists of a nonnegative number of thoughts followed by at least one invocation request. The thoughts are made to preceed the invocation in the transcript so that the invocation request is conditioned on the thoughts, not the other way around.

## Evaluation

Capabilities are [invoked](./evaluator.ts) by name, parsing JSON-serialized arguments and returning JSON-serialized results.
