# Provider Result Contract

Every provider must return a `TelemetrySeries` shape before fusion.

```json
{
  "profile_id": "cloudflare_latency",
  "provider": "ping",
  "label": "Cloudflare TCP Latency",
  "sensor_name": "TCP probe 1.1.1.1:443",
  "times": ["probe:0000", "probe:0001"],
  "values": [42.0, 40.5],
  "unit": "ms",
  "used_live_data": true,
  "fallback_reason": null,
  "source_url": null,
  "metadata": {
    "host": "1.1.1.1",
    "port": 443
  }
}
```

## Required Fields

| Field | Type | Meaning |
|---|---|---|
| `profile_id` | string | Source profile id. |
| `provider` | string | Provider key. |
| `label` | string | Display label. |
| `sensor_name` | string | Provider-specific source description. |
| `times` | array[string] | Sample labels or timestamps. |
| `values` | array[number] | Numeric samples. |

## Fallback Fields

| Field | Meaning |
|---|---|
| `used_live_data` | `true` when live provider data was used. |
| `fallback_reason` | Required explanation when using cache or synthetic fallback. |

Provider functions should raise normal Python exceptions when acquisition fails. The acquisition wrapper handles cache and synthetic fallback.

