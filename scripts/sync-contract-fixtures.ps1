# Sync del contrato movil (API-CONTRACT-MOBILE.md 10.3): copia los
# fixtures golden de src/tests/contract/fixtures/ y el doc canonico
# docs/API-CONTRACT-MOBILE.md al espejo del repo movil (aea).
#
# Modos:
#   sin flags -> sincroniza (copia canonico -> espejo, borra huerfanos).
#   -Check    -> NO escribe; sale 1 listando el drift (para CI/hooks).
#
# ASCII a proposito: PowerShell 5.1 lee .ps1 sin BOM como ANSI y los
# caracteres multibyte rompen el parser.
#
# El repo movil se asume hermano en disco; override con $env:BR_MOBILE_REPO.
param([switch]$Check)

$ErrorActionPreference = "Stop"

$WebRoot = Split-Path -Parent $PSScriptRoot
$MobileRoot = if ($env:BR_MOBILE_REPO) {
  $env:BR_MOBILE_REPO
} else {
  Join-Path (Split-Path -Parent $WebRoot) "test-mobile/aea"
}

$SrcFixtures = Join-Path $WebRoot "src/tests/contract/fixtures"
$SrcDoc = Join-Path $WebRoot "docs/API-CONTRACT-MOBILE.md"
$DstFixtures = Join-Path $MobileRoot "test/contract/fixtures"
$DstDoc = Join-Path $MobileRoot "docs/API-CONTRACT-MOBILE.md"

if (-not (Test-Path $MobileRoot -PathType Container)) {
  Write-Error "repo movil no encontrado: $MobileRoot (override: BR_MOBILE_REPO)"
  exit 1
}
if (-not (Test-Path $SrcFixtures -PathType Container) -or -not (Test-Path $SrcDoc)) {
  Write-Error "faltan los canonicos web ($SrcFixtures / $SrcDoc)"
  exit 1
}

$drift = New-Object System.Collections.Generic.List[string]

function Compare-ContractFile([string]$Canonical, [string]$Mirror) {
  if (-not (Test-Path $Mirror)) {
    $script:drift.Add("falta en espejo: $Mirror")
    return
  }
  $a = (Get-FileHash -Algorithm SHA256 $Canonical).Hash
  $b = (Get-FileHash -Algorithm SHA256 $Mirror).Hash
  if ($a -ne $b) { $script:drift.Add("difiere del canonico: $Mirror") }
}

function Test-Drift {
  foreach ($f in Get-ChildItem $SrcFixtures -Filter *.json) {
    Compare-ContractFile $f.FullName (Join-Path $DstFixtures $f.Name)
  }
  if (Test-Path $DstFixtures -PathType Container) {
    foreach ($f in Get-ChildItem $DstFixtures -Filter *.json) {
      if (-not (Test-Path (Join-Path $SrcFixtures $f.Name))) {
        $script:drift.Add("extra en espejo (no existe en web): $($f.FullName)")
      }
    }
  } else {
    $script:drift.Add("falta el directorio espejo: $DstFixtures")
  }
  Compare-ContractFile $SrcDoc $DstDoc
}

if ($Check) {
  Test-Drift
  if ($drift.Count -gt 0) {
    Write-Host "[DRIFT] canonico web vs espejo movil:" -ForegroundColor Red
    $drift | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    Write-Host "  Corre scripts/sync-contract-fixtures.ps1 (sin flags) para resincronizar."
    exit 1
  }
  Write-Host "[OK] fixtures y doc del contrato en sync (CONTRACT_VERSION intacta)"
  exit 0
}

New-Item -ItemType Directory -Force $DstFixtures | Out-Null
New-Item -ItemType Directory -Force (Split-Path -Parent $DstDoc) | Out-Null

foreach ($f in Get-ChildItem $DstFixtures -Filter *.json) {
  if (-not (Test-Path (Join-Path $SrcFixtures $f.Name))) {
    Remove-Item $f.FullName -Force
  }
}
Copy-Item (Join-Path $SrcFixtures "*.json") $DstFixtures -Force
Copy-Item $SrcDoc $DstDoc -Force

# Verificacion post-copia: el espejo DEBE quedar byte-identico.
Test-Drift
if ($drift.Count -gt 0) {
  Write-Host "[DRIFT] la copia no dejo el espejo byte-identico:" -ForegroundColor Red
  $drift | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
  exit 1
}

$count = (Get-ChildItem $SrcFixtures -Filter *.json).Count
Write-Host "[OK] espejo actualizado: $count fixtures -> $DstFixtures"
Write-Host "[OK] doc del contrato -> $DstDoc"
