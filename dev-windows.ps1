# DnD Planner - Tauri Dev (Windows)
# Startet tauri dev und schreibt Output in tauri-dev.log (lesbar aus WSL)

$logFile = Join-Path $PSScriptRoot "tauri-dev.log"
$ErrorActionPreference = "Continue"

$writer = [System.IO.StreamWriter]::new($logFile, $false, [System.Text.Encoding]::UTF8)
$writer.AutoFlush = $true

Write-Host "Starte Tauri dev... (Log: $logFile)" -ForegroundColor Cyan

npm run tauri dev 2>&1 | ForEach-Object {
    $line = "$_"
    Write-Host $line
    $writer.WriteLine($line)
}

$writer.Close()
