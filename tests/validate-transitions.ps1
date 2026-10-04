$ErrorActionPreference = 'Stop'
[xml]$doc = Get-Content -Raw -LiteralPath 'tests/references/tempo-ramps.tetmetgroup'
$presets = @($doc.DocumentElement.SelectNodes('MetroPreset'))
if ($presets.Count -ne 6) { throw 'Expected six reference presets' }
$expected = @(
    @('Full Bar',120,160,0,16,0,15),
    @('First Portion',160,120,0,6,0,5),
    @('From End',120,160,1,6,10,15)
)
$ramps = @($presets | Where-Object { $_.GetAttribute('transition') -eq '1' })
if ($ramps.Count -ne 3) { throw 'Expected three enabled transitions' }
for ($i=0; $i -lt $ramps.Count; $i++) {
    $preset = $ramps[$i]
    $map = $preset.SelectSingleNode('MetroTempoMapInfo')
    $values = @($preset.GetAttribute('name'),[int]$map.GetAttribute('starting_tempo'),
        [int]$map.GetAttribute('tempo'),[int]$map.GetAttribute('transition_anchor'),
        [int]$map.GetAttribute('transition_len'),[int]$map.GetAttribute('transition_start'),
        [int]$map.GetAttribute('transition_end_beat'))
    if (($values -join '|') -ne ($expected[$i] -join '|')) { throw 'Transition reference values changed' }
    if ([int]$map.GetAttribute('transition_end_beat') -ne [int]$map.GetAttribute('transition_start') + [int]$map.GetAttribute('transition_len') - 1) {
        throw 'Expected inclusive-position relationship in reference fixture'
    }
}
foreach ($preset in $presets) {
    $map = $preset.SelectSingleNode('MetroTempoMapInfo')
    foreach ($field in @('starting_tempo','tempo','transition','transition_anchor','transition_len')) {
        if ($preset.GetAttribute($field) -ne $map.GetAttribute($field)) { throw ('Duplicated field differs: ' + $field) }
    }
    if ($preset.SelectSingleNode('MetroMeterMapInfo').GetAttribute('bardur') -ne '1') { throw 'Duration reference changed' }
}
Write-Output 'Transition evidence verified: 3 ramps, duplicated tempo fields, inclusive positions, and observed bardur values. Playback semantics remain unverified.'
