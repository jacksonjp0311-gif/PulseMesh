// PulseMesh JS — Reports & Baselines & History
// Port of Python reports.py + baselines.py + history.js

import fs from 'fs';
import path from 'path';
import { nowISO, loadJSON, writeJSON } from './util.js';

// ---- Reports ----

export function generateMarkdownReport(summary) {
  const mesh = summary.mesh || {};
  const sensors = summary.sensors || [];
  const alerts = summary.alerts || [];
  const lines = [
    `# PulseMesh Report`,
    `**Generated:** ${summary.timestamp || nowISO()}`,
    `**Run ID:** ${summary.run_id || 'unknown'}`,
    ``,
    `## Mesh Summary`,
    `| Metric | Value |`,
    `|---|---|`,
    `| Mesh Health | ${(mesh.mesh_health ?? 0).toFixed(3)} |`,
    `| Sensors | ${mesh.sensor_count ?? 0} |`,
    `| Fallback | ${mesh.fallback_sensor_count ?? 0} |`,
    `| Alerts | ${mesh.alert_count ?? 0} |`,
    `| Critical | ${mesh.critical_alert_count ?? 0} |`,
    ``,
    `## Sensors`,
    `| Sensor | Provider | Health | Anomaly | Coherence | Live |`,
    `|---|---|---|---|---|---|`,
  ];
  for (const s of sensors) {
    const m = s.metrics || {};
    lines.push(`| ${s.label || s.profile_id} | ${s.provider} | ${(m.health_score ?? 0).toFixed(3)} | ${(m.anomaly_score ?? 0).toFixed(3)} | ${(m.coherence_avg ?? 0).toFixed(3)} | ${s.used_live_data ? '✓' : '✗'} |`);
  }
  if (alerts.length > 0) {
    lines.push(``, `## Alerts`, `| Severity | Sensor | Message |`, `|---|---|---|`);
    for (const a of alerts) {
      lines.push(`| ${a.severity} | ${a.profile_id} | ${a.message || ''} |`);
    }
  }
  return lines.join('\n');
}

export function compareSummaries(beforePath, afterPath) {
  const before = typeof beforePath === 'string' ? loadJSON(beforePath) : beforePath;
  const after = typeof afterPath === 'string' ? loadJSON(afterPath) : afterPath;
  if (!before || !after) throw new Error('Could not load summaries');
  const bSensors = Object.fromEntries((before.sensors || []).map(s => [s.profile_id, s]));
  const aSensors = Object.fromEntries((after.sensors || []).map(s => [s.profile_id, s]));
  const allIds = [...new Set([...Object.keys(bSensors), ...Object.keys(aSensors)])].sort();
  const sensors = allIds.map(id => {
    const old = bSensors[id];
    const neu = aSensors[id];
    if (!old) return { profile_id: id, status: 'added' };
    if (!neu) return { profile_id: id, status: 'removed' };
    const om = old.metrics || {};
    const nm = neu.metrics || {};
    return {
      profile_id: id, status: 'changed',
      health_delta: (nm.health_score ?? 0) - (om.health_score ?? 0),
      anomaly_delta: (nm.anomaly_score ?? 0) - (om.anomaly_score ?? 0),
      coherence_delta: (nm.coherence_avg ?? 0) - (om.coherence_avg ?? 0),
      live_data_changed: !!old.used_live_data !== !!neu.used_live_data,
    };
  });
  return {
    before_run: before.run_id, after_run: after.run_id,
    before_timestamp: before.timestamp, after_timestamp: after.timestamp,
    sensors,
  };
}

// ---- Baselines ----

const TRACKED_METRICS = ['mean', 'coherence_avg', 'health_score', 'anomaly_score', 'volatility', 'drift', 'stability_fraction'];

export function loadBaselines(baselinePath) {
  if (!fs.existsSync(baselinePath)) return { version: '0.2', updated_at: null, sensors: {} };
  try {
    const obj = loadJSON(baselinePath);
    if (!obj || typeof obj !== 'object') return { version: '0.2', updated_at: null, sensors: {} };
    obj.version = '0.2';
    obj.sensors = obj.sensors || {};
    return obj;
  } catch {
    return { version: '0.2', updated_at: null, sensors: {} };
  }
}

export function updateBaselines(summaryPath, baselinePath, window = 50) {
  const summary = typeof summaryPath === 'string' ? loadJSON(summaryPath) : summaryPath;
  const baselines = loadBaselines(baselinePath);
  const sensors = baselines.sensors || {};

  for (const sensor of (summary.sensors || [])) {
    const sid = sensor.profile_id;
    if (!sid) continue;
    const entry = sensors[sid] = sensors[sid] || { profile_id: sid, label: sensor.label, provider: sensor.provider, samples: [] };
    const sample = {
      timestamp: summary.timestamp || nowISO(),
      run_id: summary.run_id,
      used_live_data: !!sensor.used_live_data,
      metrics: Object.fromEntries(TRACKED_METRICS.filter(k => k in (sensor.metrics || {})).map(k => [k, sensor.metrics[k]])),
    };
    entry.samples.push(sample);
    if (entry.samples.length > window) entry.samples = entry.samples.slice(-window);
  }

  baselines.updated_at = nowISO();
  writeJSON(baselinePath, baselines);
  return baselines;
}

export function annotateWithBaselines(summary, baselinePath) {
  const baselines = loadBaselines(baselinePath);
  for (const sensor of (summary.sensors || [])) {
    const entry = baselines.sensors?.[sensor.profile_id];
    if (!entry || entry.samples.length < 2) continue;
    const prev = entry.samples[entry.samples.length - 2];
    const cur = sensor.metrics || {};
    const baseline = {};
    for (const k of TRACKED_METRICS) {
      if (k in cur && k in prev.metrics) {
        baseline[k] = {
          current: cur[k],
          previous: prev.metrics[k],
          delta: cur[k] - prev.metrics[k],
          z_score: entry.samples.length >= 3 ? computeZ(entry.samples.map(s => s.metrics[k]), cur[k]) : 0,
        };
      }
    }
    sensor.baseline = baseline;
  }
  return summary;
}

function computeZ(history, current) {
  const n = history.length;
  if (n < 3) return 0;
  const mean = history.reduce((a, b) => a + b, 0) / n;
  const variance = history.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  return std > 1e-9 ? (current - mean) / std : 0;
}

// ---- History ----

export function loadLedger(ledgerPath) {
  if (!fs.existsSync(ledgerPath)) return [];
  return fs.readFileSync(ledgerPath, 'utf-8').split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

export function summarizeHistory(runsDir, limit = 20) {
  const ledger = loadLedger(path.join(runsDir, 'ledger.jsonl'));
  const recent = ledger.slice(-limit);
  const health = recent.map(r => r.mesh?.mesh_health ?? 0);
  const trend = health.length >= 2 ? health[health.length - 1] - health[0] : 0;
  return {
    run_count: recent.length,
    health_trend: trend,
    latest_health: health[health.length - 1] ?? 0,
    runs: recent.map(r => ({
      run_id: r.run_id,
      timestamp: r.timestamp,
      mesh_health: r.mesh?.mesh_health ?? 0,
      alert_count: r.mesh?.alert_count ?? 0,
      fallback_count: r.mesh?.fallback_sensor_count ?? 0,
    })),
  };
}
