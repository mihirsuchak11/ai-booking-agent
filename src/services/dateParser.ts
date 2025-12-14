/**
 * Helper functions for parsing dates and times from natural language
 */

/**
 * Parse relative date strings like "tomorrow", "next Monday" into ISO date format (YYYY-MM-DD)
 */
export function parseRelativeDate(dateString: string, timezone?: string): string | null {
    const lower = dateString.toLowerCase().trim();
    const now = new Date();

    // Handle "today"
    if (lower === "today") {
        return now.toISOString().split("T")[0];
    }

    // Handle "tomorrow"
    if (lower === "tomorrow") {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow.toISOString().split("T")[0];
    }

    // Handle "next [day of week]"
    const nextDayMatch = lower.match(/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
    if (nextDayMatch) {
        const targetDay = nextDayMatch[1];
        const daysOfWeek = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
        const targetDayIndex = daysOfWeek.indexOf(targetDay);
        const currentDayIndex = now.getDay();

        // Calculate days until target day
        let daysUntil = targetDayIndex - currentDayIndex;
        if (daysUntil <= 0) {
            daysUntil += 7; // Next week
        }

        const targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + daysUntil);
        return targetDate.toISOString().split("T")[0];
    }

    // Handle "this [day of week]"
    const thisDayMatch = lower.match(/this\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
    if (thisDayMatch) {
        const targetDay = thisDayMatch[1];
        const daysOfWeek = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
        const targetDayIndex = daysOfWeek.indexOf(targetDay);
        const currentDayIndex = now.getDay();

        let daysUntil = targetDayIndex - currentDayIndex;
        if (daysUntil < 0) {
            daysUntil += 7; // Next occurrence
        }

        const targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + daysUntil);
        return targetDate.toISOString().split("T")[0];
    }

    // Try to parse as ISO date (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return dateString;
    }

    // Try to parse MM/DD/YYYY or DD/MM/YYYY
    const slashDateMatch = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashDateMatch) {
        const [_, first, second, year] = slashDateMatch;
        // Assume MM/DD/YYYY for US format (can be enhanced based on locale)
        const month = parseInt(first);
        const day = parseInt(second);
        const date = new Date(parseInt(year), month - 1, day);
        return date.toISOString().split("T")[0];
    }

    return null;
}

/**
 * Parse time strings like "2pm", "14:00", "2:30 PM" into 24-hour format (HH:MM)
 */
export function parseTime(timeString: string): string | null {
    const lower = timeString.toLowerCase().trim();

    // Handle "noon"
    if (lower === "noon") {
        return "12:00";
    }

    // Handle "midnight"
    if (lower === "midnight") {
        return "00:00";
    }

    // Try to parse HH:MM format (24-hour)
    const time24Match = lower.match(/^(\d{1,2}):(\d{2})$/);
    if (time24Match) {
        const hours = parseInt(time24Match[1]);
        const minutes = parseInt(time24Match[2]);
        if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
            return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
        }
    }

    // Try to parse with AM/PM
    const timeAmPmMatch = lower.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
    if (timeAmPmMatch) {
        let hours = parseInt(timeAmPmMatch[1]);
        const minutes = timeAmPmMatch[2] ? parseInt(timeAmPmMatch[2]) : 0;
        const period = timeAmPmMatch[3];

        if (period === "pm" && hours !== 12) {
            hours += 12;
        } else if (period === "am" && hours === 12) {
            hours = 0;
        }

        if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
            return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
        }
    }

    return null;
}

/**
 * Extract structured date and time from a message
 * Returns normalized ISO date (YYYY-MM-DD) and 24-hour time (HH:MM)
 */
export function extractDateTime(message: string): {
    date?: string;
    time?: string;
} {
    const result: { date?: string; time?: string } = {};

    // Try to extract date
    const datePatterns = [
        /\b(tomorrow|today)\b/i,
        /\b(next|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
        /\b(\d{4}-\d{2}-\d{2})\b/,
        /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/,
    ];

    for (const pattern of datePatterns) {
        const match = message.match(pattern);
        if (match) {
            const parsed = parseRelativeDate(match[0]);
            if (parsed) {
                result.date = parsed;
                break;
            }
        }
    }

    // Try to extract time
    const timePatterns = [
        /\b(\d{1,2}):(\d{2})\s*(am|pm)\b/i,
        /\b(\d{1,2})\s*(am|pm)\b/i,
        /\b(\d{1,2}):(\d{2})\b/,
        /\b(noon|midnight)\b/i,
    ];

    for (const pattern of timePatterns) {
        const match = message.match(pattern);
        if (match) {
            const parsed = parseTime(match[0]);
            if (parsed) {
                result.time = parsed;
                break;
            }
        }
    }

    return result;
}
