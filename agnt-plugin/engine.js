// PulseMesh JS — Main Engine Orchestrator
// Port of Python cli.py — execute_run, demo_workflow

import fs from 'fs';
import path from 'path';
import { TelemetryProfile } from './models.js';
import { acquire } from './providers.js';
import { fuseSeries, summarizeMesh } from './fusion.js';
import { evaluateAlerts, gateDecision } from './alerts.js';
import { writeRun, sensorState, writeSeriesCSV } from './artifacts.js';
import { generateDashboard } from './dashboard.js';
import { generateMarkdownReport, updateBaselines, annotateWithBaselines, compareSummaries } from './reports.js';
import { nowISO } from './util.js';

export function makeRunId(prefix = 'pulse') {
  return `${prefix}-${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`;
}

export async function executeRun({ profiles, outDir, runId = null, maxPoints = 256, timeout = 12, stabilityThreshold = 0.7, gateOpts = {} }) {
  // Load profiles
  const raw = JSON.parse(fs.readFileSync(profiles, 'utf-8'));
  const rawProfiles = Array.isArray(raw) ? raw : raw.profiles;
  if (!Array.isArray(rawProfiles)) throw new Error('profiles must be a list or object with profiles key');
  const profileObjs = rawProfiles.map(p => new TelemetryProfile(p));

  const cacheDir = path.join(outDir, '.cache');
  const actualRunId = runId || makeRunId();
  const runDir = path.join(outDir, actualRunId);
  const stateDir = path.join(runDir, 'state');
  fs.mkdirSync(stateDir, { recursive: true });

  // Acquire all sensors
  const sensorStates = [];
  const allAlerts = [];

  for (const profile of profileObjs) {
    try {
      const series = await acquire(profile, maxPoints, timeout, cacheDir);
      const fusion = fuseSeries(series, stabilityThreshold);
      const rules = profile.params.alerts || [];
      const alerts = evaluateAlerts(
        { profile_id: profile.id, label: series.label, metrics: { ...fusion, health_score: fusion.healthScore, anomaly_score: fusion.anomalyScore, coherence_avg: fusion.coherence.reduce((a, b) => a + b, 0) / fusion.coherence.length } },
        rules
      );
      allAlerts.push(...alerts);

      // Attach normalized for sparklines
      const s = sensorState(profile, series, fusion, alerts);
      s._normalized = fusion.normalized;
      sensorStates.push(s);

      // Write CSV
      writeSeriesCSV(path.join(stateDir, `${profile.id}.csv`), series, fusion);
    } catch (err) {
      // Even fusion failure → synthetic fallback
      const { syntheticSeries } = await import('./synthetic.js');
      const series = syntheticSeries(profile, err.message, maxPoints);
      const fusion = fuseSeries(series, stabilityThreshold);
      const s = sensorState(profile, series, fusion, []);
      s._normalized = fusion.normalized;
      sensorStates.push(s);
    }
  }

  // Build summary
  const meshSummary = summarizeMesh(sensorStates, stabilityThreshold);
  const summary = {
    run_id: actualRunId,
    timestamp: nowISO(),
    mesh: meshSummary,
    sensors: sensorStates,
    alerts: allAlerts,
    gate: gateDecision({ mesh: meshSummary }, gateOpts),
  };

  // Write artifacts
  writeRun(path.join(runDir, 'state'), actualRunId, summary);

  // Baselines
  const baselinePath = path.join(outDir, 'baseline.json');
  annotateWithBaselines(summary, baselinePath);
  updateBaselines(summary, baselinePath);

  // Dashboard
  const dashboardPath = path.join(runDir, 'dashboard.html');
  fs.writeFileSync(dashboardPath, generateDashboard(summary));

  // Report
  const reportPath = path.join(runDir, 'report.md');
  fs.writeFileSync(reportPath, generateMarkdownReport(summary));

  return { summary, runDir, dashboardPath, reportPath };
}

export async function getLatestStatus(outDir) {
  const ledgerPath = path.join(outDir, 'ledger.jsonl');
  if (!fs.existsSync(ledgerPath)) return { status: 'no_runs', out_dir: outDir };
  const lines = fs.readFileSync(ledgerPath, 'utf-8').trim().split('\n').filter(Boolean);
  if (lines.length === 0) return { status: 'no_runs', out_dir: outDir };
  const last = JSON.parse(lines[lines.length - 1]);
  const summaryPath = last.summary_path;
  if (!summaryPath || !fs.existsSync(summaryPath)) return { status: 'missing_summary', last_run: last.run_id };
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  return {
    status: 'ok',
    run_id: summary.run_id,
    timestamp: summary.timestamp,
    mesh: summary.mesh,
    gate: summary.gate,
    sensor_count: summary.sensors?.length || 0,
    alert_count: summary.alerts?.length || 0,
  };
}
