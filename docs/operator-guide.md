# PulseMesh Operator Guide

## Install

Editable install:

```powershell
.\scripts\install-dev.ps1
```

With plots and IoT extras:

```powershell
.\scripts\install-dev.ps1 -WithVisuals -WithIoT
```

After installation, use `pulsemesh` directly:

```powershell
pulsemesh providers
```

## One-Command Demo

```powershell
pulsemesh demo --profiles examples\profiles.rich.json --out runs --no-plots
```

The demo command performs the complete operator loop:

1. Validate the profile file.
2. Run telemetry acquisition and fusion.
3. Use cache fallback when needed.
4. Annotate with baseline when available.
5. Update the rolling baseline.
6. Write summary JSON and per-sensor CSV.
7. Render Markdown report.
8. Render HTML dashboard.
9. Update JSON and Markdown history.
10. Print all important artifact paths.

## Local Development

```powershell
.\scripts\test.ps1
```

## Recommended Daily Flow

```powershell
pulsemesh demo --profiles examples\profiles.rich.json --out runs --cache-dir runs\.cache --baseline runs\baseline.json
```

Open the emitted `dashboard_path` in a browser.

