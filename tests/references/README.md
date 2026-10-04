# TonalEnergy test references

These five files derive from user-supplied TonalEnergy metronome exports used during TEXporter development. Group titles and score-specific preset names have been replaced with neutral labels. Descriptive click-pattern and tempo-ramp labels remain because the tests identify those cases by name.

All other XML attribute values, attribute order, element order and subtree structure are preserved. The references contain 79 presets in total. Original exports remain outside the public repository.

| Reference | Presets | Coverage |
| --- | ---: | --- |
| `count-in.tetmetgroup` | 19 | Native count-in masks and group/preset structure |
| `defaults.tetmetgroup` | 30 | Preserved serializer defaults, meters and subtree structure |
| `alternate-settings.tetmetgroup` | 20 | Additional meter/preset settings and structure |
| `tempo-ramps.tetmetgroup` | 6 | Full-bar, initial-portion and end-anchored transitions |
| `click-patterns.tetmetgroup` | 4 | Full, half-note and downbeat masks, including the observed 2/4 meter |

`tests/build-template.ps1` uses `defaults.tetmetgroup` to regenerate `plugin/lib/Template.js`. XML and transition validators also use these references, so automated tests do not need the private original exports. Matching an exported XML structure does not establish TonalEnergy import or audible playback behavior; see [testing notes](../../docs/TESTING.md).
