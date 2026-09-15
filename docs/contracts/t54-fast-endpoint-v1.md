# T54 fast companion endpoint completion

Status: `T54_FAST_ENDPOINT_V1_FROZEN`

Windows companion only; ordinary dictation, wake, hardware and T53 early-barge thresholds remain unchanged. User explicitly chose 500 ms companion silence. New-profile defaults become 500 ms; existing saved settings are not globally migrated. Apply the user's requested 500 ms to this machine through the validated preference store after stopping its old process, preserving all other fields.

Reference comparison: T53 yields on qualified partials but `interrupt` resets their speech evidence, ignores the subsequent stop, and rearms a minimum five-second fallback on identical partials. T54 preserves the accepted current item until final/end, keeps duplicate partials from extending the deadline, and uses a 600 ms grace after provider speech-stopped. Missing-stop recovery uses a bounded 2500 ms default, not a five-second minimum. Actual continued speech progress rearms the appropriate deadline; a resumed VAD start clears stopped state and a new item cannot inherit a stopped timer. Normal final remains authoritative and cancels recovery. Only a fully provider-confirmed current text can be promoted on missing final; mutable/unconfirmed suffixes are not silently truncated or promoted. Late finals cannot create a duplicate turn.

Tests must cover duplicate partial storms, stopped/resumed/new items, long continued speech, confirmed/unconfirmed recovery, normal final cancellation, close, defaults and preserved custom settings. No fake thinking label replaces actual completion. Real 500 ms endpointing may segment hesitant speech sooner; the existing continuation/barging path and adjustable setting remain available. Report modeled deadlines separately from physical voice latency.
