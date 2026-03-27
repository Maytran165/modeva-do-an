# Chay bang quyen Administrator (lan dau) de ghi file hosts.
# Sau do: http://ModevaShop.cms:8080/ thay cho http://127.0.0.1:8080/
#
# Mac dinh: cong 8080 (khong can admin khi chay python)
# Cong 80 (http://ModevaShop.cms/ khong co :8080) can admin cho python:
#   powershell -ExecutionPolicy Bypass -File .\scripts\setup-modesvashop.ps1 -Port 80

param(
    [int]$Port = 8080
)

$ErrorActionPreference = 'Stop'

function Test-Admin {
    $p = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

$hostsPath = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
$marker = 'ModevaShop.cms'

if (-not (Test-Path $hostsPath)) {
    Write-Error "Khong tim thay file hosts: $hostsPath"
}

$pattern = [regex]::Escape($marker)
$hasMarker = Select-String -Path $hostsPath -Pattern $pattern -Quiet
if (-not $hasMarker) {
    if (-not (Test-Admin)) {
        Write-Host "Can quyen Administrator de ghi file hosts (mot lan)."
        Write-Host "Chuot phai PowerShell -> Run as administrator, roi chay lai script nay."
        exit 1
    }
    Add-Content -Path $hostsPath -Value "`r`n127.0.0.1`t$marker" -Encoding ascii
    Write-Host "Da them vao hosts: 127.0.0.1 $marker"
} else {
    Write-Host "Ten $marker da co trong hosts."
}

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $ProjectRoot

$url = if ($Port -eq 80) { "http://$marker/" } else { "http://${marker}:$Port/" }
Write-Host "Thu muc: $ProjectRoot"
Write-Host "Mo trinh duyet: $url"

if ($Port -eq 80 -and -not (Test-Admin)) {
    Write-Host ""
    Write-Host "Cong 80 can quyen Administrator. Chay lai script bang Administrator,"
    Write-Host "hoac dung cong 8080 (mac dinh):"
    Write-Host "  powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit 1
}

python -m http.server $Port
