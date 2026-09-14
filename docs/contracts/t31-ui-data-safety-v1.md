# T31 UI data safety v1

Status: UI_DATA_SAFETY_V1_FROZEN

- Settings import only changes explicitly supplied configuration fields. History, diagnostics, runtime, and keyboard layout provenance remain local. Imported shared keys and encoder settings are pending user-confirmed synchronization, never direct hardware writes.
- Restore defaults restores software preferences only; history, recordings, vocabulary, keyboard mapping, credentials and memory remain intact.
- A new installation has no fabricated history. Existing histories are not removed by migration.
- History export explicitly exports private text, not recordings. Deletion requires confirmation and uses the confirmed snapshot; newly recorded entries survive. Audio deletion failure preserves the text list.
- Vocabulary JSON import validates size, item counts and string types; merges rather than replacing existing words/rules. Editable rules have stable IDs. Persistence failures are visible.
- Memory settings polling cannot overwrite unsaved edits. Failed asynchronous actions report failure.
- Nonfunctional production controls are removed, not presented as implemented. This slice does not enable new hardware, network submissions or automatic data cleanup.
- Existing 20-day memory cleanup remains limited to eligible local memory raw records. Voice history and IndexedDB recording retention require a separate tested lifecycle integration and are not claimed complete.
