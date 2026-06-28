$ErrorActionPreference = "Stop"

$env:PYTHONPATH = "src"
python -m unittest discover -s tests -v
python -m compileall -q src tests
Write-Host "PulseMesh tests passed."

