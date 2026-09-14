# T41 Style Studio — camera handling and Reveal controls

The accepted visual direction remains the existing DeskMate graphite navigation, white workspace and pale horizontal machine. T41 changes the object behavior rather than introducing another design system.

## Physical metaphor

The machine is now the drop target, not merely the narrow card above it. During a valid drag the body settles a few pixels, the upper slot opens and the panel shows a bounded drop target. On release the card seats into the upper slot and the machine gives a quiet synthesized mechanical response. The input photograph stays readable above the body instead of floating as a separate decoration.

The output begins slightly behind the lower slot, with enough of the photograph visible to identify it. Pulling downward has a short resisted region. Crossing the detach threshold raises the photo above the Works highlight, gives a short local pop and keeps the card under the pointer until release. A valid release records that exact bounded position; `整理` is the only action that aligns all Works.

## Control hierarchy

At rest the dial remains visually primary and the style orbit is absent. Rotation reveals the ten-card orbit only temporarily. The new `积木模型` preset uses a real generated raster with the same DeskMate robot and visible interlocking studs/joints; it is not a CSS placeholder. Course notes do not enumerate a complete hidden preset library, so the product makes no claim beyond the ten visible presets.

S1 changes intensity only. S2 owns result viewing and the transition into Reveal. S8 provides an explicit rotate-and-press mode choice. The footer key legend is a compact affordance, while status text explains the active state without replacing the page.

Reveal preserves the six course modes but exposes the current state clearly: choose effect, confirm, adjust circular window, optionally adjust the effect-specific point/pixel/character/tone/line size, then reselect. The processed image is rendered to a 1000×1000 local canvas for export. Original/result comparison is side-by-side before Reveal and inside/outside in Reveal.

## Responsive behavior

The machine retains its existing smaller-window grid. Source cards, orbit cards and the eject card scale at the current breakpoints. Coarse wheel input remains page-owned and prevents vertical scroll; fine touchpad movement and controls retain document scrolling. T41 adds no horizontal overflow at 1440×1024, 1024×768 or 800×768.

## Safety and unresolved hardware acceptance

Insert/pull sounds are original bounded Web Audio oscillator envelopes and close on route teardown. No system or platform sound is copied. Image 2, local media, credential and consent boundaries remain in Electron main. The current default physical encoder press emits no host event; T41 does not pretend software has received it and does not change firmware or HID.

Frozen contract: `docs/contracts/t41-style-studio-physical-workflow-v1.md`.

