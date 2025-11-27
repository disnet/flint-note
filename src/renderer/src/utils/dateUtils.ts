/**
 * Date utility functions for the Daily View feature
 * Handles week calculations, date formatting, and timezone operations
 */

export interface WeekRange {
  startDate: string; // ISO date string (YYYY-MM-DD)
  endDate: string; // ISO date string (YYYY-MM-DD)
  year: number;
  weekNumber: number;
}

/**
 * Get the start and end dates for a week containing the given date
 * Week starts on Monday and ends on Sunday
 */
export function getWeekDates(date: string | Date): WeekRange {
  const targetDate = typeof date === 'string' ? new Date(date) : new Date(date);

  // Reset to start of day to avoid timezone issues
  targetDate.setHours(0, 0, 0, 0);

  // Get the day of week (0 = Sunday, 1 = Monday, etc.)
  const dayOfWeek = targetDate.getDay();

  // Calculate days to subtract to get to Monday (start of week)
  // If Sunday (0), subtract 6 days; if Monday (1), subtract 0 days, etc.
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  // Calculate start date (Monday)
  const startDate = new Date(targetDate);
  startDate.setDate(targetDate.getDate() - daysToMonday);

  // Calculate end date (Sunday)
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);

  // Format as ISO date strings (YYYY-MM-DD)
  const startDateString = formatISODate(startDate);
  const endDateString = formatISODate(endDate);

  // Calculate week number (ISO week numbering)
  const weekNumber = getISOWeekNumber(startDate);
  const year = startDate.getFullYear();

  return {
    startDate: startDateString,
    endDate: endDateString,
    year,
    weekNumber
  };
}

/**
 * Format a Date object as ISO date string (YYYY-MM-DD)
 */
export function formatISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse ISO date string to Date object in local timezone
 */
export function parseISODate(dateString: string): Date {
  const date = new Date(dateString + 'T00:00:00');
  return date;
}

/**
 * Get ISO week number for a date (1-53)
 * ISO weeks start on Monday and week 1 contains January 4th
 */
export function getISOWeekNumber(date: Date): number {
  const tempDate = new Date(date);
  tempDate.setHours(0, 0, 0, 0);

  // Set to nearest Thursday: current date + 4 - current day number
  // Make Sunday's day number 7
  tempDate.setDate(tempDate.getDate() + 4 - (tempDate.getDay() || 7));

  // Get first day of year
  const yearStart = new Date(tempDate.getFullYear(), 0, 1);

  // Calculate full weeks to nearest Thursday
  const weekNumber = Math.ceil(
    ((tempDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );

  return weekNumber;
}

/**
 * Format week range for display (e.g., "Week of Sep 15" or "Sep 15 - 21")
 */
export function formatWeekRange(
  weekRange: WeekRange,
  format: 'short' | 'long' = 'short'
): string {
  const startDate = parseISODate(weekRange.startDate);
  const endDate = parseISODate(weekRange.endDate);

  if (format === 'short') {
    // Format as "Week of Sep 15"
    const monthName = startDate.toLocaleDateString('en-US', { month: 'short' });
    const day = startDate.getDate();
    return `Week of ${monthName} ${day}`;
  } else {
    // Format as "Sep 15 - 21" or "Sep 15 - Oct 1" if crossing months
    const startMonth = startDate.toLocaleDateString('en-US', { month: 'short' });
    const endMonth = endDate.toLocaleDateString('en-US', { month: 'short' });
    const startDay = startDate.getDate();
    const endDay = endDate.getDate();

    if (startMonth === endMonth) {
      return `${startMonth} ${startDay} - ${endDay}`;
    } else {
      return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
    }
  }
}

/**
 * Get the previous week's date range
 */
export function getPreviousWeek(weekRange: WeekRange): WeekRange {
  const startDate = parseISODate(weekRange.startDate);
  startDate.setDate(startDate.getDate() - 7);
  return getWeekDates(startDate);
}

/**
 * Get the next week's date range
 */
export function getNextWeek(weekRange: WeekRange): WeekRange {
  const startDate = parseISODate(weekRange.startDate);
  startDate.setDate(startDate.getDate() + 7);
  return getWeekDates(startDate);
}

/**
 * Get the current week's date range
 */
export function getCurrentWeek(): WeekRange {
  return getWeekDates(new Date());
}

/**
 * Check if a date is today
 */
export function isToday(dateString: string): boolean {
  const today = formatISODate(new Date());
  return dateString === today;
}

/**
 * Format date for display in daily view headers (e.g., "Tue Sep 16")
 */
export function formatDayHeader(dateString: string): string {
  const date = parseISODate(dateString);
  const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
  const monthName = date.toLocaleDateString('en-US', { month: 'short' });
  const day = date.getDate();
  return `${dayName} ${monthName} ${day}`;
}

/**
 * Generate array of date strings for a week range
 */
export function getWeekDays(weekRange: WeekRange): string[] {
  const days: string[] = [];
  const startDate = parseISODate(weekRange.startDate);

  for (let i = 0; i < 7; i++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + i);
    days.push(formatISODate(currentDate));
  }

  return days;
}

/**
 * Check if two dates are in the same week
 */
export function isSameWeek(date1: string | Date, date2: string | Date): boolean {
  const week1 = getWeekDates(date1);
  const week2 = getWeekDates(date2);
  return week1.startDate === week2.startDate;
}
