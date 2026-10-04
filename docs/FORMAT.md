# TEXporter for MuseScore: supplied TonalEnergy format

TEXporter for MuseScore 1.7.2 keeps the metronome XML behavior described here. Public reference exports in `tests/references/` preserve the supplied technical fields and XML topology while sanitizing group/preset names. Untouched private originals remain in ignored local `fixtures/`; they are not published or bundled.

The first three sanitized public references are `tests/references/count-in.tetmetgroup` (19 presets), `tests/references/defaults.tetmetgroup` (30) and `tests/references/alternate-settings.tetmetgroup` (20). There is no published XML schema established by this investigation and no TE import test yet. **Minimum importer-required fields cannot be determined from exports alone.** The implementation therefore preserves the complete observed structure instead of claiming that a reduced schema is sufficient.

The additional `tests/references/tempo-ramps.tetmetgroup` supplies six presets, including three enabled tempo transitions. All four files (75 presets) now participate in structural validation. See [accelerando and ritardando findings](ACCELERANDO.md) for the exact fields, inferred positions and remaining playback questions.

`tests/references/click-patterns.tetmetgroup` adds four supplied presets, bringing structural validation to 79 presets in five files. Its second (Half-note) preset has 4/4 `beatmask=-11`, `beatmask64=18446744073709551605`: counts 2 and 4 are silent. Its third (Downbeat) preset has 4/4 `beatmask=-15`, `beatmask64=18446744073709551601`: counts 2, 3 and 4 are silent. Both have `accentmask=1`. The full-click preset uses `-1` and `18446744073709551615`. Version 1.4.0 reproduces these masks exactly for 4/4 and generalizes the requested odd-count/downbeat patterns to other numerators, resetting every bar. Only bits within the bar's numerator are changed; unused high bits stay enabled as in the fixture.

Its fourth preset directly proves 2/4 `meter=201`, `subdiv=104`, `topcount=2`, `notebase=4`. Version 1.5.0 therefore treats 2/4 as observed rather than inferred. This preset's mask `-4`/`18446744073709551612` silences both in-bar counts; its main meter map uses `beatscale=1`, so it does not itself prove quarter-BPM timing for 2/4.

Version 1.4.1 uses grouping starts for /8 accents and Half-note Met clicks. For 3+2+2 7/8, starts 1,4,6 give `accentmask=accentmask64=41` (already observed on a real 7/8 preset), Half Met `beatmask=-87`, `beatmask64=18446744073709551529`. Full retains every eighth click; Downbeat silences all except 1 and accents only 1. For 2+2+3, starts 1,3,5 give accent 21 and Half Met `beatmask=-107`, `beatmask64=18446744073709551509`. Without readable or manually entered grouping, /8 Half Met retains every eighth click. Straight suppresses accents but preserves group-start click positions. The legacy accent field is the signed low 32 bits of the unsigned decimal `accentmask64`, so the fields differ for groups extending above count 32.

## Structure

`MetroPresetGroup` is the single document root, with the group name and options as attributes. Its children appear in this order: `RandomSamplesets`, one or more `MetroPreset` elements, and `MetroCountIn`.

Each preset has 54 attributes and contains two `DroneSequencePreset` subtrees (main and count-in), a `MetroTempoMapInfo`, a `MetroMeterMapInfo` with `VoiceElements`, and a `MetroPolyMeterMapInfo` with `VoiceElements`. All five fixtures use the same preset attribute/descendant topology. The build script extracts the first sanitized defaults preset and that group's non-preset children as an ordered tree; serialization clones it per region.

Fields updated for each region:

- Preset: `name`, `usetempo=1`, `tempo`, `starting_tempo`, `transition`, `transition_anchor`, `transition_len`, `barcount`, `meter`, `subdiv`, `accentmask`, `beatmask`.
- Tempo map: the same five tempo/transition fields, plus `transition_start`, `transition_end_bar`, `transition_end_beat`. Fixed presets clear inactive transition values; `tempo_style=1` remains unchanged. Enabled ramps use the observed encodings described in [ACCELERANDO.md](ACCELERANDO.md).
- Meter map: `meter`, `subdiv`, `topcount`, `notebase`, `barcount`, `bardur`, `accentmask`, `accentmask64`, `beatmask`, `beatmask64`.
- Group: title, click accents enabled/disabled, no loop, no automatic eighth-duration conversion, native count-in enablement with Range Start mode and no drone.

Everything else is preserved, including voice data, random-silence options and nested scales. Full Met retains `beatmask=-1`, `beatmask64=18446744073709551615` for ordinary full bars; other versions silence the requested counts without changing their length. Exact-duration bars project nominal clicks into the encoded meter as described below. The 64-bit masks are **decimal strings**, never JavaScript numbers. The ES5-compatible serializer builds unsigned masks using decimal string arithmetic and supplies the corresponding signed low 32 bits for the legacy mask. Presets already have `usevoice=0`, `usemetbeats=1`, `usedrone=0`, `usePolybeat=0`, `usePolysubdiv=0`. These defaults make unrelated preserved subtrees inactive.

Version 1.3.2 uses the group's native `MetroCountIn`, without adding presets or bars. `do_countin` follows the checkbox; `countin_type=4` is Range Start, confirmed by the user against the supplied alternate-settings reference group on October 2, 2026. The user also confirmed that `unit=2`, `eighthcount=16` selects 16 eighth notes. The original alternate-settings reference mask 30037 includes an extra click at eighth position 14; the exported eight-count pattern uses the supplied count-in reference mask 21845 instead: eighth positions 1, 3, 5, 7, 9, 11, 13 and 15. Both beat-mask fields stay synchronized.

Version 1.3.3 enables count-in accents (`allow_accent=1`) with the supplied count-in reference mask 5393, accenting eighth positions 1, 5, 9, 11 and 13 as requested. Both voice masks are zero and subdivisions are disabled, giving metronome clicks only. The inactive bar/beat duration values and unused voice-set names remain preserved. Count-in settings remain configured when the checkbox is off, with only `do_countin=0`. Unknown attributes and `VoiceElements` remain intact. The [official TE guide](https://www.tonalenergy.com/tet-user-guide-ios) describes Range Start and the separate voice/metronome count-in masks; the numeric mode and duration-unit meanings come from the user's confirmed fixture settings. Device import/playback still needs verification.

## Directly observed meter pairs

| Written meter | meter | subdiv | example accentmask |
|---|---:|---:|---:|
| 1/4 | 200 | 104 | 1 |
| 2/4 | 201 | 104 | 0 |
| 3/4 | 202 | 104 | 1 |
| 4/4 | 203 | 104 | 1 or 15 |
| 6/4 | 205 | 104 | 1 |
| 8/4 | 207 | 104 | 117 |
| 7/8 | 398 | 400 | 41 |

`topcount` and `notebase` explicitly contain the numerator and denominator. Beat-unit settings vary: many main meter maps use `beatscale=0`, click-pattern reference main maps use 1, and the supplied defaults reference 7/8 main map uses 2. Poly-meter defaults use 0 but are inactive. The official [TE user guide](https://www.tonalenergy.com/tet-user-guide-ios) describes a separate BPM beat chooser. The exporter consistently uses its quarter-note setting, `beatscale=0`, and quarter BPM rather than doubling BPM in /8. Additional controlled references use that chooser explicitly to distinguish meter IDs from tempo-unit choices.

## Inferred, isolated mappings

`getMeterCode()` uses the observed `199 + numerator` family for /4 numerators 1–8. 5/4 and 7/4 remain interpolations; 2/4 is observed in click-pattern reference. For other meters it uses 398 together with explicit `topcount/notebase`, hypothesizing that 398 is a custom-meter ID. **Only 7/8 is directly observed with 398; arbitrary use remains experimental.** Every unobserved pair gets an export warning. A controlled TE export of additional meters is needed to prove or revise this mapping.

`getSubdivisionCode()` uses 104 for /4 and 400 for other denominators, based on the observed /4 and 7/8 pairings. A single /8 example does not prove that 400 is a universal straight subdivision. The code contains no invented denominator-specific ID sequence. Non-/4 encodings beyond 7/8 are experimental and warned.

`getAccentMasks()` uses 1 for downbeat-only / non-grouped meters and 0 for Straight. Grouped /8 meters accent each group start in Full and Half Met, while Downbeat stays on 1. Observed 15 = binary 1111, 117 = binary 01110101 and 41 = binary 0101001 are consistent with one bit per accented count. The generated 3+2+2 accent mask matches the real 7/8 mask 41 exactly. Straight additionally sets `accent_allowed=0`. Fixture compatibility does not establish audible playback; all patterns still need a TE import/listening check.

## Exact-duration bars (1.5.0)

Every supplied meter map uses `beatsonly=0`; `bardur` alone has unresolved semantics. The [official TE guide](https://www.tonalenergy.com/tet-user-guide-ios) documents preset modes based on meter, count or elapsed time, but does not establish their numeric XML mappings. Version 1.5.0 therefore uses the existing meter/bar structure for pickups, irregular bars and chosen held-measure durations instead of inventing beat-only field values.

An affected source bar is isolated with `barcount=1`. `topcount/notebase` encode its actual duration, retaining its nominal denominator or refining through /64 when necessary. For example, one quarter of written 4/4 becomes 1/4; one and a half quarters becomes 3/8. The preset's and meter map's meter/subdivision fields are synchronized, and `bardur=1`. Nominal meter remains in the editable source region for count interpretation. More than 64 grid positions or a duration outside the exact /64 grid stops export with its measure number; no coarsening or time rounding is applied.

Click/ accent masks project from the nominal count grid. Opening pickups align at the tail; shortened closing/interior bars align at count 1. A one-quarter 4/4 pickup represents count 4: Full has a soft click, Half/Downbeat are silent, and the accent mask is 0. A three-quarter closing bar uses original counts 1–3: Full all three, Half 1 and 3, Downbeat 1, with the original downbeat accent. A refined denominator does not create extra audible clicks. /8 grouping uses original group-start positions even when the shortened meter's numerator no longer matches the original group sum.

Required user choices for held/free-time bars either retain steady notated timing or set a whole-measure total in the field's displayed count unit, matching the selected/export meter. An extended duration cycles the nominal click pattern through its additional counts. It does not add a cue-controlled pause or a new count-in preset. All versions preserve the same actual duration and native group count-in. This encoding has automated structural/mask tests; device import and audible timing remain to be checked.

## Inconsistent or potentially stale fields

count-in reference includes `usetempo=0` presets with `tempo=110` after a 148 preset: stored tempo does not necessarily mean applied tempo. Every generated region therefore uses `usetempo=1` and writes the tempo in both locations.

defaults reference has meter-map `bardur=2` even for presets with `barcount=1`, 4, 8, etc.; alternate-settings reference also contains mismatches. Many other presets have `bardur == barcount`. The added accelerando fixture consistently uses `bardur=1` with bar counts 2 and 4, so a mismatch alone does not establish stale data. No fixture proves an independent formula or importer requirement for bardur. V1 writes bar duration equal to bar count with `beatsonly=0`; this remains an explicit, documented normalization that requires TE import confirmation.

## Controlled follow-up needed

Create the additional meters listed in [TE-REFERENCE-REQUEST.md](TE-REFERENCE-REQUEST.md), using one bar per preset, Full clicks and quarter=120 with the BPM beat chooser explicitly set to quarter notes. The exported `.tetmetgroup` provides the numeric fields needed to compare `meter/subdiv/beatscale/masks/bardur`; a score alone cannot prove TE's encoding. Then import generated equivalents and re-export them to check canonicalization and audible bar duration. /16 references are deferred for now.
