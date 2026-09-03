# T15D adjustable motion V2

Status: `T15D_ADJUSTABLE_MOTION_V2_FROZEN / THREE_END_CODE_BUILD_CONFIRMED / HIL_PENDING`

## Product behavior

The built-in dance is a normal visible selector entry and displays its actual
seven-beat program. A user may copy it or create a named 2..8 beat program,
save it, and explicitly choose **Activate as dance**. Quick-action and explicit
voice “dance” then run exactly that saved program, including its saved repeat
count. Selecting or executing an editor draft alone never changes the active
dance.

## Adjustable motion

One settings page controls all fixed quick actions, custom programs and explicit
voice actions:

| Setting | Range | Default |
| --- | ---: | ---: |
| Yaw amplitude from center | 4°..40° | 20° |
| Pitch amplitude from center | 4°..20° | 15° |
| Yaw speed cap | 20°/s..100°/s | 80°/s |
| Pitch speed cap | 20°/s..100°/s | 80°/s |

The values apply from the next physical action. Angle changes alter the target
pose; speed changes alter the maximum scheduler step for that axis. They do not
modify the editor's beat duration, which remains the hold time after arrival.

These bounds come from the inspected original board configuration: Yaw 50..130°
around a 90° center and Pitch 70..110° around a 90° center. The user values are
still logical requested maxima. Xiaozhi validates them, clamps the generated
targets through `MotionSafetyCore`, then converts through the accepted Stage 2
adapter. The UI must never claim measured shaft angle.

## Transport and lifecycle

- Host V2 keeps Feature/Input `0x1A/0x1B`; Link V2 is additive `0x26/0x27`.
- Windows sends one complete semantic program and four bounded numeric values.
- EasyInput validates, correlates and forwards; it does not time beats.
- Xiaozhi is the only trajectory, display-lease and servo owner.
- One program at a time; busy is not queued.
- Completion and stop return to center. Disconnect, reboot, fault and emergency
  stop discard remaining beats and never replay them.
- V1 profile messages remain accepted only for rollback compatibility.

## Acceptance

After separately authorized app-only updates to both boards:

1. Compare Pitch 4° and 20° on nod; the difference must be clearly visible.
2. Compare Yaw 4° and 40° on search without exceeding the original range.
3. Compare each axis at 20°/s and 100°/s.
4. Execute the visible built-in dance.
5. Save and activate one custom dance, then invoke quick and voice “dance”.
6. Stop during a dance, then run again; emergency stop must still require the
   existing explicit recovery and center transaction.
