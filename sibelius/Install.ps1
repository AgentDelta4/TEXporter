param([string]$SibeliusUserFolder = (Join-Path $env:APPDATA 'Avid\Sibelius'))
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'TEXporter-Sibelius.plg'
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw 'Keep Install.ps1 beside TEXporter-Sibelius.plg.' }
if (-not (Test-Path -LiteralPath $SibeliusUserFolder -PathType Container)) {
    throw 'Sibelius user settings were not found. Run Sibelius once, or specify -SibeliusUserFolder with its actual user settings folder.'
}
$pluginsRoot = [IO.Path]::GetFullPath((Join-Path $SibeliusUserFolder 'Plugins'))
$targetFolder = Join-Path $pluginsRoot 'TEXporter'
$target = Join-Path $targetFolder 'TEXporter-Sibelius.plg'
if (Test-Path -LiteralPath $pluginsRoot) {
    $duplicates = @(Get-ChildItem -LiteralPath $pluginsRoot -Recurse -File |
        Where-Object { $_.Name -in @('TEExporter.plg','TEXporter-Sibelius.plg') -and $_.FullName -ne $target })
    if ($duplicates.Count -gt 0) { throw ('Another exporter installation exists: ' + ($duplicates.FullName -join ', ') + '. Keep one active copy before installing this INDEV edition.') }
}
if (Test-Path -LiteralPath $target) {
    $backupFolder = Join-Path $PSScriptRoot 'backups'
    New-Item -ItemType Directory -Path $backupFolder -Force | Out-Null
    Copy-Item -LiteralPath $target -Destination (Join-Path $backupFolder ('TEXporter-Sibelius-before-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.plg'))
}
New-Item -ItemType Directory -Path $targetFolder -Force | Out-Null
Copy-Item -LiteralPath $source -Destination $target -Force
if ((Get-FileHash -LiteralPath $source).Hash -ne (Get-FileHash -LiteralPath $target).Hash) { throw 'Installed file verification failed.' }
Write-Output ('Installed: ' + $target)
Write-Output 'INDEV: this build has not been run inside Sibelius. Save your work and restart Sibelius. Run TEXporter for Sibelius - INDEV from the TEXporter plug-in category.'
