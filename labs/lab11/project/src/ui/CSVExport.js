function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function serializeSamples(samples) {
  const bodyCount = Math.max(0, ...samples.map(sample => sample.bodies.length));
  const header = ['t_s'];
  for (let i = 1; i <= bodyCount; i++)
    header.push(`body_${i}_id`, `body_${i}_x_m`, `body_${i}_y_m`);
  header.push('kinetic_J', 'mechanical_energy_J', 'energy_ledger_J',
    'energy_change_pct', 'propulsion_reserve_pct', 'mission_status');
  const rows = samples.map(sample => {
    const row = [sample.time];
    for (let i = 0; i < bodyCount; i++) {
      const body = sample.bodies[i];
      row.push(body ? body.id : '', body ? body.x : '', body ? body.y : '');
    }
    row.push(sample.kinetic, sample.mechanical, sample.energy,
      sample.energyChangePct, sample.charge, sample.missionStatus);
    return row.map(csvCell).join(',');
  });
  return [header.join(','), ...rows].join('\r\n') + '\r\n';
}
