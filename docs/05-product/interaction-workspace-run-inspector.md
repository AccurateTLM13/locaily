Recommended repo changes

========================



1\\. Add the detailed future build document

\------------------------------------------



```

docs/05-product/interaction-workspace-run-inspector.md

```



Suggested title:



```

\# Future Build Slice --- LocAIly Interaction Workspace and Run Inspector

```



Suggested status block:



```

\*\*Status:\*\* Planned --- deferred until core orchestration, evidence, qualification,and runtime systems are mature.\*\*Implementation authorization:\*\* Not approved for active development.\*\*Dependency rule:\*\* Do not begin this slice while core execution behavior isstill changing significantly.

```



This document should preserve:



\-   The three-panel workspace concept

\-   Local Brain conversation workspace

\-   Workbench / Run Inspector

\-   Benchmark comparison interface

\-   Track, model, node, and tool visibility

\-   Shadow-routing evidence review

\-   Qualification and enforcement controls

\-   Automatic routing as the default

\-   Local-first storage and connectivity principles

\-   `genericness/chat` as design reference only

\-   AGPL warning against direct code reuse



\* \* \* \* \*



2\\. Add it to the existing roadmap

\----------------------------------



The current roadmap already has a proper \*\*Candidate Follow-Ons (Unapproved)\*\* section for future work with no schedule commitment.



Add:



```

\- LocAIly Interaction Workspace / Run Inspector  (\[future build slice](./interaction-workspace-run-inspector.md))

```



I would place it directly after:



```

\- Operator UX improvements

```



That section would then read roughly:



```

\- Operator UX improvements (persistent provider/model config, permission review UI)- LocAIly Interaction Workspace / Run Inspector  (\[future build slice](./interaction-workspace-run-inspector.md))- Desktop Companion prototype (Tauri-first per decision)

```



\### Why Candidate Follow-Ons instead of Later / Research?



Because this interface is not speculative research. It is a likely product layer whose timing depends on the underlying systems becoming stable.



The `Later / Research` section currently contains larger architectural possibilities such as distributed execution, automatic model swapping, learning loops, and a marketplace.



The Run Inspector is closer to a deferred product build than open-ended research.



\* \* \* \* \*



3\\. Add it to the project index

\-------------------------------



The master index currently lists only the roadmap and setup flow under Product.



Add:



```

| \[../05-product/interaction-workspace-run-inspector.md](../05-product/interaction-workspace-run-inspector.md) | Future operator workspace and execution inspector | planned |

```



This gives agents a reliable path to find the concept without mistakenly treating it as active work.



\* \* \* \* \*



Where it should \*\*not\*\* go

==========================



Not `docs/07-progress/`

\-----------------------



That directory is for current build status, active sprint information, checkpoints, and agent handoffs.



Putting this there would make it look active or imminent.



Not `docs/01-architecture/`

\---------------------------



The build slice touches architecture, but it is fundamentally a \*\*product and operator-experience specification\*\*. Architecture documents should eventually describe the finalized UI-to-Local-Brain contracts, not hold an early interface concept.



Not `companion/console/`

\------------------------



The repo already has an early local validation UI in `companion/console/`. The project index also labels it as an early Validation Console.



Do not add implementation scaffolding there yet. The eventual workspace may replace it, absorb it, or become a separate desktop/browser client. That decision should happen when the build slice becomes active.



Not the decision log yet

\------------------------



This is a planned direction, not a final implementation decision. Add a decision-log entry later when choices such as these become approved:



\-   Browser app versus Tauri desktop shell

\-   Whether the current console is replaced

\-   State ownership between browser and Local Brain

\-   UI framework

\-   API and streaming protocol

\-   Whether comparison and enforcement actions are writable from the UI



\* \* \* \* \*



Recommended dependency gate

===========================



The document should say that implementation begins only after these are stable enough to expose:



1\.  Canonical Track Run Records

2\.  Shadow evidence and comparison records

3\.  Track qualification lifecycle

4\.  Enforcement-policy behavior

5\.  Runtime and node status contracts

6\.  Provider/model configuration contracts

7\.  Permission and audit behavior



That sequencing matches the roadmap's dependency-first philosophy: it explicitly avoids dates and orders work by dependencies rather than schedule promises.



Final placement

\---------------



```

docs/└─ 05-product/   ├─ roadmap.md   ├─ setup-flow.md   └─ interaction-workspace-run-inspector.md   ← new canonical document

```



Then link it from:



```

docs/05-product/roadmap.mddocs/00-start-here/project-index.md

```

