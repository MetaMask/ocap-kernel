# Strategies

A strategy is an abstraction of a multi-agent environment that presents the history of an agent's observations and actions to a language model in a form that elicits useable responses.

#### Multi-Agent Environment

```

                         (T)
                      .- step -.
                      V        |
.------.    (Y_U)    .---------.    (X_A)    .-------.
|      | --- act --> |         | --- obs --> |       |
| User |             |   Env   |             | Agent |
|      | <-- obs --- |         | <-- act --- |       |
'------'    (X_U)    '---------'    (Y_A)    '-------'



```

Strategies respect roughly the following mapping between the arrows in the above diagram and the implementations.

| Arrow | Implementation |
| ----- | -------------- |
| $X_A$ | Prompter       |
| $Y_A$ | Reader         |
| $T$   | Evaluator      |
| $X_U$ | Printer        |

Note that $Y_U$ --- the implementation of the user's actions --- is missing from this table. User actions are theoretically represented via interjections, but the exact mechanism by which the user interleaves interjections into the history is undefined.
