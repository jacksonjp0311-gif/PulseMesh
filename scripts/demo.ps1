param(
    [string]$Profiles = "examples\profiles.rich.json",
    [string]$Out = "runs",
    [switch]$NoPlots
)

$ErrorActionPreference = "Stop"

$plotFlag = ""
if ($NoPlots) {
    $plotFlag = "--no-plots"
}

$env:PYTHONPATH = "src"
python -m pulsemesh.cli demo --profiles $Profiles --out $Out --cache-dir "$Out\.cache" --baseline "$Out\baseline.json" --refresh-seconds 60 $plotFlag

