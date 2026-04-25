# Descarga pdfium (bblanchon/pdfium-binaries) para Windows x64 y lo coloca en
# src-tauri/resources/pdfium/ para que Tauri lo bundlee en el build final.
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Resolve-Path (Join-Path $ScriptDir "..")
$Dest      = Join-Path $RootDir "src-tauri\resources\pdfium"
New-Item -ItemType Directory -Force -Path $Dest | Out-Null

$Version = "chromium/7202"
$Url     = "https://github.com/bblanchon/pdfium-binaries/releases/download/$Version/pdfium-win-x64.tgz"

$Tmp = New-Item -ItemType Directory -Force -Path (Join-Path $env:TEMP ("pdfium_" + [Guid]::NewGuid().ToString("N")))
$Tgz = Join-Path $Tmp "pdfium.tgz"

Write-Host ">> Descargando pdfium win x64..."
Invoke-WebRequest -Uri $Url -OutFile $Tgz

Write-Host ">> Extrayendo..."
tar -xzf $Tgz -C $Tmp

Copy-Item (Join-Path $Tmp "bin\pdfium.dll") (Join-Path $Dest "pdfium.dll") -Force

Remove-Item -Recurse -Force $Tmp
Write-Host ">> $Dest\pdfium.dll"
