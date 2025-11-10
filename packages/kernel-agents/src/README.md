# Kernel Agents

A kernel agent, [tasked](./task.ts) with an objective, attempts to fulfill the objective within the context of its available capabilities and knowledge.

So doing, the agent collects experiences, which, in addition to the objective and context of a given task, include the history of the agent's actions and observations throughout the attempt, and, if relevant, the error state or final result achieved by the attempt.

Learning from experience requires some value signal associated to said experience. None is implemented nor provided for within this package.

Although every task is defined by an objective and the context within which to attempt that objective, the attempts themselves may follow various strategies. A [strategy](./strategies/README.md) presents the task specification, together with the history of an agent's observations and actions, in a textual form that elicits useful responses from a language model.

## Implementation Sketches

An abstract agent formulation looks as follows.

```js
// A highly abstract sketch of an agent
const agent = (params) => {
  let state = initState(),
      done = false;
  const { act } = makeModel(params);
  const { observe, step, render } = makeEnvironment(params);
  for (let i = 0; i < params.maxSteps; i++) {
    const observation = observe(state);
    const action = await act(observation);
    [state, done] = await step(state, action);
    if (done) {
      return state.result;
    }
    render(state);
  }
}
```

In practice, agents are constructible from a language model by a slightly more detailed implementation. Although not an exact factorization of the generic structure given above, the broad sketch of `observe->act->step->render->repeat` remains.

```js
// A more detailed abstract sketch of an agent
const agent = ({ task, llm }, { maxSteps = 10 }) => {
  const state = initState();
  const prompter = makePrompter(state, task),
        reader = makeReader(),
        evaluator = makeEvaluator(state),
        printer = makePrinter(state);
  for (let i = 0; i < maxSteps; i++) {
    // Observe
    const { prompt, readerOptions } = prompter(state);
    // Act
    const { sample, abort } = await llm.sample(prompt);
    const action = await reader({ sample, abort, ...readerOptions });
    // Step
    const dState = await evaluator(state, action);
    state.update(action, dState);
    if (task.isDone(action, state)) {
      return result;
    }

    // Render
    printer(action, observation);
  }
}
```

For concrete implementations, see below.

- [json-agent](./strategies/json-agent.ts)
- [repl-agent](./strategies/repl-agent.ts)
