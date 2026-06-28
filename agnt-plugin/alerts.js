// PulseMesh JS — Alert Engine
// Port of Python alerts.js — threshold-based alert evaluation

const OPS = {
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
  '==': (a, b) => a == b,
  '!=': (a, b) => a != b,
};

export function evaluateAlerts(sensorState, rules) {
  const fired = [];
  const metrics = sensorState.metrics || {};
  for (const rule of rules) {
    const metric = String(rule.metric || '');
    const op = String(rule.op || '>=');
    const threshold = rule.threshold;
    if (!(metric in metrics) || !(op in OPS)) continue;
    let value, target;
    try {
      value = parseFloat(metrics[metric]);
      target = parseFloat(threshold);
    } catch { continue; }
    if (OPS[op](value, target)) {
      fired.push({
        profile_id: sensorState.profile_id,
        label: sensorState.label,
        severity: rule.severity || 'warning',
        metric, op,
        threshold: target,
        value,
        message: rule.message || `${metric} ${op} ${target}`,
      });
    }
  }
  return fired;
}

export function gateDecision(summary, opts = {}) {
  const minHealth = opts.min_health ?? 0.55;
  const maxAnomaly = opts.max_anomaly ?? 0.85;
  const warnHealth = opts.warn_health ?? 0.72;
  const warnAnomaly = opts.warn_anomaly ?? 0.65;

  const mesh = summary.mesh || {};
  const meshHealth = mesh.mesh_health ?? 1;
  const highestAnomaly = mesh.highest_anomaly?.anomaly_score ?? 0;
  const criticalAlerts = mesh.critical_alert_count ?? 0;
  const alertCount = mesh.alert_count ?? 0;
  const fallbackCount = mesh.fallback_sensor_count ?? 0;

  const reasons = [];
  let decision = 'go';

  if (criticalAlerts > 0) { decision = 'hold'; reasons.push(`${criticalAlerts} critical alert(s)`); }
  if (meshHealth < minHealth) { decision = 'hold'; reasons.push(`mesh_health ${meshHealth.toFixed(3)} < ${minHealth}`); }
  if (highestAnomaly >= maxAnomaly) { decision = 'hold'; reasons.push(`highest_anomaly ${highestAnomaly.toFixed(3)} >= ${maxAnomaly}`); }

  if (decision === 'go') {
    if (meshHealth < warnHealth) { decision = 'warn'; reasons.push(`mesh_health ${meshHealth.toFixed(3)} < ${warnHealth}`); }
    if (highestAnomaly >= warnAnomaly) { decision = 'warn'; reasons.push(`highest_anomaly ${highestAnomaly.toFixed(3)} >= ${warnAnomaly}`); }
    if (fallbackCount > 0) { decision = 'warn'; reasons.push(`${fallbackCount} sensor(s) on fallback`); }
    if (alertCount > 0) { decision = 'warn'; reasons.push(`${alertCount} alert(s) active`); }
  }

  return { decision, reasons, mesh_health: meshHealth, highest_anomaly: highestAnomaly };
}
