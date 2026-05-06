import {
  getWeekStart,
  getWeeklyData,
  getMonthlyWeeklyTotals,
  getMonthlyDayBreakdown,
  generateTheftCSV,
} from './theftUtils';

describe('theftUtils', () => {
  describe('getWeekStart', () => {
    it('returns the Sunday of the week for a given date', () => {
      const date = new Date('2025-01-15'); // A Wednesday
      const result = getWeekStart(date);
      expect(result.getDay()).toBe(0); // Sunday
    });

    it('returns the Sunday when given a Sunday', () => {
      const date = new Date('2025-01-12'); // A Sunday
      const result = getWeekStart(date);
      expect(result.getDay()).toBe(0);
    });

    it('returns the Sunday when given a Saturday', () => {
      const date = new Date('2025-01-11'); // A Saturday
      const result = getWeekStart(date);
      expect(result.getDay()).toBe(0);
    });

    it('resets time to midnight', () => {
      const date = new Date('2025-01-15T15:30:45.123Z'); // Wednesday with time
      const result = getWeekStart(date);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });
  });

  describe('getWeeklyData', () => {
    it('returns array of 7 zeros for empty incidents', () => {
      const result = getWeeklyData([]);
      expect(result).toEqual([0, 0, 0, 0, 0, 0, 0]);
    });

    it('counts incidents by day of week (metric: incidents)', () => {
      // Create incidents for different days of the current week
      const now = new Date();
      const weekStart = getWeekStart(now);
      const incidents = [
        { incidentDate: new Date(weekStart.getTime() + 0 * 24 * 60 * 60 * 1000), quantity: 1 }, // Sunday
        { incidentDate: new Date(weekStart.getTime() + 1 * 24 * 60 * 60 * 1000), quantity: 1 }, // Monday
        { incidentDate: new Date(weekStart.getTime() + 1 * 24 * 60 * 60 * 1000), quantity: 1 }, // Monday
        { incidentDate: new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000), quantity: 1 }, // Saturday
      ];
      const result = getWeeklyData(incidents, 'incidents');
      expect(result[0]).toBe(1); // Sunday
      expect(result[1]).toBe(2); // Monday
      expect(result[6]).toBe(1); // Saturday
      expect(result).toEqual([1, 2, 0, 0, 0, 0, 1]);
    });

    it('sums quantities by day of week (metric: quantity)', () => {
      const now = new Date();
      const weekStart = getWeekStart(now);
      const incidents = [
        { incidentDate: new Date(weekStart.getTime() + 0 * 24 * 60 * 60 * 1000), quantity: 5 }, // Sunday
        { incidentDate: new Date(weekStart.getTime() + 1 * 24 * 60 * 60 * 1000), quantity: 3 }, // Monday
        { incidentDate: new Date(weekStart.getTime() + 1 * 24 * 60 * 60 * 1000), quantity: 2 }, // Monday
      ];
      const result = getWeeklyData(incidents, 'quantity');
      expect(result[0]).toBe(5); // Sunday: 5 quantity
      expect(result[1]).toBe(5); // Monday: 3 + 2 quantity
      expect(result).toEqual([5, 5, 0, 0, 0, 0, 0]);
    });

    it('defaults to "incidents" metric when not specified', () => {
      const now = new Date();
      const weekStart = getWeekStart(now);
      const incidents = [
        { incidentDate: new Date(weekStart.getTime() + 0 * 24 * 60 * 60 * 1000), quantity: 5 },
        { incidentDate: new Date(weekStart.getTime() + 0 * 24 * 60 * 60 * 1000), quantity: 10 },
      ];
      const result = getWeeklyData(incidents); // no metric specified
      expect(result[0]).toBe(2); // count: 2 incidents, not 15 quantity
    });

    it('ignores incidents outside the current week', () => {
      const now = new Date();
      const weekStart = getWeekStart(now);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      const incidents = [
        { incidentDate: new Date(weekStart.getTime() - 1 * 24 * 60 * 60 * 1000), quantity: 1 }, // Before week
        { incidentDate: new Date(weekStart.getTime() + 3 * 24 * 60 * 60 * 1000), quantity: 1 }, // In week
        { incidentDate: new Date(weekEnd.getTime() + 1 * 24 * 60 * 60 * 1000), quantity: 1 }, // After week
      ];
      const result = getWeeklyData(incidents);
      expect(result.reduce((sum, d) => sum + d, 0)).toBe(1);
    });
  });

  describe('getMonthlyWeeklyTotals', () => {
    it('returns empty array for empty incidents', () => {
      const result = getMonthlyWeeklyTotals([]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('returns array of {total, isPartial} for each week of current month', () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const incidents = [
        { incidentDate: new Date(year, month, 1), quantity: 1 }, // Day 1
        { incidentDate: new Date(year, month, 8), quantity: 1 }, // Day 8 (week 2)
      ];
      const result = getMonthlyWeeklyTotals(incidents);
      expect(Array.isArray(result)).toBe(true);
      result.forEach(week => {
        expect(week).toHaveProperty('total');
        expect(week).toHaveProperty('isPartial');
        expect(typeof week.total).toBe('number');
        expect(typeof week.isPartial).toBe('boolean');
      });
    });

    it('marks current week as partial', () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const incidents = [
        { incidentDate: new Date(year, month, 1), quantity: 1 },
      ];
      const result = getMonthlyWeeklyTotals(incidents);
      const currentWeekIdx = Math.floor((now.getDate() - 1) / 7);
      if (result[currentWeekIdx]) {
        expect(result[currentWeekIdx].isPartial).toBe(true);
      }
    });

    it('does not include weeks after current week', () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const incidents = [
        { incidentDate: new Date(year, month, 1), quantity: 1 },
      ];
      const result = getMonthlyWeeklyTotals(incidents);
      const currentWeekIdx = Math.floor((now.getDate() - 1) / 7);
      expect(result.length).toBeLessThanOrEqual(currentWeekIdx + 1);
    });

    it('ignores incidents from other months', () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const lastMonth = month === 0 ? 11 : month - 1;
      const incidents = [
        { incidentDate: new Date(year, lastMonth, 25), quantity: 1 }, // Last month
        { incidentDate: new Date(year, month, 1), quantity: 1 }, // This month
      ];
      const result = getMonthlyWeeklyTotals(incidents);
      const total = result.reduce((sum, week) => sum + week.total, 0);
      expect(total).toBe(1);
    });

    it('sums quantities when metric is "quantity"', () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const incidents = [
        { incidentDate: new Date(year, month, 1), quantity: 5 },
        { incidentDate: new Date(year, month, 2), quantity: 3 },
      ];
      const result = getMonthlyWeeklyTotals(incidents, 'quantity');
      expect(result[0].total).toBe(8);
    });
  });

  describe('getMonthlyDayBreakdown', () => {
    it('returns 2D array of 5 weeks x 7 days for empty incidents', () => {
      const result = getMonthlyDayBreakdown([]);
      expect(result.length).toBe(5);
      result.forEach(week => {
        expect(week.length).toBe(7);
        week.forEach(day => {
          expect(day).toBe(0);
        });
      });
    });

    it('correctly places incidents in the 2D array', () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const incidents = [
        { incidentDate: new Date(year, month, 1), quantity: 1 }, // Day 1 (week 0, day depends on calendar)
        { incidentDate: new Date(year, month, 8), quantity: 1 }, // Day 8 (week 1)
      ];
      const result = getMonthlyDayBreakdown(incidents);
      expect(result.length).toBe(5);
      result.forEach(week => {
        expect(week.length).toBe(7);
      });
      // Verify that some cells have data
      const totalIncidents = result.flat().reduce((sum, d) => sum + d, 0);
      expect(totalIncidents).toBe(2);
    });

    it('sums quantities correctly', () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const incidents = [
        { incidentDate: new Date(year, month, 1), quantity: 5 },
        { incidentDate: new Date(year, month, 1), quantity: 3 },
      ];
      const result = getMonthlyDayBreakdown(incidents, 'quantity');
      const totalQuantity = result.flat().reduce((sum, d) => sum + d, 0);
      expect(totalQuantity).toBe(8);
    });

    it('ignores incidents from other months', () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const lastMonth = month === 0 ? 11 : month - 1;
      const incidents = [
        { incidentDate: new Date(year, lastMonth, 25), quantity: 1 }, // Last month
        { incidentDate: new Date(year, month, 1), quantity: 1 }, // This month
      ];
      const result = getMonthlyDayBreakdown(incidents);
      const total = result.flat().reduce((sum, d) => sum + d, 0);
      expect(total).toBe(1);
    });
  });

  describe('generateTheftCSV', () => {
    it('returns CSV string with correct header', () => {
      const result = generateTheftCSV([], {}, {});
      const lines = result.split('\n');
      expect(lines[0]).toBe('Date,Item,Quantity,Shelf Aisle,Shelf Bay,Found At,Notes,Logged By');
    });

    it('generates CSV with incident data', () => {
      const incidents = [
        {
          incidentDate: '2025-01-15',
          itemId: 'item1',
          quantity: 2,
          shelfAisle: 'A1',
          shelfBay: 'B1',
          foundAtId: 'loc1',
          notes: 'Found in back',
          loggedBy: 'John',
        },
      ];
      const itemMap = { item1: 'Widget' };
      const locMap = { loc1: 'Storage Room' };
      const result = generateTheftCSV(incidents, itemMap, locMap);
      const lines = result.split('\n');
      expect(lines.length).toBe(2); // header + 1 row
      expect(lines[1]).toContain('2025-01-15');
      expect(lines[1]).toContain('Widget');
      expect(lines[1]).toContain('2');
    });

    it('escapes quotes in CSV fields', () => {
      const incidents = [
        {
          incidentDate: '2025-01-15',
          itemId: 'item1',
          quantity: 1,
          shelfAisle: 'A"1',
          shelfBay: null,
          foundAtId: null,
          notes: 'Quote: "test"',
          loggedBy: null,
        },
      ];
      const result = generateTheftCSV(incidents, {}, {});
      expect(result).toContain('""'); // Escaped quotes
    });

    it('handles missing itemId and foundAtId', () => {
      const incidents = [
        {
          incidentDate: '2025-01-15',
          itemId: 'unknown',
          quantity: 1,
          shelfAisle: 'A1',
          shelfBay: 'B1',
          foundAtId: 'unknown',
          notes: 'Test',
          loggedBy: 'John',
        },
      ];
      const itemMap = {};
      const locMap = {};
      const result = generateTheftCSV(incidents, itemMap, locMap);
      expect(result).not.toThrow;
    });

    it('handles null and undefined values', () => {
      const incidents = [
        {
          incidentDate: '2025-01-15',
          itemId: 'item1',
          quantity: 1,
          shelfAisle: null,
          shelfBay: undefined,
          foundAtId: null,
          notes: null,
          loggedBy: undefined,
        },
      ];
      const result = generateTheftCSV(incidents, { item1: 'Widget' }, {});
      expect(result).toBeTruthy();
      const lines = result.split('\n');
      expect(lines.length).toBe(2);
    });

    it('generates multiple rows correctly', () => {
      const incidents = [
        {
          incidentDate: '2025-01-15',
          itemId: 'item1',
          quantity: 2,
          shelfAisle: 'A1',
          shelfBay: 'B1',
          foundAtId: 'loc1',
          notes: 'Note 1',
          loggedBy: 'John',
        },
        {
          incidentDate: '2025-01-16',
          itemId: 'item2',
          quantity: 1,
          shelfAisle: 'A2',
          shelfBay: 'B2',
          foundAtId: 'loc2',
          notes: 'Note 2',
          loggedBy: 'Jane',
        },
      ];
      const itemMap = { item1: 'Widget', item2: 'Gadget' };
      const locMap = { loc1: 'Storage', loc2: 'Back' };
      const result = generateTheftCSV(incidents, itemMap, locMap);
      const lines = result.split('\n');
      expect(lines.length).toBe(3); // header + 2 rows
    });
  });
});
