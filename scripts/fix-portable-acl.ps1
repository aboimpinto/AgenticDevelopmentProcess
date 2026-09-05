param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Run this from an elevated PowerShell: powershell -ExecutionPolicy Bypass -File .\scripts\fix-portable-acl.ps1"
    exit 1
}

$ProjectRoot = (Resolve-Path $ProjectRoot).Path
Write-Host "Repairing portable ACLs under: $ProjectRoot"

& takeown.exe /F $ProjectRoot /R /D Y | Out-Host
if ($LASTEXITCODE -ne 0) {
    Write-Warning "takeown exited with code $LASTEXITCODE; continuing with icacls so successful paths still get repaired."
}

& icacls.exe $ProjectRoot /inheritance:e /T /C | Out-Host
& icacls.exe $ProjectRoot /reset /T /C | Out-Host

& icacls.exe $ProjectRoot /grant:r `
    '*S-1-1-0:(OI)(CI)F' `
    '*S-1-5-32-545:(OI)(CI)M' `
    '*S-1-5-11:(OI)(CI)M' | Out-Host

& icacls.exe $ProjectRoot /grant:r `
    '*S-1-1-0:F' `
    '*S-1-5-32-545:M' `
    '*S-1-5-11:M' `
    /T /C | Out-Host

Write-Host "Portable ACL repair complete."
