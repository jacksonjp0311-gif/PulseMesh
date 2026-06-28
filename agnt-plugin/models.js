// PulseMesh JS — Core Data Models
// Port of Python models.py → JS ES module

export class TelemetryProfile {
  constructor(input) {
    const obj = { ...input };
    const id = obj.id;
    const provider = obj.provider;
    const label = obj.label ?? null;
    const lat = obj.lat ?? null;
    const lon = obj.lon ?? null;
    const variable = obj.variable ?? null;

    if (!id) throw new Error('profile missing required field: id');
    if (!provider) throw new Error(`profile ${id} missing required field: provider`);

    // Extract known fields; everything else goes into params (matches Python behavior)
    const knownKeys = new Set(['id', 'provider', 'label', 'lat', 'lon', 'variable']);
    const params = {};
    for (const [key, val] of Object.entries(obj)) {
      if (!knownKeys.has(key) && val !== undefined) {
        params[key] = val;
      }
    }

    this.id = String(id);
    this.provider = String(provider);
    this.label = label != null ? String(label) : null;
    this.lat = lat != null ? Number(lat) : null;
    this.lon = lon != null ? Number(lon) : null;
    this.variable = variable != null ? String(variable) : null;
    this.params = params;
  }
}
TelemetryProfile.fromDict = (d) => new TelemetryProfile(d);

export class TelemetrySeries {
  constructor({ profileId, provider, label, sensorName, times, values, unit = '', usedLiveData = true, fallbackReason = null, sourceUrl = null, metadata = {} }) {
    this.profileId = profileId;
    this.provider = provider;
    this.label = label;
    this.sensorName = sensorName;
    this.times = times;
    this.values = values;
    this.unit = unit;
    this.usedLiveData = usedLiveData;
    this.fallbackReason = fallbackReason;
    this.sourceUrl = sourceUrl;
    this.metadata = metadata;
  }
}

export class FusionResult {
  constructor({ normalized, delta, coherence, mean, median, center, scale, volatility, stabilityFraction, spikeCount, drift, anomalyScore, healthScore, stabilityThreshold = 0.7 }) {
    this.normalized = normalized;
    this.delta = delta;
    this.coherence = coherence;
    this.mean = mean;
    this.median = median;
    this.center = center;
    this.scale = scale;
    this.volatility = volatility;
    this.stabilityFraction = stabilityFraction;
    this.spikeCount = spikeCount;
    this.drift = drift;
    this.anomalyScore = anomalyScore;
    this.healthScore = healthScore;
    this.stabilityThreshold = stabilityThreshold;
  }
}
