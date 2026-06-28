// PulseMesh JS — Fusion Engine
// Port of Python fusion.py — robust median/MAD normalization, anomaly scoring, mesh summary

import { FusionResult, TelemetrySeries } from './models.js';
import { clamp } from './util.js';

function median(sorted) {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n % 2 === 1) return sorted[Math.floor(n / 2)];
  return (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

function medianAbsDeviation(values, center) {
  const deviations = values.map(v => Math.abs(v - center)).filter(Number.isFinite).sort((a, b) => a - b);
  if (deviations.length === 0) return 1.0;
  const mad = median(deviations);
  return mad > 1e-12 ? mad : 1.0;
}

function gradient(values) {
  const n = values.length;
  if (n === 0) return [];
  if (n === 1) return [0];
  const out = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) out.push(values[1] - values[0]);
    else if (i === n - 1) out.push(values[n - 1] - values[n - 2]);
    else out.push((values[i + 1] - values[i - 1]) / 2);
  }
  return out;
}

function percentile(values, pct) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = clamp(pct, 0, 100) / 100 * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const w = pos - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

export function fuseSeries(series, stabilityThreshold = 0.7) {
  const clean = series.values.map(Number).filter(Number.isFinite);
  if (clean.length < 4) throw new Error(`${series.profileId} has too few finite values (${clean.length})`);

  const sorted = [...clean].sort((a, b) => a - b);
  const center = median(sorted);
  const scale = medianAbsDeviation(clean, center);
  const normalized = clean.map(v => (v - center) / scale);
  const delta = gradient(normalized);
  const coherence = delta.map(d => 1 / (1 + Math.abs(d)));

  const mean = clean.reduce((s, v) => s + v, 0) / clean.length;
  const medianVal = median(sorted);
  const sortedCoh = [...coherence].sort((a, b) => a - b);
  const coherenceAvg = coherence.reduce((s, v) => s + v, 0) / coherence.length;
  const volatility = scale;
  const stabilityFraction = coherence.filter(c => c >= stabilityThreshold).length / coherence.length;
  const q25 = percentile(delta.map(Math.abs), 25);
  const q75 = percentile(delta.map(Math.abs), 75);
  const iqr = q75 - q25;
  const spikeThreshold = q75 + 1.5 * iqr;
  const spikeCount = delta.filter(d => Math.abs(d) > spikeThreshold).length;
  const drift = normalized[normalized.length - 1] - normalized[0];
  const anomalyScore = clamp((1 - coherenceAvg) + volatility / 5 * 0.1 + (spikeCount / clean.length), 0, 1);
  const healthScore = clamp(1 - anomalyScore, 0, 1);

  return new FusionResult({
    normalized, delta, coherence,
    mean, median: medianVal, center, scale,
    volatility, stabilityFraction, spikeCount, drift,
    anomalyScore, healthScore, stabilityThreshold,
  });
}

export function summarizeMesh(sensorStates, stabilityThreshold = 0.7) {
  const healthScores = sensorStates.map(s => s.metrics.health_score);
  const anomalyScores = sensorStates.map(s => s.metrics.anomaly_score);
  const meshHealth = healthScores.reduce((a, b) => a + b, 0) / healthScores.length;
  const worstSensor = sensorStates.reduce((w, s) => s.metrics.anomaly_score > (w?.metrics.anomaly_score || 0) ? s : w, null);

  return {
    mesh_health: meshHealth,
    highest_anomaly: worstSensor ? {
      profile_id: worstSensor.profile_id,
      label: worstSensor.label,
      anomaly_score: worstSensor.metrics.anomaly_score,
    } : null,
    sensor_count: sensorStates.length,
    fallback_sensor_count: sensorStates.filter(s => !s.used_live_data).length,
    alert_count: sensorStates.reduce((n, s) => n + (s.alerts?.length || 0), 0),
    critical_alert_count: sensorStates.reduce((n, s) => n + (s.alerts?.filter(a => a.severity === 'critical').length || 0), 0),
    stability_threshold: stabilityThreshold,
  };
}
