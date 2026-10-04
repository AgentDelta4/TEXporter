$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (!(Test-Path -LiteralPath 'plugin\TEXporter.qml' -PathType Leaf)) {
    throw 'The TEXporter.qml runtime entry point was not found.'
}
if (Test-Path -LiteralPath 'plugin\TEExporter.qml') {
    throw 'Remove the legacy source entry point before packaging to prevent duplicate plugins.'
}
New-Item -ItemType Directory -Force dist | Out-Null
$version = (Get-Content -Raw package.json | ConvertFrom-Json).version
$destination = Join-Path $PWD ('dist/TEXporter-' + $version + '.zip')
$stream = [IO.File]::Open($destination, [IO.FileMode]::Create)
$zip = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create)
try {
    $base = (Join-Path $PWD 'plugin') + [IO.Path]::DirectorySeparatorChar
    foreach ($file in Get-ChildItem plugin -Recurse -File | Sort-Object FullName) {
        $relative = $file.FullName.Substring($base.Length).Replace('\','/')
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, 'TEXporter/' + $relative) | Out-Null
    }
    foreach ($file in @(Get-Item README.md) + @(Get-ChildItem docs,samples -Recurse -File)) {
        $relative = $file.FullName.Substring($PWD.Path.Length + 1).Replace('\','/')
        if ($relative -in @('README.md','docs/LOGO.md')) {
            $taskText = (Get-Content -Raw -Encoding UTF8 -LiteralPath $file.FullName).Replace('plugin/assets/tex-logo.png','assets/tex-logo.png')
            $taskEntry = $zip.CreateEntry('TEXporter/' + $relative)
            $taskWriter = [IO.StreamWriter]::new($taskEntry.Open(), [Text.UTF8Encoding]::new($false))
            try { $taskWriter.Write($taskText) } finally { $taskWriter.Dispose() }
        } else {
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, 'TEXporter/' + $relative) | Out-Null
        }
    }
} finally { $zip.Dispose(); $stream.Dispose() }
Write-Output $destination
