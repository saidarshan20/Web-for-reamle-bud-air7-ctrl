import { describe, expect, it } from 'vitest';
import { parseBattery } from '@/lib/battery';

describe('Battery reports', () => {
  it('separates charging bits from percentages for both buds and the case', () => {
    expect(parseBattery([0, 3, 1, 90, 2, 0x80 | 65, 3, 0x80 | 100])).toEqual({
      battery: { left: 90, right: 65, case: 100 }, charging: { left: 0, right: 1, case: 1 },
    });
  });
  it('merges partial pushes but clears omitted parts on a fresh query', () => {
    const previous = parseBattery([0, 3, 1, 90, 2, 80, 3, 70]);
    expect(parseBattery([1, 1, 3, 60], previous).battery).toEqual({ left: 90, right: 80, case: 60 });
    expect(parseBattery([0, 1, 1, 85]).battery).toEqual({ left: 85, right: -1, case: -1 });
  });
  it('does not interpret unknown or invalid readings as empty or charging', () => {
    for (const value of [0, 0x80, 101, 127, 255]) {
      const report = parseBattery([0, 1, 3, value]);
      expect(report.battery.case).toBe(-1);
      expect(report.charging.case).toBe(-1);
    }
    expect(parseBattery([0, 1, 3, 1]).battery.case).toBe(1);
  });
  it('rejects empty, truncated and failed reports without changing existing data', () => {
    for (const payload of [[], [0, 0], [0, 2, 1, 90], [0, 1, 1, 90, 2, 80], [14, 1, 1, 90]]) {
      expect(() => parseBattery(payload)).toThrow('Invalid battery report');
    }
  });
});
