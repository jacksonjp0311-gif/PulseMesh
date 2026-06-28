param(
    [switch]$WithVisuals,
    [switch]$WithIoT
)

$ErrorActionPreference = "Stop"

$extras = "dev"
if ($WithVisuals) {
    $extras = "$extras,visuals"
}
if ($WithIoT) {
    $extras = "$extras,mqtt,serial"
}

python -m pip install -e ".[$extras]"
Write-Host "PulseMesh installed in editable mode with extras: $extras"
Write-Host "Try: pulsemesh providers"

