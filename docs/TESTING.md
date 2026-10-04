# TEXporter for MuseScore: testing and runtime checks

## Automated checks

`node --test tests/core.test.cjs tests/features.test.cjs tests/versions.test.cjs tests/grouping.test.cjs tests/duration.test.cjs tests/holds.test.cjs tests/preflight.test.cjs` tests the shipped ES5-style JavaScript modules through a Node VM, with no QML-specific rewriting. Core coverage includes grouping, observed/inferred meters, quarter BPM, two-decimal rounding, accents, duplicated fields, preserved defaults, deterministic output, XML escaping, invalid inputs, Scores paths and API-shaped score-reader behavior. Feature coverage includes exclusive-end selections and partial bars, range validation/frozen settings, filtered repeat visits, edited presets and source immutability, approximate ramp duration, native Range Start count-in enablement/duration/click masks with unchanged preset order and bars, malformed preferences, clipped ramps, playback-disabled lines, nonlinear warnings, invalid ramp spans/overlap/internal markings, and exact transition-field matches to all three supplied ramp shapes. Version tests compare 4/4 masks exactly with click-pattern reference, test every numerator from 1–64 against a BigInt oracle, check mixed meters/repeats, preserve the full count-in and ramps, and verify filenames, selection subsets, defaults and saved false values.

Version 1.7.2 has **120 passing JavaScript tests**. Coverage checks exact pickup/irregular duration, tail-aligned pickup clicks, count-one closing-bar clicks, projected /8 group accents, fractional-count refinement, unsupported duration errors, locked preview lengths, stable decision boundaries, duration-preserving repeat visits and meter-freeze compatibility. Hold-reader tests exercise native fermatas, caesura symbols, positive breath pauses, section pauses, text recognition and musical BPM recovery. Preflight tests verify explicit selected-bar decisions, duplicate-number/repeat handling, total-count units and exact 64-position limits, unchanged source data, scoped attention and cleared manual grouping warnings. 2/4 meter/subdivision IDs are checked against the observed click-pattern reference pair.

`node tests/generate-sample.cjs` produces the 16-measure example, section/repeat samples and the native ten-bar `Advanced.mscx` with gradual lines, its inspectable model and its four-preset group with a native Range Start count-in. `tests/validate-xml.ps1` uses the .NET XML parser to check the root, group children, nonempty preset list, required fields and valid numeric values. It compares **every preset's ordered child/attribute-name topology against every preset in all five sanitized public references**, then verifies unchanged preset attributes and complete drone/poly subtrees against the sanitized template source. Public references are in `tests/references/`; only group/preset names are sanitized. Technical fields and ordered topology are preserved, while original private exports remain unchanged in ignored local `fixtures/`. It also checks synchronized tempo/transition fields, native count-in mode/unit, eight click positions and disabled voice masks.

Run in this order from the project directory:

```powershell
node --test tests/core.test.cjs tests/features.test.cjs tests/versions.test.cjs tests/grouping.test.cjs tests/duration.test.cjs tests/holds.test.cjs tests/preflight.test.cjs
node tests/generate-sample.cjs
node tests/generate-versions.cjs
node tests/generate-timing.cjs
pwsh -NoProfile -File tests/validate-xml.ps1
pwsh -NoProfile -File tests/validate-xml.ps1 -Output samples/Advanced.tetmetgroup
pwsh -NoProfile -File tests/validate-transitions.ps1
```

The repository's sanitized reference XML is test data and is excluded from the runtime release ZIP. The parser never runs its content as code. The template-generation script uses XML element names, not the XML `name` attributes.

The transition-reference check parses the added accelerando fixture, checks the three named ramps and duplicated tempo fields, and records their inclusive-position relationship. It verifies reference data rather than asserting a playback curve. See [transition findings](ACCELERANDO.md).

## Offscreen QML check

For TEXporter for MuseScore 1.7.2, the runtime entry is `plugin/TEXporter.qml`, with its accompanying `lib/`, `ui/` and `assets/`. Check that the logo renders, the displayed name/version is correct, and the unchanged `TEExporter` settings category restores an existing installation's options. A fresh ZIP must contain `TEXporter/TEXporter.qml` and those three directories, with no legacy QML entry. After migrating the existing `TEExporter` installation folder, confirm only one TEXporter for MuseScore menu entry appears; enable it after restart if required. These installation/menu checks require live MuseScore.

`tests/qml-smoke.py` loads the actual plugin QML and JavaScript in Qt 6.10.2, matching the installed MuseScore Qt version. MuseScore, Settings, FileDialog and FileIO use API-shaped doubles. It creates real Qt controls and table delegates and captures both tabs. The updated **1.7.2 smoke test passes**, covering live text/option updates, automatic range rebuilding, stable-region edit preservation, invalid raw range input blocking stale saves after blur, immediate Export resolving pending changes, and focused counts/grouping fields retaining control identity and caret. It verifies visit-specific name/BPM edits alongside shared written-bar handling choices, required inline decisions before any picker, selected-range requirements, invalid count rejection and /8 count-unit/meter conversion preserving physical duration. Settings restore and choices reset in a new dialog. The same three-file save, cancellation, duplicate-destination, extension, write/readback and retained-edit cases pass. The removed Analyze/reset and manual declaration actions are absent. Generated screenshots/XML are in ignored `tests/generated/`; these are API doubles, not live MuseScore execution.

The scoped components in `ui/` use `QtQuick.Templates` to keep blue controls consistent across host styles. A separate Qt check with a yellow Windows host palette verifies blue checked indicators and focus/selection states. This checks the control rendering; installed MuseScore interaction still requires the manual smoke test.

The optional official test dependencies are isolated in ignored `research/qt-runtime`; they are not included in the plugin ZIP or required to use the plugin:

```powershell
python -m pip install --target research/qt-runtime PySide6-Essentials==6.10.2 shiboken6==6.10.2
python tests/qml-smoke.py
$env:QT_QUICK_CONTROLS_STYLE = 'Windows'
$env:TEX_SMOKE_YELLOW_PALETTE = '1'
python tests/qml-smoke.py
pwsh -NoProfile -File tests/validate-xml.ps1 -Output tests/generated/UI-test.tetmetgroup
pwsh -NoProfile -File tests/validate-xml.ps1 -Output tests/generated/UI-Timing.tetmetgroup
```

The full 1.7.2 smoke suite passes with both Basic styling and Windows styling with a deliberately yellow host palette. It checks keyboard tabs, checkboxes/radios and dropdown selection, blue focus/selection colors, and right/bottom scrollbar geometry and visibility. Style-specific screenshots are retained alongside the generated XML. Footer links use styled text so their explicit blue color also survives the host palette.

The native Advanced sample was separately converted by installed MuseScore 4.7.5 to MusicXML. The output retained ten measures, rehearsal labels A–D, 120/160/120 tempo markings and accel./rit. labels. This verifies sample acceptance, not the live plugin's API interactions.

## MuseScore smoke test (not yet performed)

For the 1.7.2 live preview workflow:

1. Open the dialog and Preview. Rows should appear automatically, with no Analyze/reset button or manual hold/free-time button. Confirm blue checked, selected and focused control states are readable in the installed theme.
2. Type a name, BPM, Bars, meter, ramp offset/length and /8 grouping. Each valid change must update validation, approximate duration and pending output while the field still has focus. Delete a required numeric value or enter an invalid grouping: an error must appear and Export must not save an earlier valid snapshot. Correct it without leaving the field and confirm recovery.
3. Change range and structure options. After the brief debounce (about 150 ms), the row structure must update without another action. Names/BPM and other edited fields should survive when written source membership and visit identity stay the same. Splitting, merging or changing selected bars can create new row identities; verify their defaults and resulting musical structure. Changing met versions alone should retain edits.
4. Open `Timing.musicxml`. Handling controls must appear inline only on the fermata and Senza misura rows, initially with no choice. Export must remain blocked until both selected requirements have valid explicit choices. Select steady on the fermata and six total quarter counts on Senza misura: the displayed timing and output must update automatically to the reference seven-second program.
5. Add an ordinary repeat around a detected hold. Changing one visit's inline handling choice must apply the same written-bar decision to every visit; name/BPM edits should remain tied to their own region. Changing the export range should require only selected holds. There must be no separate timing panel or manual declaration workflow.
6. Enter an invalid total count length, correct it, and switch handling modes. Check immediate validation/recovery, fixed Bars/meter for affected rows, current exported duration and unchanged native count-in. Unmarked free-time bars receive no special controls; mark the relevant bars in the score and reopen the plugin to detect them.
7. Change an option and immediately click Export: the file must use the latest option/preview state after pending rebuilding is resolved. Close/reopen to reset preview edits and timing choices; saved general options must still restore.

These are acceptance expectations. Live MuseScore/TE execution has not been claimed for the new workflow.

For the new 1.5.0 behavior, use a real score and check:

`node tests/generate-timing.cjs` creates a deterministic acceptance pack: `samples/Timing.musicxml`, model/decision JSON references and three `Timing` met versions. The score's actual written lengths are 1+4+4+3 quarter counts. Select **Keep steady clicks** for printed measure 1 / written position 2, and **Set total counts: 6 quarters** for printed measure 2 / written position 3. The reference export is 1+4+6+3 = **14 quarter counts, 7 seconds** at quarter=120, excluding the unchanged native count-in. Expect four presets encoded as 1/4, 4/4, 6/4 and 3/4. In the 6/4 encoded bar, Full accents counts 1,5; Half clicks 1,3,5; Downbeat clicks 1,5, retaining the original 4/4 pattern cycle. The pickup is a soft Full click and silent in Half/Downbeat. The generator asserts these masks and identical count-in data across versions. XML parsing and duration checks do not prove MuseScore import layout or TE playback; neither has been run for this score.

1. Create a one-quarter 4/4 pickup, two full 4/4 bars and a three-quarter closing bar at quarter=120. Expect four written bars, three presets with encoded lengths 1/4, two bars of 4/4 and 3/4, and six seconds total excluding count-in. The preview retains written 4/4 and shows actual lengths. Bars/meter are fixed for the short presets; name/BPM edits remain available.
2. Export all three versions. The pickup represents original count 4: Full one soft click, Half/Downbeat silent. The closing bar starts at original count 1: Full clicks 1–3, Half 1 and 3, Downbeat 1. Confirm the next full bar starts on time in TE. Try a two-eighth pickup into 3+2+2 7/8: original counts 6–7 should give Full both eighths, Half only the first, Downbeat silence, with the group-start accent preserved.
3. Add a fermata, caesura, positive breath pause, section pause and free-time text in separate bars. Every selected affected preset row must show inline handling controls with no initial choice. Export must require a choice before opening a save picker. Select **Keep steady clicks** explicitly and verify nominal timing. Change one to **Set total counts**: six quarter counts for a held 4/4 bar should last three seconds at quarter=120, with the original count pattern cycling after count 4. The field's unit must match the selected/export meter, including a frozen meter.
4. Enter invalid lengths: empty, zero, negative, more than 64 required grid positions, or a fractional value outside the /64 grid. Expect an affected-measure error and no file. Test a half-quarter-compatible length, such as 1.5 quarter counts: it should encode 3/8 without adding clicks on refined subdivisions. No silent conductor-cue pause should be invented.
5. Confirm reviewed bars remain separate and Bars/meter stay fixed for both choices. Edit a row's name/BPM/grouping, then change its handling choice; those edits should remain tied to the same source bar and repeat visit. One written-bar choice must apply to every repeat visit. Printed numbers that restart must not share a choice accidentally. An unselected held bar should not require a decision.
6. Add recognized free-time text to the score's containing bars, including every affected bar in a longer passage, and reopen the plugin. Detected rows must expose inline handling choices; there is no manual declaration action. Close/reopen again: choices must reset; general options must still restore. Check that attention is collapsed when no review is needed and that fixing grouping removes the corresponding warning.
7. Disable meter changes in mixed 4/4→3/4 material: ordinary later bars should use full frozen 4/4 timing, while genuine source pickup/irregular lengths and explicit hold totals remain exact. Mid-bar tempo markings must still defer to the next measure. First/second endings and /16 grouping behavior must remain unchanged.

The user will perform real-score and device testing later. These instructions describe expected results, not completed live validation.

For the five new features, open `samples/Advanced.mscx` and run the installed plugin:

1. Choose rehearsal splitting, gradual export and enable the eight-count count-in checkbox. The preview should update automatically to four editable score rows and four exported presets, with no extra bars. The group must have native count-in enabled in Range Start mode. Section A accelerates 120→160 over four bars; C slows 160→120 over two.
2. Edit A's name, start BPM and bar count. Confirm duration changes while typing. Export the current preview and inspect the saved edited values. Empty Bars, an unsupported denominator or an overlong ramp must block export; fix them and retry. Close/reopen deliberately resets edits.
3. Export range bars 2–3: expect a clipped two-bar ramp 130→150, with no Top name. Select a partial passage in MuseScore before launching, choose MuseScore selection and confirm complete-bar expansion. Also select bars inside the repeating sample: Follow mode must retain both visits.
4. Turn the count-in checkbox on/off. Exported preset counts, order, bars, meters and tempos must be identical; only native count-in enablement changes. Group settings must show Range Start, 16 eighths and eight metronome clicks without voice.
5. Close/reopen: reusable options must restore, including false checkboxes. Ranges, profile names and table edits must reset. Disable gradual export for bar-start sampling, and test a playback-disabled line, nonlinear easing, overlap and fractional endpoints. Confirm explanatory warnings/errors.

For section splitting, open `samples/Sections.musicxml`. In rehearsal mode expect presets m.1–2, m.3–6, m.7–8 named A, B, C; in double-barline mode expect m.1–4 and m.5–8 named Top and 5. Settings mode should give one eight-bar preset named Top. Add a tempo or meter change inside a section and verify an additional preset. Check duplicate staff rehearsal marks/barlines produce one boundary, and that a final or repeat barline does not split double-barline mode. The automated reader/model tests cover these boundary rules, but the dialog and live MuseScore API still require this smoke test.

1. Install the packaged plugin with its complete `lib/`, `ui/` and `assets/` folders. Open `samples/Example.musicxml` in MuseScore 4.7.5.
   Turn count-ins off for the original example checks below.
2. Run TEXporter for MuseScore. Expect 16 measures and three regions (8 bars 4/4 120; 4 bars 3/4 120; 4 bars 3/4 160). Confirm the dialog loads without QML errors.
3. Disable combining: expect 16 presets. Disable tempo changes: expect initial tempo throughout; disable meter changes: expect initial 4/4 throughout. Re-enable all options.
4. Choose each click style and preview. Click Export and confirm the save picker opens in the configured Scores folder with a sanitized `.tetmetgroup` filename. Change Preferences → Folders → Scores to another folder, reopen the exporter and confirm it follows that location; restore the preference after testing. Export into the configured Scores folder. Confirm path/counts/readback success. Cancel the picker and verify no file was written. Choose a wrong extension and verify a clear error. Replace an existing output and confirm native save-dialog confirmation.
5. Try names with ampersands, quotes and Unicode. Open a score with multimeasure rests, a hidden tempo marking, dotted-quarter tempo, pickup and a mid-bar tempo change. Confirm accurate counts/BPM and visible limitations.
6. Test first-staff full rests and empty voices; cursor position must still exist at each bar start. Compare QML-logged intermediate data to the score before blaming TE serialization.
7. Launch without a score: the host should require one. Check runtime version handling and local/poly-meter warnings.

## TonalEnergy smoke test (not yet performed)

1. Import `samples/Example.tetmetgroup` and verify group title, three presets named Top, empty, empty, tempos, meters and bar counts. Enable sequence playback.
2. Time the program: 8 × 4 beats at 120 = 16 s; 4 × 3 at 120 = 6 s; 4 × 3 at 160 = 4.5 s. Expected total 26.5 seconds, excluding device start latency; no count-in or looping.
3. Verify straight clicks have no downbeat emphasis and downbeat mode accents only the first beat of each bar. Check no drones, spoken counting or random silence.
4. Generate and import one-bar 6/4, 8/4 and 7/8 programs. For quarter=120, a 7/8 bar should last 1.75 seconds. Confirm whether subdivision 400 delivers the intended straight clicks.
5. Import an unobserved meter (5/4, 6/8, 3/2, etc.). Inspect the UI and listen to it; revise isolated mappings if the inferred custom meter/subdivision does not behave correctly.
6. Re-export imported groups and compare fields. Do not interpret successful XML parsing alone as successful TE import or timing validation.
7. Import `Advanced.tetmetgroup`. Expect only A, B, C and D in the preset list. Group count-in must be enabled with Range Start and a duration of 16 eighths, with clicks at 1, 3, 5, 7, 9, 11, 13 and 15, accents at 1, 5, 9, 11 and 13, and voice disabled. Select a range starting at B, start/stop/restart and verify the native count-in runs at the selected range start. Confirm normal section transitions introduce no artificial count-in presets. Inspect starting/target BPM, listen to both ramps and confirm placement/endpoints. The displayed duration estimates score playback only.

## Validation status

The **120 JavaScript tests and updated Qt 6.10.2 smoke test pass for 1.7.2**. Scoped blue rendering also passes under a yellow Windows host palette. The three generated met versions match the complete preset topology of 79 presets across five sanitized reference exports. Current QML coverage includes automatic preview updates, focus/caret preservation, inline timing choices, stale-range protection, immediate export flushing and the existing three-file save/error cases. Installed version, official API implementations and native sample acceptance were verified previously. The user reports the earlier installed plugin works well in MuseScore; live MuseScore/TonalEnergy checks remain pending for the new workflow. Automated doubles and XML checks do not establish device timing.

For 1.4.1, select all three versions in MuseScore and export. Expect three pickers and independently labeled files. In TE, compare 3/4: Full clicks every count, Half clicks 1,3 and Downbeat only 1. For 3+2+2 7/8, Full clicks every eighth and accents 1,4,6; Half clicks 1,4,6; Downbeat only 1. For 2+2+3, group starts are 1,3,5. Clear Grouping: Half must retain every eighth. Musical length, names, repeat order and tempo ramps must match between versions, with a separate preset at each grouping change. The native Range Start count-in must remain unchanged.

The grouping tests cover additive signatures on rest-only bars, complete native beam-mode grids, manual beam membership, inherited grouping, conflicting voices, sparse rhythms, tuplets and un-beamed notes, grouping-only region splits, meter freezing, repeat visits, manual edits and exact high-bit accent masks through count 64. The Qt test calls real QObject-shaped `actualBeamMode(bool)` methods and verifies automatic 3+2+2 / 2+2+3 detection, an inherited rest bar, grouping-field validation and three grouped outputs. Their XML is checked against all 79 reference presets. These are API doubles, not live MuseScore plugin execution.

`node tests/generate-grouping.cjs` creates `samples/Grouping.mscx` and three corresponding groups. A headless native conversion attempt stalled and was stopped; the sample and live grouping detection still need an in-app check. Open that score: expect groups 3+2+2 at bar 1, 2+2+3 at bars 2–3, 3+2+2 from additive text at bar 4, and an unreadable grouping at bar 5. Half Met must retain all eighths at bar 5 unless a grouping is entered in preview. Test default beaming, manually changed beams and additive signatures in a real score, then import/listen in TE.

Naming checks cover plain/escaped rehearsal text, score measure-number offsets, unnamed tempo/meter splits, the Top fallback for an unnamed first bar, pickups and numbering offsets, preservation of existing first-bar names, Top (repeat) on opening repeats, coincident section/settings changes and empty name attributes in serialized TE XML. These run as part of the core tests.

The next controlled TE references are listed in [TE-REFERENCE-REQUEST.md](TE-REFERENCE-REQUEST.md). They use one bar per preset and explicit quarter=120 to separate meter/subdivision mappings from BPM beat-unit settings. Already observed pairs, including 2/4 from click-pattern reference, do not need duplicate fixtures. /16 references are deferred.

## Repeat tests and smoke test

Ten additional tests cover play counts, implicit score/section starts, one-bar and adjacent blocks, Ignore mode, unchanged source data, repeat naming/merging, source double-barline names at jumps, invalid navigation/counts, expansion limits and reader metadata. They exercise the shipped RepeatOrder and Model modules together, including TE output with (repeat) names.

Open `samples/Repeats.musicxml` in MuseScore. Follow repeats with rehearsal splitting should report six written measures, eight played measures, and four two-bar presets: Intro (m.1–2), A (m.3–4), A (repeat) (m.3–4), B (m.5–6). Ignore repeats should give three two-bar presets and six played measures. With double-barline splitting, expect Top, 3, 3 (repeat), empty. Change the repeat play count to three and verify another A (repeat) preset. Import the generated sequence into TE and confirm each pass lasts the requested bars and the group stops after the tail. At quarter=120 in 4/4, the eight played bars last 16 seconds, excluding start latency.

Also try an implicit opening repeat, a one-bar repeat, adjacent explicit blocks, and a fresh tempo/meter change after a repeated passage. Add a numbered ending or jump: Follow mode must report an unsupported-navigation error; Ignore mode must remain available. These live integration checks have not yet been performed.
