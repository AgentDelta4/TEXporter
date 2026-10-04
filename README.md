# TEXporter for MuseScore

<img src="plugin/assets/tex-logo.png" alt="TEXporter for MuseScore logo" width="128">

**TEXporter for MuseScore**, or **TEX** for short, exports the **currently open MuseScore score** or a chosen measure range to a TonalEnergy `.tetmetgroup` metronome group. It reads time signatures, tempo, eighth-note grouping and playback-enabled gradual tempo lines, with options for ordinary repeats and section boundaries. An editable preview lets you adjust presets before export. Pitches and instrumentation are ignored. See the [logo and generation notes](docs/LOGO.md).

**[Download the MuseScore edition](https://github.com/AgentDelta4/TEXporter/releases/tag/musescore-v1.7.2)** · **[Report a bug](https://github.com/AgentDelta4/TEXporter/issues/new/choose)** · [Source code](https://github.com/AgentDelta4/TEXporter)

Current edition: **TEXporter for MuseScore 1.7.2**.

## Install

Tested API target: **MuseScore Studio 4.7.5**, checked on October 2, 2026. This uses its supported legacy QML plugin API (`MuseScore 3.0` is still the correct import name in MuseScore 4). No compilation, npm installation or plugin manifest is required.

1. Download `TEXporter-MuseScore-1.7.2.zip` from the [MuseScore release](https://github.com/AgentDelta4/TEXporter/releases/tag/musescore-v1.7.2), then extract it into your MuseScore **Plugins** folder. Find its actual location in **Edit → Preferences → Folders → Plugins** on Windows/Linux, or MuseScore's preferences on macOS. A new installation has a folder named `TEXporter`.
2. Keep `TEXporter/TEXporter.qml`, `TEXporter/lib/`, `TEXporter/ui/` and `TEXporter/assets/` together. For a source install, copy the contents of this project's `plugin/` into a folder named `TEXporter` in that Plugins folder.
3. Restart MuseScore if needed. Open **Plugins → Manage plugins**, locate **TEXporter for MuseScore**, and enable it. The category is Playback. Depending on the platform/window layout, manage plugins is also available from Home → Plugins.
4. Open a score and run **TEXporter for MuseScore** from Plugins.

**Updating a previous TEExporter installation:** retain its existing `TEExporter` folder and replace its contents with the files inside the new archive's `TEXporter` folder. After confirming `TEXporter.qml`, `lib/`, `ui/` and `assets/` are present, remove only the old `TEExporter.qml` entry point so MuseScore finds one plugin. Restart MuseScore and enable **TEXporter for MuseScore** in Manage plugins if needed. The internal settings category remains `TEExporter`, preserving saved export options. Avoid installing a second copy into a neighboring `TEXporter` folder while the old installation remains active.

For development on Windows, `tests/install-local.ps1 -Destination "<your MuseScore Plugins folder>\TEXporter"` copies the runtime files, backs up an existing installation inside this project and verifies copied file hashes. Use the Plugins location shown in MuseScore preferences. Packaging uses `pwsh -NoProfile -File tests/package.ps1`; the generated archive is placed in ignored `dist/`.

## Use

The score title supplies the default group/profile name. Choose **Straight** or **Accents**, and choose whether to combine matching consecutive measures. Disabling tempo or meter changes freezes that setting, including grouping, at the **first selected bar's** effective value.

The preview updates automatically. Names, BPM, bars, meter, ramp values and grouping update as you type, with validation and duration shown immediately. Range and structure options rebuild the preview after a brief pause; edits remain when the same region identities survive the change. Blue controls indicate the current selection. Close and reopen the dialog to start with fresh preview edits.

### Pickups, incomplete bars and holds

Pickups and other incomplete/irregular bars keep their actual duration. Each occupies its own preset. The preview retains the written meter and shows the actual count length; its Bars and meter fields are fixed. Names, BPM and /8 grouping remain editable. An opening pickup uses the final counts of its written bar: a one-quarter pickup in 4/4 represents count 4, giving a soft Full Met click and silence in Half-note/Downbeat Met. A shortened closing bar starts at count 1. The exported preset uses an exact-length meter, such as 1/4 for that pickup, without adding time before the next bar.

Detected fermatas, caesuras, breath marks with a positive playback pause, section pauses and free-time text add handling controls **inside the affected preset's preview row**. Each selected required row needs an explicit choice before export:

- **Keep steady clicks:** retain its written duration and continue the met pattern.
- **Set total counts:** enter the whole measure's total length, including the held portion, in the count unit displayed by its field. This unit follows the selected/export meter, including frozen meter settings. For example, six quarter counts replace a held 4/4 bar with six quarter counts; they do not add six counts to it.

No handling is preselected. The exporter does not infer a conductor's cue or add a silent pause. A chosen total length keeps the nominal click pattern; if it extends past a nominal bar, that pattern cycles through the added counts. Reviewed bars remain separate with Bars/meter fixed for either choice; names, BPM and /8 grouping remain editable. Changing handling or counts updates the preview automatically. Choices apply to every repeat visit to the written bar, survive changes within the current dialog, and reset when it closes. Recognized score text includes “free time,” “senza misura,” “unmetered,” “cadenza” and “ad lib.” Detection covers the containing bar; mark each affected bar in the score for a longer passage.

**Needs attention** collects optional export warnings and starts collapsed. Required timing choices appear inline in Preview; Export focuses the affected row when a choice is missing. Required hold decisions and invalid lengths block export. Actual/chosen durations must fit an exact grid through /64 and no more than 64 encoded counts without removing nominal clicks. Other lengths report the affected measure instead of rounding or stretching it.

For a small acceptance test, open [Timing.musicxml](samples/Timing.musicxml). Its four written 4/4 bars are numbered 0–3: a one-quarter pickup, a full bar with a fermata, a full bar marked **Senza misura**, and a three-quarter closing bar. Choose **Keep steady clicks** for printed bar 1 (written position 2), and **Set total counts → 6 quarter counts** for printed bar 2 (position 3). Expect four presets totaling **14 quarter counts / 7 seconds**, excluding the native count-in. The three included `Timing` groups are the reference exports; [Timing-decisions.json](samples/Timing-decisions.json) and [Timing-model.json](samples/Timing-model.json) record the choices and expected structure. The score has not yet been opened or visually/playback-verified in MuseScore; confirm the imported pickup and closing lengths before comparing exports.

Choose one or more **Export versions**:

- **Full Met** (selected by default): click on every count. Accents emphasizes 1, or the starts of the groups in /8 bars.
- **Half-note Met**: click on odd-numbered counts in other meters; in /8 bars, click on each group start. If /8 grouping is unavailable, retain all eighth clicks.
- **Downbeat Met**: click only on count 1 of each bar.

Each selected version exports a separate group and filename, such as `Score [Half-note Met].tetmetgroup`. Click **Export…** once; the save picker opens for each selected version in turn, starting in Scores and then using the previous file's destination folder. Each picker provides its own overwrite confirmation. Canceling stops the remaining exports and keeps files already saved. At least one version must be selected. These checkboxes are remembered and can be changed without losing preview edits.

The patterns restart each bar. Half-note Met in 3/4 clicks on 1 and 3. In **3+2+2 7/8**, Full Met clicks all seven eighths and accents **1, 4, 6**; Half-note Met clicks **1, 4, 6**; Downbeat Met clicks only **1**. For **2+2+3**, the group starts are **1, 3, 5**. Straight suppresses accents while keeping the chosen click positions. All versions preserve tempos, durations, repeats, names and the native Range Start count-in, which retains its own eight-click accent pattern.

The exporter detects additive time-signature text such as `3+2+2`, or a complete bar of eighth-note chords with clear beam groups. Detected grouping carries forward through sparse/rest bars until a new time signature or detected grouping replaces it. Conflicting voices, incomplete rhythms, un-beamed notes and tuplets do not provide a new grouping. Where none can be established, a warning appears and Half-note Met keeps all eighths. Enter or correct **Grouping** in the /8 preset's preview row, using `3+2+2` or `3-2-2`; its values must sum to the numerator. Clear the field to retain full eighth clicks in Half-note Met. Grouping changes create separate presets, even when tempo and meter stay the same.

`samples/Grouping.mscx` exercises 3+2+2 and 2+2+3 beam groups, inherited grouping on a rest bar, additive text on a rest bar, and a new plain signature with an unreadable rest-only grouping. Three corresponding `Eighth grouping` exports are included. Three [Example score](samples/Example.musicxml) exports are also included, labeled by met version.

The export controls include:

1. **Export range:** choose Whole score, MuseScore selection, or Measure range. Select a continuous passage before launching the plugin; partial-bar selections expand to complete bars. Manual ranges use bar positions counted from the beginning, including pickups, rather than printed measure numbers. The preview shows printed numbers. Follow repeats retains every visit to the chosen bars from the full score's repeat order, omitting surrounding bars.
2. **Live editable preview:** adjust names, bar counts, meters, starting/ending BPM and gradual-tempo placement. Source measures stay visible as a reference. Changing Bars changes exported length; it does not change the score. Bars/meter remain fixed for actual-duration and hold/free-time presets. Validation, duration and generated exports update while typing. Range/structure changes rebuild automatically and retain edited fields for regions whose identities remain stable. The built-in count-in is separate. Reopen the dialog to reset preview edits.
3. **Remembered options:** split/repeat modes, click style, combining, tempo/meter/gradual options, logging and count-in settings restore next time. The range, profile name and preview edits reset for each new dialog.
4. **Built-in count-in:** one checkbox, enabled by default, configures the group's native TonalEnergy count-in as **Range Start**, spanning 16 eighth notes with clicks on **1**, 3, **5**, 7, **9**, **11**, **13**, 15 (bold indicates accents) and no voice. It adds no presets or score bars. TonalEnergy handles it when starting the selected playback range; it does not run automatically between every section. Turning the checkbox off is remembered.
5. **Accelerando / ritardando:** enable gradual export to turn native, playback-enabled MuseScore tempo lines into TE transitions. Endpoints come from the score's playback tempo and the line's tempo-change factor. Section/range/repeat boundaries clip ramps into separate presets with matching endpoint tempos. Nonlinear score curves use a linear approximation with a warning. Disable gradual export to sample effective tempos at bar starts instead.

Gradual positions in the preview are **whole quarter beats**: Start offset is zero-based and Transition length must fit within the preset. Fractional-quarter endpoints, overlapping ramps and explicit tempo markings inside a ramp stop gradual export with an actionable error. A tempo marking at the ramp's original start or end is allowed. Duration for a ramp is a continuous linear-tempo estimate; the device's click timing may differ.

Open `samples/Advanced.mscx` to try the new controls. Its ten 4/4 bars have sections A–D, an acceleration from 120 to 160 and a slowdown from 160 to 120. Rehearsal mode produces four score presets with the group's native Range Start count-in enabled. `samples/Advanced.tetmetgroup` is the corresponding generated example.

Choose **Split presets by**:

- **Tempo / meter changes**: original behavior; combine matching measures, or disable combining for one preset per measure.
- **Rehearsal markings**: start a new preset at each measure containing a rehearsal mark. Include measures before the first mark and after the last mark.
- **Double barlines**: end a preset after a measure with a double barline. The next measure starts a new preset. Final/heavy barlines and repeat barlines do not count as double barlines.

Tempo or meter changes still start a preset in every mode. Section modes combine matching measures within each section, so the combination checkbox is enabled only in the original mode. A mid-bar rehearsal mark splits at the beginning of its containing measure; a mid-bar double barline splits after that measure, with a warning in each case. Missing selected markers produces a warning and retains tempo/meter-based splitting.

Open `samples/Sections.musicxml` to try both modes: its eight identical 4/4 bars have rehearsal marks at measures 1, 3 and 7, and double barlines after measures 4 and 8. Rehearsal mode generates 2+4+2 bars named `A`, `B`, `C`; double-barline mode generates 4+4 bars named `Top` and `5`.

Choose **Repeat handling**:

- **Follow score repeats** (default): expand ordinary repeat barlines using the score's play count. Keep separate presets at repeat starts, jumps, and exits, with **(repeat)** appended on second and later visits. A named preset becomes `A (repeat)` or `5 (repeat)`; an otherwise unnamed repeated preset becomes `(repeat)`. Every later pass gets the same suffix.
- **Ignore repeats**: export each written measure once, without repeat suffixes.

An end repeat without a start repeats from the score or current section's beginning. Explicit, adjacent repeat blocks and one-bar repeats are supported. Numbered endings/voltas, playback jumps, nested/unmatched repeats, and multiple end repeats sharing an implicit start require **Ignore repeats** in this version; Follow mode reports a clear error. Repeat play counts must be integers from 1–1000, with a total expansion limit of 100,000 measures.

The preview/result distinguish **written measures** from **measures played**. Try `samples/Repeats.musicxml`: six written bars become eight played bars with rehearsal-mode names `Intro`, `A`, `A (repeat)`, `B`. Tempo and meter use each source measure's analyzed effective settings when revisited. Repeats are emitted as a finite preset sequence, with TE group looping off.

Open **Preview** to inspect live presets and warnings without writing a file. Click **Export…** to open the save dialog in your configured **Scores** folder, with the profile filename already filled in. Every selected required row must first have a valid handling choice. Choose a destination and retain the `.tetmetgroup` extension. Preset names follow the selected boundaries: rehearsal-mark text in rehearsal mode, or just the starting measure number after a double barline. A preset starting at the score's original first bar is named `Top` if the selected mode gives it no name. This also applies in tempo/meter-only mode. Later presets created only by tempo/meter changes have an empty name. Returning to the unnamed opening on a repeat produces `Top (repeat)`. A section boundary coinciding with a tempo/meter change keeps its section name. You can change these generated names in the preview. Tempos are rounded to **two decimal places** before grouping, preview and export: `172.00002` becomes `172`, while `120.25` stays `120.25`. Tempos are **quarter-note BPM**, including in /8 meters.

**MuseScore 4.7.5 restricts plugin writes to configured content folders or the system temp folder.** The export dialog starts in the **Scores** location from **Edit → Preferences → Folders**. If MuseScore has not stored a Scores location yet, the exporter shows instructions to select that folder once in Preferences instead of guessing a location. You can also save in your configured **Plugins** folder, then move/share the file to your device if necessary. Selecting an arbitrary Downloads/Desktop folder may produce a write-blocked error. Existing-file replacement uses the native save dialog's overwrite confirmation; the exporter does not append an extension after confirmation. A wrong extension produces an error so you can choose again.

The result panel reports the destination, measure count, preset count and warnings. Enable logging to print the intermediate measures, event positions and regions to MuseScore's QML console/log output. Preview remains available without logging.

Transfer the file to your TonalEnergy device and open/share it with TE Tuner. Select the imported group and its sequence playback mode. Check its settings and listen to it before rehearsal, particularly /8 or unobserved meters. See the [official TE guide](https://www.tonalenergy.com/tet-user-guide-ios) for preset-group operation.

## What is verified

- **120 Node tests pass in 1.7.2**, exercising the same JavaScript files imported by the plugin: selection/ranges, repeat visits, preview edits, preferences, native group count-in settings, clipped gradual changes, three met versions, automatic/edited /8 grouping, exact masks for 1–64 counts, actual pickup/irregular lengths, required hold choices and the supplied transition shapes.
- The updated dialog passes the offscreen **Qt 6.10.2** smoke test, matching the installed MuseScore Qt version. Real Qt controls with API-shaped MuseScore doubles verify live option/text updates, invalid raw range input blocking stale saves, immediate Export flushing pending changes, focused grouping/counts fields retaining identity and caret, visit-specific edits alongside shared written-bar handling choices, /8 count-unit conversion and retained edits. Three-file saves, cancellation, duplicate destinations, write/readback failures, Scores paths and restored options also pass. Scoped blue components are separately checked under a yellow Windows host palette.
- .NET XML parsing and full preset attribute/child-tree comparisons against all **79 presets in five sanitized reference exports** (69 in the count-in/default/alternate-settings references, six tempo-ramp presets and four click-pattern presets). The 4/4 half-note and downbeat masks exactly match the supplied click-pattern reference export.
- A deterministic [sample group](samples/Example.tetmetgroup) implements the requested 16-measure example as three presets: eight bars of 4/4 at 120, four bars of 3/4 at 120, four bars of 3/4 at 160.
- Installed MuseScore identifies itself as **4.7.5**, and the current-release source was inspected for the APIs used.
- Installed MuseScore converted the native `Advanced.mscx` sample to MusicXML successfully, retaining ten measures, A–D, tempo markings and both gradual-line labels.

The user reports the earlier installed plugin works well in MuseScore as of October 2, 2026. Current automatic-update and inline-control checks use API doubles; live MuseScore interaction and TonalEnergy import/playback remain to be tested for 1.7.2. Fixture compatibility is structural evidence. Transition timing, subdivision and accent interpretations still need device verification. Generic unobserved meter encodings produce visible warnings.

## Limitations

Ordinary repeat barlines and play counts are supported; numbered endings and D.S./D.C./coda navigation are not expanded. Follow repeats stops with an error for unsupported navigation, even outside a chosen range, so you can select Ignore repeats. An intra-bar tempo marking takes effect at the next bar, except that a marking inside a gradual line blocks gradual export. Plain text such as “accel.” without a playback-enabled native tempo line is not converted into a ramp. Hold choices set a fixed whole-measure length rather than reconstructing an individual note's pause. Global nominal meter wins over staff-local polymeter. Grouping inference remains limited to /8. No custom accent patterns, spoken counting, drones or arbitrary subdivision selector.

Ordinary denominators 1, 2, 4, 8, 16, 32 and 64 and numerators 1–64 fit the internal model. Only the fixture meters have directly observed encodings; other meters use documented inferred mappings. TE tempo is validated to 1–1000 quarter BPM; invalid values stop export. Future parser adapters can reuse the model and TE serializer.

Additional TE exports are needed to confirm common compound, cut-time and irregular-meter encodings. See the [requested reference meters and settings](docs/TE-REFERENCE-REQUEST.md). TonalEnergy import and audio timing checks are still pending for the current version; structural tests do not establish device playback behavior.

Developed by **Skyeler Robinson**. Code written by AI. Please [report bugs on GitHub](https://github.com/AgentDelta4/TEXporter/issues/new/choose); you can also contact the developer through [Instagram @skyelerrobinson__percussion](https://www.instagram.com/skyelerrobinson__percussion/) or [sr.percussion@icloud.com](mailto:sr.percussion@icloud.com). Please include your MuseScore and TEXporter for MuseScore versions, the export settings, and any error message. The dialog footer shows the AI disclosure and plugin version, with links to [GitHub](https://github.com/AgentDelta4/TEXporter), [MuseScore downloads](https://github.com/AgentDelta4/TEXporter/releases?q=MuseScore&expanded=true) and [bug reports](https://github.com/AgentDelta4/TEXporter/issues/new/choose).

## Development and tests

Node 18 or newer, no external packages:

```powershell
node --test tests/core.test.cjs tests/features.test.cjs tests/versions.test.cjs tests/grouping.test.cjs tests/duration.test.cjs tests/holds.test.cjs tests/preflight.test.cjs
node tests/generate-sample.cjs
node tests/generate-versions.cjs
node tests/generate-grouping.cjs
node tests/generate-timing.cjs
pwsh -NoProfile -File tests/validate-xml.ps1
pwsh -NoProfile -File tests/validate-transitions.ps1
```

Rebuild the preserved defaults with `pwsh -NoProfile -File tests/build-template.ps1`. Public references are in `tests/references/`: `count-in.tetmetgroup`, `defaults.tetmetgroup`, `alternate-settings.tetmetgroup`, `tempo-ramps.tetmetgroup` and `click-patterns.tetmetgroup`. Their group/preset names are sanitized; musical settings, numeric fields and XML topology retain the supplied exports’ technical evidence. Original private exports remain unchanged locally in ignored `fixtures/` and are not included in the repository or release ZIP. See [pipeline/API notes](docs/ARCHITECTURE.md), [TE format findings](docs/FORMAT.md), [accelerando fixture findings](docs/ACCELERANDO.md) and [testing strategy](docs/TESTING.md).
