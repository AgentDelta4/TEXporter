param([string]$Output = 'samples/Example.tetmetgroup')
$ErrorActionPreference = 'Stop'
function Assert($condition, $message) { if (!$condition) { throw $message } }
function Signature($node) {
    $names = @($node.Attributes | ForEach-Object { $_.LocalName } | Sort-Object)
    $children = @($node.ChildNodes | Where-Object NodeType -eq 'Element' | ForEach-Object { Signature $_ })
    return $node.LocalName + '[' + ($names -join ',') + '](' + ($children -join ';') + ')'
}
[xml]$generated = Get-Content -Raw -LiteralPath $Output
$root = $generated.DocumentElement
Assert ($root.LocalName -eq 'MetroPresetGroup') 'Wrong root'
Assert ($root.SelectNodes('RandomSamplesets').Count -eq 1) 'Missing RandomSamplesets'
Assert ($root.SelectNodes('MetroCountIn').Count -eq 1) 'Missing MetroCountIn'
Assert ($root.GetAttribute('do_countin') -in @('0','1')) 'Invalid native count-in toggle'
Assert ($root.GetAttribute('countin_type') -eq '4') 'Native count-in must use confirmed Range Start mode'
$nativeCountIn = $root.SelectSingleNode('MetroCountIn')
Assert ($nativeCountIn.GetAttribute('unit') -eq '2' -and $nativeCountIn.GetAttribute('eighthcount') -eq '16') 'Native count-in must span 16 eighths'
Assert ($nativeCountIn.GetAttribute('beatmask') -eq '21845' -and $nativeCountIn.GetAttribute('beatmask64') -eq '21845') 'Native count-in must have eight evenly spaced clicks'
Assert ($nativeCountIn.GetAttribute('accentmask') -eq '5393' -and $nativeCountIn.GetAttribute('allow_accent') -eq '1') 'Native count-in must accent eighth positions 1, 5, 9, 11 and 13'
Assert ($nativeCountIn.GetAttribute('voicemask') -eq '0' -and $nativeCountIn.GetAttribute('voicemask64') -eq '0') 'Native count-in voice must be off'
$presets = @($root.SelectNodes('MetroPreset'))
Assert ($presets.Count -gt 0) 'No presets'
$fixtures = @(Get-ChildItem tests/references -Filter '*.tetmetgroup')
$fixtureCount = 0
$prototype = $null
foreach ($fixture in $fixtures) {
    [xml]$source = Get-Content -Raw -LiteralPath $fixture.FullName
    $referenceRoot = $source.DocumentElement
    $actualAttrs = ($root.Attributes.LocalName | Sort-Object) -join ','
    $expectedAttrs = ($referenceRoot.Attributes.LocalName | Sort-Object) -join ','
    Assert ($actualAttrs -eq $expectedAttrs) 'Root attribute mismatch'
    foreach ($reference in $referenceRoot.SelectNodes('MetroPreset')) {
        if (!$prototype) { $prototype = $reference }
        $fixtureCount++
        foreach ($preset in $presets) {
            Assert ((Signature $preset) -eq (Signature $reference)) ('Preset structure mismatch with ' + $fixture.Name)
        }
    }
}
foreach ($preset in $presets) {
    $map = $preset.SelectSingleNode('MetroMeterMapInfo')
    $tempoMap = $preset.SelectSingleNode('MetroTempoMapInfo')
    Assert ($preset.GetAttribute('usetempo') -eq '1') 'Tempo must be explicit'
    Assert ([double]$preset.GetAttribute('tempo') -ge 1 -and [double]$preset.GetAttribute('tempo') -le 1000) 'Invalid tempo'
    Assert ([int]$preset.GetAttribute('barcount') -gt 0) 'Invalid bar count'
    Assert ([int]$map.GetAttribute('topcount') -gt 0) 'Invalid numerator'
    Assert (@(1,2,4,8,16,32,64) -contains [int]$map.GetAttribute('notebase')) 'Invalid denominator'
    foreach ($field in @('tempo','starting_tempo','transition','transition_anchor','transition_len')) { Assert ($preset.GetAttribute($field) -eq $tempoMap.GetAttribute($field)) ('Tempo duplicates mismatch: ' + $field) }
    foreach ($field in @('barcount','meter','subdiv','accentmask','beatmask')) {
        Assert ($preset.GetAttribute($field) -eq $map.GetAttribute($field)) ('Duplicate mismatch: ' + $field)
    }
    $taskAccent64 = [UInt64]::Parse($map.GetAttribute('accentmask64'))
    $taskAccent32 = [int64]($taskAccent64 -band 4294967295L)
    if ($taskAccent32 -gt 2147483647L) { $taskAccent32 -= 4294967296L }
    Assert ([string]$taskAccent32 -eq $map.GetAttribute('accentmask')) '64-bit accent mismatch'
    Assert ($map.GetAttribute('bardur') -eq $map.GetAttribute('barcount')) 'Bar duration mismatch'
    # Confirm every untouched preset attribute and descendant value matches the template source.
    [xml]$defaultsReference = Get-Content -Raw -LiteralPath 'tests/references/defaults.tetmetgroup'
    $baseline = $defaultsReference.DocumentElement.SelectSingleNode('MetroPreset')
    $mutable = @('name','usetempo','tempo','barcount','meter','subdiv','accentmask','beatmask','starting_tempo','transition','transition_anchor','transition_len')
    foreach ($attr in $baseline.Attributes) {
        if ($attr.LocalName -notin $mutable) {
            Assert ($preset.GetAttribute($attr.LocalName) -eq $attr.Value) ('Default changed: ' + $attr.LocalName)
        }
    }
    foreach ($tag in @('DroneSequencePreset','MetroPolyMeterMapInfo')) {
        $a = $preset.SelectNodes($tag); $b = $baseline.SelectNodes($tag)
        for ($i=0; $i -lt $a.Count; $i++) { Assert ($a[$i].OuterXml -eq $b[$i].OuterXml) ('Unknown/default child altered: ' + $tag) }
    }
}
Write-Output ('Valid XML: ' + $Output + '; ' + $presets.Count + ' generated presets match the complete attribute/child topology of ' + $fixtureCount + ' presets across ' + $fixtures.Count + ' sanitized TonalEnergy references.')
