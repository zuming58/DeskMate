# T63 Style Studio restrained drag feedback v1

## Problem

Dragging a Material card toward the Style Studio machine applied a large receiving treatment to the complete lower workbench: the panel moved, gained an oversized blue ring, faded behind a dashed overlay and displayed “松开放入机器”. The feedback obscured the interface and made the stable machine look like a temporary drop box.

## Frozen behavior

- A page-owned Material drag still begins only after the existing six-pixel threshold, with one pointer-following photo ghost.
- The dragged photo ghost may lift slightly through a small offset, scale, outline and shadow.
- The upper inlet remains the only visible drop hint. It keeps a local dashed outline and gives its seated photo a restrained lift while a valid Material drag is over either accepted insertion region.
- The inlet label remains `原图进片口`; no release instruction replaces it.
- The complete lower machine does not move, scale, fade, receive an outer ring or display a dashed overlay during drag.
- Releasing over either the inlet or the complete machine still loads the exact Material and runs the existing insert pulse, sound and status.
- Explorer file drops, Material free placement/trash, result/eject behavior, provider calls, media identity and hardware routes are unchanged.

## Verification

- Source tests require the machine to remain an accepted release target without receiving a drag-state class.
- Source/CSS tests require the release copy and complete-machine receiving overlay to be absent, while the inlet and drag ghost retain bounded local feedback.
- The rendered Style Studio drag state is checked at the retained desktop viewport before handoff.
