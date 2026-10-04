$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$projectRoot = Split-Path $PSScriptRoot -Parent
$version = (Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'package.json') | ConvertFrom-Json).version
if ($version -notmatch 'indev') { throw 'This untested Sibelius build must have an INDEV version.' }
$destination = Join-Path $projectRoot ('dist/TEXporter-Sibelius-INDEV-' + $version + '.zip')
New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null
$stream = [IO.File]::Open($destination, [IO.FileMode]::Create)
$zip = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create)
try {
    $files = @(Get-Item (Join-Path $PSScriptRoot 'TEXporter-Sibelius.plg'), (Join-Path $PSScriptRoot 'README.md'), (Join-Path $PSScriptRoot 'Install.ps1')) +
        @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'samples') -File)
    foreach ($file in $files | Sort-Object FullName) {
        $relative = $file.FullName.Substring($PSScriptRoot.Length + 1).Replace('\','/')
        if ($relative -eq 'README.md') {
            $taskText = (Get-Content -Raw -Encoding UTF8 -LiteralPath $file.FullName).Replace('../plugin/assets/tex-logo.png','assets/tex-logo.png')
            $taskEntry = $zip.CreateEntry('TEXporter-Sibelius-INDEV/' + $relative)
            $taskWriter = [IO.StreamWriter]::new($taskEntry.Open(), [Text.UTF8Encoding]::new($false))
            try { $taskWriter.Write($taskText) } finally { $taskWriter.Dispose() }
        } else {
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, 'TEXporter-Sibelius-INDEV/' + $relative) | Out-Null
        }
    }
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $projectRoot 'plugin/assets/tex-logo.png'), 'TEXporter-Sibelius-INDEV/assets/tex-logo.png') | Out-Null
} finally { $zip.Dispose(); $stream.Dispose() }
$taskHash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
[IO.File]::WriteAllText(($destination + '.sha256'), ($taskHash + '  ' + [IO.Path]::GetFileName($destination) + [Environment]::NewLine), [Text.UTF8Encoding]::new($false))
Write-Output $destination
