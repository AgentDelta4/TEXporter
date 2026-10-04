$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
function ReadXml($path) {
    $doc = [Xml.XmlDocument]::new()
    $doc.XmlResolver = $null
    $doc.Load($path)
    return ,$doc
}
function Signature($node) {
    if ($node.NodeType -ne [Xml.XmlNodeType]::Element) { return '' }
    $attrs = @($node.Attributes | ForEach-Object Name) -join ','
    $children = @($node.ChildNodes | Where-Object NodeType -eq Element | ForEach-Object { Signature $_ }) -join '|'
    return $node.get_Name() + '[' + $attrs + ']{' + $children + '}'
}
$fixtures = @(Get-ChildItem -LiteralPath (Join-Path $projectRoot 'tests/references') -Filter *.tetmetgroup)
$originals = @($fixtures | ForEach-Object { (ReadXml $_.FullName).SelectNodes('/MetroPresetGroup/MetroPreset') })
if ($originals.Count -eq 0) { throw 'Sanitized TE reference presets are missing.' }
$template = $originals[0]
foreach ($preset in $originals) {
    if ((Signature $preset) -ne (Signature $template)) { throw 'Sanitized TE reference preset structures differ.' }
}
$count = 0
$nativeFiles = @(Get-ChildItem -LiteralPath (Join-Path $projectRoot 'sibelius/samples') -Filter *.tetmetgroup)
$generatedFolder = Join-Path $PSScriptRoot 'generated'
if (Test-Path -LiteralPath $generatedFolder) {
    $nativeFiles += @(Get-ChildItem -LiteralPath $generatedFolder -Filter *.tetmetgroup)
}
if ($nativeFiles.Count -eq 0) { throw 'Native Sibelius XML outputs are missing. Run the tests first.' }
foreach ($file in $nativeFiles) {
    $doc = ReadXml $file.FullName
    $group = $doc.DocumentElement
    if ($group.get_Name() -ne 'MetroPresetGroup') { throw ('Invalid root: ' + $file.Name) }
    if ($group.GetAttribute('countin_type') -ne '4' -or $group.GetAttribute('do_countin') -notin @('0','1')) { throw 'Wrong native Range Start count-in' }
    $ci = $group.SelectSingleNode('MetroCountIn')
    foreach ($pair in @(@('unit','2'),@('eighthcount','16'),@('beatmask','21845'),@('beatmask64','21845'),@('accentmask','5393'),@('allow_accent','1'),@('voicemask','0'),@('voicemask64','0'),@('voiceaccentmask','0'))) {
        if ($ci.GetAttribute($pair[0]) -ne $pair[1]) { throw ('Wrong count-in ' + $pair[0]) }
    }
    foreach ($preset in $group.SelectNodes('MetroPreset')) {
        if ((Signature $preset) -ne (Signature $template)) { throw ('Preset structure differs from real TE exports: ' + $file.Name) }
        foreach ($field in @('tempo','starting_tempo','transition','transition_anchor','transition_len')) {
            if ($preset.GetAttribute($field) -ne $preset.SelectSingleNode('MetroTempoMapInfo').GetAttribute($field)) { throw ('Unsynchronized ' + $field) }
        }
        $count++
    }
}
Write-Output ('PASS: ' + $originals.Count + ' sanitized TE reference presets and ' + $count + ' native presets across ' + $nativeFiles.Count + ' groups have the same ordered XML structure; native count-in fields are exact.')
