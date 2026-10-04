# TEXporter for Sibelius — INDEV

![TEXporter logo](../plugin/assets/tex-logo.png)

**Version 1.7.2-indev.1 · Based on TEXporter for MuseScore 1.7.2**

Export a score's tempo, meter, sections and playback order to TonalEnergy `.tetmetgroup` files. This is a self-contained native ManuScript plugin targeting desktop **Sibelius Ultimate**, using Avid's 2026.2 API guide. Only `TEXporter-Sibelius.plg` is needed to run it; installation does not require Node, Python or MuseScore. Node is used to build and test the source.

**INDEV: this build has not been run inside Sibelius.** The automated checks exercise the shipped code with a limited test interpreter and documented score API doubles. Sibelius syntax checking, native dialog rendering, real score analysis, TonalEnergy device import and audible playback still need live validation. Other Sibelius editions and older releases are unverified.

## Install

1. Extract `TEXporter-Sibelius-INDEV-1.7.2-indev.1.zip` and open its `TEXporter-Sibelius-INDEV` folder.
2. Save your work and close Sibelius.
3. On Windows, open `%APPDATA%\Avid\Sibelius\Plugins`, create a **TEXporter** folder, and copy **TEXporter-Sibelius.plg** into it. Keep one active exporter installation.
4. Restart Sibelius and run **TEXporter for Sibelius - INDEV** from the **TEXporter** plug-in category, or search for that name.

The included Windows installer performs the copy and verifies the installed file:

```powershell
& .\Install.ps1
```

It requires an existing Sibelius user settings folder, backs up an existing target into the extracted package's `backups` folder, and stops if it finds another exporter installation elsewhere under Plugins. It does not close Sibelius. For a different settings folder, pass `-SibeliusUserFolder 'your actual settings folder'`.

On macOS, copy the `.plg` into a **TEXporter** category beneath your Sibelius user Plugins folder, normally `~/Library/Application Support/Avid/Sibelius/Plugins/TEXporter`. Version-specific folder names may differ. Avid's [manual installation guide](https://www.sibelius.com/download/plugins/index.html?help=install) explains user plug-in categories and restarting Sibelius.

## Export

Choose a group name, range, section/repeat options and one or more met versions, then click **Continue**. Select a preset in the preview and click **Edit preset…** to change its name, meter, BPM, grouping or transition. Detected holds have timing controls in that same editing workflow. Click **Export…** after resolving required choices.

Each selected version gets its own save dialog and group title:

- `Score name [Full Met].tetmetgroup`
- `Score name [Half-note Met].tetmetgroup`
- `Score name [Downbeat Met].tetmetgroup`

The Windows save dialog starts in Sibelius's configured **Scores** folder. Avid documents that the initial-folder argument is ignored on macOS. Canceling a later save leaves earlier exported versions intact and skips the remainder.

Native checkbox and menu changes refresh the analysis automatically. **Continue** and **Export** reread text fields and validate the current options. ManuScript's native dialogs do not promise the MuseScore version's per-keystroke refresh, inline table editors, blue theme or graphical header; their appearance follows Sibelius and the operating system.

## Score structure

- Split presets by **rehearsal markings**, **double barlines**, or **tempo / meter changes**. Rehearsal sections use the displayed mark; double-bar sections use the first bar's printed number. Tempo/meter-only splits are unnamed. An unnamed original opening is **Top**.
- **Follow score repeats** uses Sibelius's playback bar order, including endings and navigation that Sibelius includes in playback. Revisited bars receive **(repeat)**. **Ignore repeats** uses each written bar once.
- Export the whole score, a continuous Sibelius passage selection, or a manual range of written bar positions. Selection fragments include complete bars. Follow repeats includes every visit to the selected written bars.
- **Combine matching measures** groups compatible consecutive bars. Turning it off produces one preset per bar in every split mode. Pickups, irregular bars and detected holds always occupy individual presets.
- Preview BPM uses quarter-note beats and rounds to **two decimal places**. Tempo and meter changes can be disabled independently. A native tempo mark inside a bar is deferred to the next bar.
- Actual pickup and irregular-bar lengths are preserved. The export may use a different denominator to represent their physical duration exactly, while keeping the intended click positions. The opening pickup uses the tail of the nominal bar. Bars and meter are fixed in the editor for partial bars and holds.
- Real manual edits survive option changes when their source span and repeat visit still match. Untouched defaults follow the new analysis. Names and BPM may differ by repeat visit; a timing choice applies to every visit of the same written bar.

## Click versions and count-in

| Version | Ordinary meter | Grouped /8 meter |
| --- | --- | --- |
| Full Met | Click each written count | Click each eighth; accent each group start |
| Half-note Met | Click odd counts | Click every group start |
| Downbeat Met | Click count 1 | Click count 1 |

**Straight** click style removes accents without changing the selected click pattern. For 3+2+2 in 7/8, Half-note Met clicks **1, 4, 6**. The existing /16 behavior is retained: Half-note Met uses odd counts; /8 grouping rules are not applied to /16.

The documented TimeSignature API has no grouping accessor. TEXporter uses complete, consistent primary-beam evidence from staff voices when available. Tuplets, cross-staff beams, incomplete patterns or conflicting evidence cannot establish a grouping. The only fallback defaults are 3/8 and compound groups of three. Ambiguous /8 bars require an explicit grouping such as `3+2+2` or `2+2+3` before export; 7/8 is never guessed.

The **Count-in (Range Start)** checkbox enables TonalEnergy's native group count-in: **16 eighth notes**, sound on **1**, 3, **5**, 7, **9**, **11**, **13**, 15. Bold counts are accented. The count-in is group metadata and creates no extra presets or score bars.

## Holds and free time

Written note/rest fermatas, bar-rest fermatas, caesura symbols and explicit free-time text require a choice before export. Supported text includes *senza misura*, *free time*, *unmetered*, *cadenza*, *ad lib.* and *ad libitum*. Page titles and ordinary breath commas/ticks do not imply a timed hold.

In **Edit preset…**, choose **Keep steady clicks** or **Set total counts**. Total counts replace the length of the complete affected bar; they are not extra counts added after it. Choose quarter, eighth, half or sixteenth-note units. Changing the unit preserves the entered physical duration. An unresolved or invalid choice blocks export before a save dialog opens.

Choices are shared across repeats of the same written bar, reset on a new plugin run, and are required only inside the export range. The exporter does not guess indefinite pauses or derive hold durations from playback time. Custom fermata artwork or text outside the supported terms may need manual review. Durations must fit an exact /64 grid with at most 64 counts; unsupported lengths produce an error.

## Gradual tempo and other limits

Native accelerando, ritardando and rallentando lines become linear TonalEnergy transitions between Sibelius playback endpoints, clipped at sections, ranges and repeats. Manual transitions use whole-quarter offsets and lengths inside the preset's actual duration. Fractional clipped positions, overlapping lines or a tempo mark inside a gradual line require editing the score or disabling gradual export.

Tempo comes from `BarObject.CurrentTempo`. When no suitable object exists, a short `Score.GetLocationTime` interval estimates it and adds a preview warning. Performance effects may affect that sample, so check the estimated BPM in the preview. The estimate does not determine a hold's length. Repeated visits use each written bar's first-pass tempo and gradual settings; pass-specific instructions or different tempo inheritance after a jump require preview adjustment. Lines disabled on the first pass are ignored. Live Tempo and other performance effects are not reproduced.

Some TonalEnergy meter/subdivision IDs remain inferred from the existing exporter mappings. Affected presets show a warning to verify them in TonalEnergy. Native playback and imported notation can differ between Sibelius versions; this INDEV build makes no blanket compatibility claim for every score.

Reusable options are stored in `TEXporter-Sibelius.settings` beside the plugin. The previous settings header is accepted when present in that file. Group names, ranges, manual preset edits and score timing choices reset for each new run. A settings-write failure does not prevent exporting. **Debug log** records intermediate analysis for diagnosis.

## Samples and live checks

The included MusicXML samples provide a starting point:

| Sample and split mode | Expected preview |
| --- | --- |
| `Example.musicxml`, tempo/meter | 8 bars of 4/4 at 120; 4 of 3/4 at 120; 4 of 3/4 at 160 |
| `Sections.musicxml`, rehearsal | A: 2 bars, B: 4, C: 2 |
| `Sections.musicxml`, double barlines | Top: 4 bars, 5: 4 |
| `Repeats.musicxml`, follow/rehearsal | Intro: 2 bars, A: 2, A (repeat): 2, B: 2 |

Imported rehearsal text must be native Sibelius rehearsal marks to split by it. The matching `.tetmetgroup` samples were generated by the shipped code through the test interpreter. `Advanced.tetmetgroup` adds section-clipped gradual transitions; recreating its score requires native marks, tempo lines and endpoint tempos. No generated `.sib` binary is supplied.

For the first live test, open `Example.musicxml`, confirm its preview and import all selected versions into TonalEnergy. Then check pickups, grouped /8 bars, a repeated hold and count-in playback. If Sibelius reports a syntax error, use **File → Plug-ins → Edit Plug-ins → Check syntax** for TEXporter and retain the exact method/line message.

## Development verification

The build combines `src/TEExporter.ms`, `src/ScoreDetails.ms`, `src/Metronome.ms` and fixture-derived XML methods from `build.cjs`. Only the resulting `.plg` is required at runtime.

From the repository root:

```powershell
node sibelius/build.cjs
node --test sibelius/tests/*.test.cjs
pwsh -NoProfile -File sibelius/tests/validate-xml.ps1
pwsh -NoProfile -File sibelius/package.ps1
```

The current suite passes **71 tests**, including exact MuseScore XML comparisons for all three met versions, 64-bit masks, durations, required choices, option rebuilding and file handling. Strict API doubles reject score mutations and missing ordinary properties. Independent .NET XML validation checks **79 sanitized TonalEnergy reference presets** against **31 native presets in 14 generated groups**, including attribute and child order and exact count-in fields.

These checks are not Sibelius's compiler or syntax checker. The interpreter implements the exercised syntax and documented left-to-right expression order, but does not fully reproduce native integer-versus-floating-point arithmetic, API object behavior or dialog rendering. Fraction-producing source expressions use explicit floating-point divisors. Live Sibelius and TonalEnergy checks remain required before calling this edition stable.

API reference: [Avid's 2026.2 ManuScript Language Guide](https://resources.avid.com/SupportFiles/Sibelius/2026.2/ManuScript_Language_Guide.pdf). TonalEnergy reference: [official TE user guide](https://www.tonalenergy.com/tet-user-guide-ios).

## Credits and support

Developed by **Skyeler Robinson**. **Code written by AI.**

[GitHub](https://github.com/AgentDelta4/TEXporter) · [Report a bug](https://github.com/AgentDelta4/TEXporter/issues) · [Instagram: skyelerrobinson__percussion](https://www.instagram.com/skyelerrobinson__percussion/) · [Email: sr.percussion@icloud.com](mailto:sr.percussion@icloud.com)

For a bug report, select the Sibelius INDEV edition and include your Sibelius version, options, written bar numbers, exact error, and a minimal score or screenshot where possible.
