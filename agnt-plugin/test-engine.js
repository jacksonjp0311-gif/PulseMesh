// PulseMesh JS Engine Test Suite
import { TelemetrySeries } from './models.js';
import { fuseSeries } from './fusion.js';
import { evaluateAlerts, gateDecision } from './alerts.js';
import { generateDashboard } from './dashboard.js';
import { generateMarkdownReport } from './reports.js';
import { syntheticSeries } from './synthetic.js';
import { saveSeries, loadSeries } from './cache.js';
import fs from 'fs';

let passed = 0, failed = 0;
function assert(c, n) { if (c) { console.log('  OK ' + n); passed++; } else { console.log('  FAIL: ' + n); failed++; } }

console.log('=== TEST 1: Fusion Engine ===');
const series = new TelemetrySeries({ profileId: 't', provider: 'test', label: 'T', sensorName: 't', times: ['t0','t1','t2','t3','t4','t5','t6','t7','t8','t9','t10','t11'], values: [20,21,19,22,20,50,21,19,20,22,20,21] });
const f = fuseSeries(series, 0.7);
assert(f.healthScore > 0 && f.healthScore <= 1, 'health in range');
assert(f.anomalyScore > 0 && f.anomalyScore <= 1, 'anomaly in range');
assert(f.spikeCount >= 1, 'spike detected');
assert(f.normalized.length === 12, 'normalized length');

console.log('=== TEST 2: Alerts ===');
const ss = { profile_id: 'cpu', label: 'CPU', metrics: { mean: 95, health_score: 0.3, anomaly_score: 0.8 } };
const al = evaluateAlerts(ss, [{ metric: 'mean', op: '>=', threshold: 90, severity: 'warning' },{ metric: 'anomaly_score', op: '>=', threshold: 0.75, severity: 'critical' }]);
assert(al.length === 2, 'alerts fired');

console.log('=== TEST 3: Gate ===');
assert(gateDecision({ mesh: { mesh_health: 0.85, highest_anomaly: { anomaly_score: 0.2 }, critical_alert_count: 0, alert_count: 0, fallback_sensor_count: 0 } }, {}).decision === 'go', 'gate=go');
assert(gateDecision({ mesh: { mesh_health: 0.3, highest_anomaly: { anomaly_score: 0.9 }, critical_alert_count: 2, alert_count: 0, fallback_sensor_count: 0 } }, {}).decision === 'hold', 'gate=hold');
assert(gateDecision({ mesh: { mesh_health: 0.65, highest_anomaly: { anomaly_score: 0.5 }, critical_alert_count: 0, alert_count: 0, fallback_sensor_count: 1 } }, {}).decision === 'warn', 'gate=warn');

console.log('=== TEST 4: Synthetic ===');
const s1 = syntheticSeries({ id: 'q', provider: 'usgs_earthquake', variable: 'mag' }, 'err', 32);
const s2 = syntheticSeries({ id: 'q', provider: 'usgs_earthquake', variable: 'mag' }, 'err2', 32);
assert(s1.values.length === 32 && !s1.usedLiveData, 'synthetic 32pts');
assert(JSON.stringify(s1.values) === JSON.stringify(s2.values), 'deterministic');

console.log('=== TEST 5: Dashboard ===');
const sum = { run_id: 'r1', timestamp: 'now', mesh: { mesh_health: 0.823, sensor_count: 2, fallback_sensor_count: 0, alert_count: 0, critical_alert_count: 0, highest_anomaly: null }, sensors: [{ profile_id: 'x', label: 'X', provider: 'p', used_live_data: true, metrics: { health_score: 0.9, anomaly_score: 0.1, coherence_avg: 0.8 }, alerts: [], _normalized: [0.1,0.2,0.3] }], alerts: [] };
const html = generateDashboard(sum);
assert(html.length > 1000 && html.includes('svg') && html.includes('0.823'), 'dashboard valid');

console.log('=== TEST 6: Cache ===');
fs.mkdirSync('/tmp/pm-test', { recursive: true });
const cs = new TelemetrySeries({ profileId: 'c1', provider: 'p', label: 'L', sensorName: 's', times: ['t0'], values: [42] });
saveSeries('/tmp/pm-test', cs);
const cl = loadSeries('/tmp/pm-test', 'c1', 'test');
assert(cl && cl.values[0] === 42 && !cl.used_liveData, 'cache roundtrip');
fs.rmSync('/tmp/pm-test', { recursive: true, force: true });

console.log('=== TEST 7: Markdown ===');
const md = generateMarkdownReport(sum);
assert(md.includes('PulseMesh') && md.includes('0.823'), 'markdown valid');

console.log('\nPASS:' + passed + ' FAIL:' + failed);
process.exit(failed > 0 ? 1 : 0);
