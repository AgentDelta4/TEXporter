param([string]$Fixture = 'tests/references/defaults.tetmetgroup')
$ErrorActionPreference = 'Stop'
[xml]$doc = Get-Content -Raw -LiteralPath $Fixture
function Convert-Node($element) {
    $attrs = @(); foreach ($a in $element.Attributes) { $attrs += ,@($a.Name, $a.Value) }
    $children = @(); foreach ($c in $element.ChildNodes) { if ($c.NodeType -eq 'Element') { $children += (Convert-Node $c) } }
    return [ordered]@{tag=$element.LocalName; attrs=$attrs; children=$children}
}
$root = Convert-Node $doc.DocumentElement
$root.children = @($root.children | Where-Object { $_.tag -ne 'MetroPreset' })
$data = [ordered]@{ group=$root; preset=(Convert-Node $doc.DocumentElement.MetroPreset[0]) }
$content = '// Generated from the sanitized TonalEnergy reference export. See docs/FORMAT.md.' + "`nvar defaults = " + ($data | ConvertTo-Json -Depth 30) + ";`n"
[IO.File]::WriteAllText((Join-Path $PWD 'plugin/lib/Template.js'), $content, [Text.UTF8Encoding]::new($false))
