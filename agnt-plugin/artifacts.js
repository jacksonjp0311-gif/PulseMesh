// PulseMesh JS — Artifact Writers
// Port of Python artifacts.py — CSV, summary JSON, ledger, plots

import fs from 'fs';
import path from 'path';
import { nowISO } from './util.js';

export function writeSeriesCSV(filePath, series, fusion) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const rows = [['time', 'value', 'normalized', 'delta', 'coherence']];
  for (let i = 0; i < series.values.length; i++) {
    rows.push([
      series.times[i] || '',
      series.values[i],
      fusion.normalized[i]?.toFixed(6) || '',
      fusion.delta[i]?.toFixed(6) || '',
      fusion.coherence[i]?.toFixed(6) || '',
    ]);
  }
  fs.writeFileSync(filePath, rows.map(r => r.join(',')).join('\n'));
}

export function sensorState(profile, series, fusion, alerts) {
  return {
    profile_id: profile.id,
    label: series.label,
    provider: profile.provider,
    sensor_name: series.sensorName,
    used_live_data: series.usedLiveData,
    fallback_reason: series.fallbackReason,
    source_url: series.sourceUrl,
    sample_count: series.values.length,
    metrics: {
      mean: fusion.mean,
      median: fusion.median,
      center: fusion.center,
      scale: fusion.scale,
      volatility: fusion.volatility,
      stability_fraction: fusion.stabilityFraction,
      spike_count: fusion.spikeCount,
      drift: fusion.drift,
      coherence_avg: fusion.coherence.reduce((a, b) => a + b, 0) / fusion.coherence.length,
      anomaly_score: fusion.anomalyScore,
      health_score: fusion.healthScore,
    },
    alerts,
    baseline: {},
  };
}

export function writeRun(outDir, runId, summary) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  // Write ledger entry
  const ledgerPath = path.join(path.dirname(outDir), 'ledger.jsonl');
  const entry = {
    run_id: runId,
    timestamp: summary.timestamp,
    mesh: summary.mesh,
    summary_path: path.join(outDir, 'summary.json'),
  };
  fs.appendFileSync(ledgerPath, JSON.stringify(entry) + '\n');
  return summary;
}
