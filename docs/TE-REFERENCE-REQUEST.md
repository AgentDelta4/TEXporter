# TEXporter for MuseScore: TonalEnergy reference meters

Please create one metronome preset group **inside TonalEnergy** with the presets below and export it as `.tetmetgroup`. Its XML is needed to verify TE's numeric meter, subdivision and beat-unit fields. A MuseScore score or screenshot helps explain intent but does not provide those stored numeric mappings.

For every preset, use **one bar**, **120 quarter-note BPM**, the BPM beat chooser set explicitly to **quarter notes**, and **Use Tempo enabled**. Use Full Met clicks on every count, with accents only on count 1 or the specified group starts. Disable extra subdivisions, spoken counting, drone, random silence and tempo transitions. Count-in can be off for timed comparisons. Label each preset with its meter and grouping.

| Preset | Grouping / accented counts | One-bar duration at quarter=120 |
|---|---|---:|
| 5/4 | Accent 1 | 2.5 s |
| 7/4 | Accent 1 | 3.5 s |
| 2/2 | Accent 1; two half-note clicks | 2 s |
| 3/2 | Accent 1; three half-note clicks | 3 s |
| 3/8 | 3; accent 1 | 0.75 s |
| 5/8 — 2+3 | Accent 1, 3 | 1.25 s |
| 5/8 — 3+2 | Accent 1, 4 | 1.25 s |
| 6/8 — 3+3 | Accent 1, 4 | 1.5 s |
| 9/8 — 3+3+3 | Accent 1, 4, 7 | 2.25 s |
| 12/8 — 3+3+3+3 | Accent 1, 4, 7, 10 | 3 s |
| 7/8 — 2+2+3 | Accent 1, 3, 5 | 1.75 s |

For /8 meters, keep all eighth-note clicks audible; grouping changes accents only. For /2 meters, half-note counts are one second apart at **quarter=120**. Keep the BPM chooser at quarter rather than changing it to half=120. The durations above exclude count-in and device start latency.

Optional additions:

| Preset | Grouping / accented counts | One-bar duration at quarter=120 |
|---|---|---:|
| 9/4 | Accent 1 | 4.5 s |
| 10/8 — 3+3+2+2 | Accent 1, 4, 7, 9 | 2.5 s |
| 11/8 — 3+3+3+2 | Accent 1, 4, 7, 10 | 2.75 s |
| 4/4 baseline | Accent 1 | 2 s |

Existing fixtures already provide 1/4, 2/4, 3/4, 4/4, 6/4, 8/4 and 7/8 with 3+2+2 grouping. They do not need to be recreated; the optional 4/4 baseline is useful for comparing this group's explicit quarter-BPM setting. /16 examples are deferred.

After the references are compared, device testing should import the exporter-generated equivalents, inspect their settings, listen to all three met versions and check total duration. Successful XML parsing or matching field topology alone does not prove playback behavior.
