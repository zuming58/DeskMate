# T63 Style Studio drag feedback review

## Outcome

Material dragging now keeps visual feedback on the object being moved and the upper inlet. The lower machine remains a stable work surface instead of changing into a full-panel drop box.

- Removed the machine `is-receiving` class and its lift, scale, outer ring, faded dashed overlay and `松开放入机器` copy.
- Kept the complete machine as a valid coordinate-based release target.
- Kept the upper inlet dashed hint, restored the static `原图进片口` label and added a small four-pixel lift to its photo.
- Reduced the pointer ghost to a three-pixel lift, 1.018 scale and two-pixel halo.
- Explorer drops, free placement, deletion, generation, media identity and hardware/input routing are unchanged.

## Verification

- Focused Style Studio/build-identity tests: 31/31.
- Complete test suite: 849/849.
- Native InputBridge publish, Vite production build and Windows directory packaging passed.
- Exact T63 package resource verifier, T58+ final-ASAR dance lifecycle and T53 final-ASAR voice/reminder checks passed.
- Final packaged-ASAR pointer probe: one ghost, local inlet highlight, machine opacity 1/transform none, no machine receiving state, static inlet label, successful release/insertion and zero renderer errors.
- Final packaged functional Style Studio probe passed insert, synthetic generation, ejection, Works placement, deletion and input-lease release with zero renderer errors.
- Visual comparison and fidelity surfaces: [`design-qa.md`](../../design-qa.md), `final result: passed`.

No paid provider request, retained user-media mutation, hardware command, firmware write or profile reset was used. The user's later screenshot containing `{"detail":"Bad Request"}` did not coincide with a new Style Studio generation-journal entry and cannot be assigned to Image 2 without the action that produced it.
