# T61 Style Studio S4 layered return v1

## User correction

The on-screen and physical S4 action is labelled `收起`, but the implementation navigated to the Workbench. The user expects S4 to return to the `风格映像` surface and use the explicit top-left control when leaving for the Workbench.

## Contract

- S4 cancels an in-progress generation through the existing bounded cancellation path.
- With a result, source, prompt, consent or delete layer open, S4 closes only that layer and remains on `#/style-studio`.
- In mode selection or strength adjustment, S4 cancels only that transient editor.
- In Reveal, S4 returns to the Generate surface and resets only transient Reveal navigation state; materials, works and persisted media remain intact.
- At the base surface, S4 collapses transient orbit/comparison state, scrolls the Style Studio surface to its top and remains on the same route.
- S4 never calls Workbench navigation. `返回工作台` in the top-left toolbar remains the explicit route exit.
- S1-S3 and S5-S8, provider requests, save behavior, media persistence, input lease and firmware remain unchanged.

This supersedes the T41/T45 wording that allowed S4 to leave Style Studio. The current user correction is authoritative.
