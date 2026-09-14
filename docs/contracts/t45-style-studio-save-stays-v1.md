# T45 Style Studio save-stays contract

Status: `DESKTOP_IMPLEMENTED`, physical confirmation pending  
Date: 2026-09-14

## Behavior

- S3 exports the active generated work or the current Reveal canvas.
- Opening and closing the native Save dialog must not navigate away from `#/style-studio`.
- Saving must preserve the active result, Generate/Reveal mode, selected effect, comparison state and current parameters.
- Cancelling the native Save dialog must likewise leave the Studio route and state intact.
- S4 remains the only physical S key that closes the current overlay or leaves Style Studio.

## Boundaries

This is a renderer navigation correction only. It does not write the EasyInput configuration or NVS, flash firmware, change the Image 2 request, alter media persistence, or change S3/S4 behavior outside the focused Style Studio lease.

## Verification

Automated source and package checks require the S3 handler to call the export routine without a dashboard-navigation argument. Physical acceptance is: enter Style Studio, press S3, close the Save dialog by saving or cancelling, and observe that Style Studio remains visible with the prior editing state.
