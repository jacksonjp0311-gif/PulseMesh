# Profile Contract

A profile file is either:

- an object with a `profiles` array, or
- a bare array of profile objects.

The preferred form is:

```json
{
  "profiles": [
    {
      "id": "cloudflare_latency",
      "label": "Cloudflare TCP Latency",
      "provider": "ping",
      "host": "1.1.1.1",
      "port": 443,
      "count": 12
    }
  ]
}
```

## Required Fields

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Stable sensor id inside a mesh. Must be unique within the profile file. |
| `provider` | string | Provider key, such as `system`, `openmeteo`, `jsonl`, or `github`. |

## Common Optional Fields

| Field | Type | Meaning |
|---|---|---|
| `label` | string | Human-readable display name. |
| `variable` | string | Provider-specific metric selector. |
| `lat` / `lon` | number | Location for geospatial providers. |
| `alerts` | array | Per-sensor alert rules. |

## Provider Parameters

Any unknown field is preserved in `TelemetryProfile.params` and passed to the provider. This keeps the core profile contract stable while letting providers define their own options.

## Alert Rule Shape

```json
{
  "metric": "mean",
  "op": ">=",
  "threshold": 500,
  "severity": "warning",
  "message": "TCP probe latency average is high."
}
```

Supported operators: `>`, `>=`, `<`, `<=`, `==`, `!=`.

