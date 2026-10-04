param([string]$Destination = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'MuseScore4\Plugins\TEXporter'))
$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$taskTarget = [IO.Path]::GetFullPath($Destination)
$taskVersion = (Get-Content -Raw -LiteralPath (Join-Path $taskRoot 'package.json') | ConvertFrom-Json).version
$taskLegacyEntry = [IO.Path]::GetFullPath((Join-Path $taskTarget 'TEExporter.qml'))
$taskCurrentEntry = [IO.Path]::GetFullPath((Join-Path $taskTarget 'TEXporter.qml'))
$taskExpectedLegacyEntry = [IO.Path]::GetFullPath((Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'MuseScore4\Plugins\TEExporter\TEExporter.qml'))
$taskLegacyHash = $null
if (!(Test-Path -LiteralPath $taskCurrentEntry -PathType Leaf) -and !(Test-Path -LiteralPath $taskLegacyEntry -PathType Leaf)) {
    throw 'The existing TEXporter/TEExporter installation was not found.'
}
if (Test-Path -LiteralPath $taskLegacyEntry -PathType Leaf) {
    if (![string]::Equals($taskLegacyEntry, $taskExpectedLegacyEntry, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Legacy entry migration is allowed only at the verified existing TEExporter installation path.'
    }
    $taskLegacyText = Get-Content -Raw -LiteralPath $taskLegacyEntry
    if ($taskLegacyText -notmatch '(?m)^import MuseScore 3\.0\r?$' -or
        $taskLegacyText -notmatch 'title:\s*"Export to TonalEnergy"' -or
        $taskLegacyText -notmatch 'import "lib/TonalEnergy\.js" as TE') {
        throw 'The legacy entry point does not match the expected MuseScore TonalEnergy exporter.'
    }
    $taskLegacyHash = (Get-FileHash -LiteralPath $taskLegacyEntry).Hash
}
$taskBackup = Join-Path $taskRoot ('research\install-backups\' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-before-' + $taskVersion)
New-Item -ItemType Directory -Path $taskBackup -Force | Out-Null
Copy-Item -LiteralPath $taskTarget -Destination (Join-Path $taskBackup (Split-Path -Leaf $taskTarget)) -Recurse
$taskPlugin = Join-Path $taskRoot 'plugin'
if (!(Test-Path -LiteralPath (Join-Path $taskPlugin 'TEXporter.qml') -PathType Leaf) -or
    (Test-Path -LiteralPath (Join-Path $taskPlugin 'TEExporter.qml'))) {
    throw 'The source must contain TEXporter.qml and no legacy TEExporter.qml entry point.'
}
foreach ($taskFile in Get-ChildItem -LiteralPath $taskPlugin -Recurse -File) {
    $taskRelative = $taskFile.FullName.Substring($taskPlugin.Length + 1)
    $taskOutput = Join-Path $taskTarget $taskRelative
    New-Item -ItemType Directory -Path (Split-Path -Parent $taskOutput) -Force | Out-Null
    Copy-Item -LiteralPath $taskFile.FullName -Destination $taskOutput -Force
    if ((Get-FileHash -LiteralPath $taskFile.FullName).Hash -ne (Get-FileHash -LiteralPath $taskOutput).Hash) {
        throw ('Installed runtime hash mismatch: ' + $taskRelative)
    }
}
$taskReadme = (Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $taskRoot 'README.md')).Replace('plugin/assets/tex-logo.png','assets/tex-logo.png')
[IO.File]::WriteAllText((Join-Path $taskTarget 'README.md'), $taskReadme, [Text.UTF8Encoding]::new($false))
foreach ($taskFolder in @('docs','samples')) {
    $taskSource = Join-Path $taskRoot $taskFolder
    foreach ($taskFile in Get-ChildItem -LiteralPath $taskSource -Recurse -File) {
        $taskRelative = $taskFile.FullName.Substring($taskRoot.Length + 1)
        $taskOutput = Join-Path $taskTarget $taskRelative
        New-Item -ItemType Directory -Path (Split-Path -Parent $taskOutput) -Force | Out-Null
        if ($taskRelative.Replace('\','/') -eq 'docs/LOGO.md') {
            $taskLogoNotes = (Get-Content -Raw -Encoding UTF8 -LiteralPath $taskFile.FullName).Replace('plugin/assets/tex-logo.png','assets/tex-logo.png')
            [IO.File]::WriteAllText($taskOutput, $taskLogoNotes, [Text.UTF8Encoding]::new($false))
        } else {
            Copy-Item -LiteralPath $taskFile.FullName -Destination $taskOutput -Force
        }
    }
}
if ($taskLegacyHash) {
    # Remove only the verified legacy entry after every new runtime/assets hash
    # and all documentation/sample copies have completed successfully.
    $taskVerifiedLegacyEntry = (Get-Item -LiteralPath $taskLegacyEntry).FullName
    if (![string]::Equals([IO.Path]::GetFullPath($taskVerifiedLegacyEntry), $taskExpectedLegacyEntry, [StringComparison]::OrdinalIgnoreCase) -or
        (Get-FileHash -LiteralPath $taskVerifiedLegacyEntry).Hash -ne $taskLegacyHash) {
        throw 'The legacy entry point changed or resolved outside its verified migration path; it was retained.'
    }
    Remove-Item -LiteralPath $taskVerifiedLegacyEntry
    if (Test-Path -LiteralPath $taskLegacyEntry) { throw 'The legacy entry point could not be removed.' }
}
Write-Output ('Installed TEXporter for MuseScore ' + $taskVersion + ': ' + $taskTarget)
Write-Output ('Backup: ' + $taskBackup)
