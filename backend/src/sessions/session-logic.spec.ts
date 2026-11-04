import { isValidDateString, validateSession, weekStart, weeklyMinutes } from './session-logic';

const TODAY = '2026-11-05'; // a Thursday
const limits = { min: 5, max: 480 };

describe('validateSession', () => {
  it('accepts a valid session', () => {
    expect(validateSession({ date: '2026-11-01', minutes: 45 }, limits, TODAY)).toEqual([]);
  });

  it('accepts today but rejects a date in the future', () => {
    expect(validateSession({ date: TODAY, minutes: 30 }, limits, TODAY)).toEqual([]);
    expect(validateSession({ date: '2026-11-06', minutes: 30 }, limits, TODAY)).toEqual([
      'date cannot be in the future',
    ]);
  });

  it('rejects malformed and impossible dates', () => {
    expect(validateSession({ date: '05/11/2026', minutes: 30 }, limits, TODAY)).toHaveLength(1);
    expect(validateSession({ date: '2026-02-31', minutes: 30 }, limits, TODAY)).toHaveLength(1);
  });

  it('enforces the minimum and maximum minutes inclusively', () => {
    expect(validateSession({ date: TODAY, minutes: 4 }, limits, TODAY)).toHaveLength(1);
    expect(validateSession({ date: TODAY, minutes: 5 }, limits, TODAY)).toEqual([]);
    expect(validateSession({ date: TODAY, minutes: 480 }, limits, TODAY)).toEqual([]);
    expect(validateSession({ date: TODAY, minutes: 481 }, limits, TODAY)).toHaveLength(1);
  });

  it('uses the configured limits, not hard-coded ones', () => {
    const custom = { min: 10, max: 60 };
    expect(validateSession({ date: TODAY, minutes: 5 }, custom, TODAY)).toEqual([
      'minutes must be between 10 and 60',
    ]);
    expect(validateSession({ date: TODAY, minutes: 90 }, custom, TODAY)).toHaveLength(1);
    expect(validateSession({ date: TODAY, minutes: 30 }, custom, TODAY)).toEqual([]);
  });

  it('reports every problem at once', () => {
    expect(validateSession({ date: '2030-01-01', minutes: 1 }, limits, TODAY)).toHaveLength(2);
  });
});

describe('isValidDateString', () => {
  it('checks the calendar, including leap days', () => {
    expect(isValidDateString('2028-02-29')).toBe(true);
    expect(isValidDateString('2027-02-29')).toBe(false);
  });
});

describe('weekly aggregation', () => {
  it('maps any day to the Monday of its week', () => {
    expect(weekStart('2026-11-05')).toBe('2026-11-02'); // Thursday
    expect(weekStart('2026-11-02')).toBe('2026-11-02'); // Monday
    expect(weekStart('2026-11-08')).toBe('2026-11-02'); // Sunday
  });

  it('returns six weeks, oldest first, including empty weeks', () => {
    const result = weeklyMinutes(
      [
        { date: '2026-11-03', minutes: 30 },
        { date: '2026-11-04', minutes: 20 },
        { date: '2026-10-14', minutes: 45 },
      ],
      6,
      TODAY,
    );
    expect(result).toHaveLength(6);
    expect(result[5]).toEqual({ weekStart: '2026-11-02', minutes: 50 });
    expect(result[2]).toEqual({ weekStart: '2026-10-12', minutes: 45 });
    expect(result[4]).toEqual({ weekStart: '2026-10-26', minutes: 0 });
    expect(result[0].minutes).toBe(0);
  });
});
