# Accelerando / ritardando fixture findings

Reference: `tests/references/tempo-ramps.tetmetgroup`, containing the sanitized tempo-transition examples. Only group/preset names are sanitized; numeric transition settings, all other technical fields and XML topology are preserved. The untouched private original remains locally in ignored `fixtures/` and is not published. This reference contains six presets, all 4/4, meter 203, subdivision 104, accent mask 1 and beatscale 0. The group has `loop_presets=1`. Its preset topology matches the other references.

## Observed transition data

These are the actual `MetroTempoMapInfo` values, not settings inferred from audible playback:

| Preset | Bars | starting_tempo | tempo | transition | anchor | len | start | end_bar | end_beat |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 (unnamed) | 2 | 0 | 120 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2: whole-preset ramp | 4 | 120 | 160 | 1 | 0 | 16 | 0 | 0 | 15 |
| 3 (unnamed) | 2 | 120 | 160 | 0 | 0 | 0 | 0 | 0 | 0 |
| 4: initial ramp | 4 | 160 | 120 | 1 | 0 | 6 | 0 | 0 | 5 |
| 5 (unnamed) | 2 | 120 | 120 | 0 | 0 | 0 | 0 | 0 | 0 |
| 6: ending ramp | 4 | 120 | 160 | 1 | 1 | 6 | 10 | 0 | 15 |

`starting_tempo`, `tempo`, `transition`, `transition_anchor` and `transition_len` are duplicated on the containing `MetroPreset`, and match the tempo-map values for every preset. The position fields `transition_start`, `transition_end_bar` and `transition_end_beat` occur only in the tempo map. `tempo_style=1`, `tempo_adj=0` and preset `tempo_adjust_ratio=1` are unchanged across all six presets.

## Supported inferences

- `transition=1` identifies the three ramp examples. Increasing versus decreasing endpoint tempos distinguish acceleration and slowing without a different transition code in this fixture.
- `starting_tempo` is the initial tempo and `tempo` is the target for the enabled ramp examples. A nonzero `starting_tempo` also remains on fixed presets; it alone does not enable a ramp.
- `transition_len` is consistent with a count of quarter-note beats in this 4/4 fixture: 4 bars × 4 beats = 16. The other ramps cover six positions, not six bars.
- Positions are consistent with zero-based, inclusive beat indices: `end_beat = start + len - 1` for each enabled ramp. The full example spans 0–15; the first portion spans 0–5; the ending portion spans 10–15.
- `transition_anchor=0` accompanies start-position zero. `transition_anchor=1` accompanies the six-position ending ramp. For a 16-position preset, `16 - 6 = 10`, exactly the stored start.
- Both partial ramps cover more than one bar and end at different locations relative to a bar. This supplies evidence for transition placement inside a metronome preset, beyond a single tempo at each measure boundary.

These observations establish a coherent candidate encoding for the supplied 4/4 cases. They do not establish the tempo interpolation curve, whether the first/last clicks reach the stated endpoint BPM, or whether duration denotes six intervals versus six clicked positions. They also do not prove units for /8 meters or alternate beat bases. `transition_end_bar=0` even in the 16-position example means it cannot safely be interpreted as the literal ending bar index here.

## Additional duration evidence

Every meter map stores `bardur=1`, despite `barcount=2` or 4. This strengthens the evidence that `bardur` need not equal preset bar count. Calling all mismatches stale would be premature. Its import semantics remain unresolved; V1's existing normalization to `bardur=barcount` remains a documented assumption, not a proven requirement.

## Consequences for the exporter

Version 1.3 exports playback-enabled native MuseScore gradual-tempo lines as transitions. The reader obtains exact spanner positions and playback factor through the v4.7.5 API. The initial tempo is the effective playback tempo at the line's start; the target is initial × factor. The line is projected onto selected measures, clipped at section/range/meter/repeat boundaries and merged when it covers adjacent full bars with continuous endpoints.

The serializer writes `starting_tempo`, target `tempo`, `transition=1` and the quarter-beat length to both duplicated locations. It stores zero-based start and inclusive end (`start + length - 1`) in the map, retaining `transition_end_bar=0`. An ending partial transition uses anchor 1; other placements use anchor 0. Tests reproduce all eight relevant fields of the three supplied 4/4 ramp shapes exactly. Non-/4 meters and nonzero starts that do not end with the preset produce an inference warning.

Fixed presets explicitly clear `starting_tempo`, transition enablement, anchor, length and positions. Their tempo still appears in both locations. The full observed schema and unrelated subtrees remain preserved.

Supported positions are whole quarter beats within a preset. Fractional-quarter endpoints, overlapping lines and explicit tempo markings inside a line stop gradual export for affected selected bars. Original endpoint markings are allowed. Disabling the gradual option restores bar-start sampling. Nonlinear MuseScore curves warn and use a linear approximation. Plain text alone is not a ramp.

The preview supports editing endpoints and placement. Its duration integrates a continuous linear BPM change over quarter-beat position, plus any fixed portions before and after the ramp. This is an estimate, not a verified model of TE's discrete click or endpoint convention. Generated transition fields are structurally tested; audible ramp behavior remains unverified.

## Remaining verification

1. Confirm that the intended TE settings for these three transition presets were a whole-preset ramp, the first six beats and the final six beats. The original preset labels supported this reading but did not independently prove playback behavior.
2. Listen to or capture click timestamps for these presets to identify the interpolation and endpoint convention.
3. Export otherwise identical two-, three- and five-beat transitions, including a nonzero start offset, and compare the fields.
4. Repeat a controlled ramp in 7/8 and with a changed BPM beat chooser to distinguish quarter-beat, denominator-unit and subdivision-position counts.
5. Change only the bar count and re-export to investigate `bardur`; import and re-export a V1-generated group as well.
