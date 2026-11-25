export interface BatteryValues { left: number; right: number; case: number }
export interface BatteryReport { battery: BatteryValues; charging: BatteryValues }

export const emptyBattery = (): BatteryValues => ({ left: -1, right: -1, case: -1 });

// 0106 replies and event 01 share the same count / part / raw-byte layout.
// A query is a snapshot; a push can update just one part. Zero means unknown
// in the vendor protocol, rather than a confirmed empty battery.
export function parseBattery(payload: number[], previous?: BatteryReport): BatteryReport {
  if (payload.length < 4 || ![0, 1].includes(payload[0]) || !payload[1] || payload.length !== 2 + payload[1] * 2) {
    throw new Error('Invalid battery report');
  }
  const battery = previous ? { ...previous.battery } : emptyBattery();
  const charging = previous ? { ...previous.charging } : emptyBattery();
  for (let offset = 2; offset < payload.length; offset += 2) {
    const key = ({ 1: 'left', 2: 'right', 3: 'case' } as const)[payload[offset]];
    if (!key) continue;
    const raw = payload[offset + 1];
    const level = raw & 0x7f;
    const valid = level > 0 && level <= 100;
    battery[key] = valid ? level : -1;
    charging[key] = valid ? (raw & 0x80 ? 1 : 0) : -1;
  }
  return { battery, charging };
}
