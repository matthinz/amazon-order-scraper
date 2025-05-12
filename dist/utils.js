import { DateTime } from "luxon";
const DURATION_MULTIPLIERS = {
    day: 24 * 60 * 60 * 1000, // milliseconds in a day
    hour: 60 * 60 * 1000, // milliseconds in an hour
    minute: 60 * 1000, // milliseconds in a minute
    week: 7 * 24 * 60 * 60 * 1000, // milliseconds in a week
};
const DURATION_TYPES = {
    day: ["day", "d", "days"],
    hour: ["hour", "h", "hr", "hrs", "hours"],
    minute: ["minute", "m", "min", "mins", "minutes"],
    week: ["week", "w", "wk", "wks", "weeks"],
};
const DURATION_REGEX = new RegExp([
    "^\\s*",
    "(-?\s*\\d+(\\.\\d+)?)",
    "\\s*",
    "(",
    [
        ...Object.keys(DURATION_MULTIPLIERS),
        ...Object.values(DURATION_TYPES).flat(),
    ].join("|"),
    ")\\s*$",
].join(""), "i");
const DATE_FORMATS = ["YYYY-MM-DD"];
export function parseDateInput(input, referenceDate) {
    const duration = parseDuration(input);
    if (duration != null) {
        return new Date(referenceDate.getTime() + duration);
    }
    for (const format of DATE_FORMATS) {
        const dateTime = DateTime.fromFormat(input, format);
        if (dateTime.isValid) {
            return dateTime.toJSDate();
        }
    }
}
export function parseDuration(input) {
    const m = DURATION_REGEX.exec(input);
    if (!m) {
        return;
    }
    const value = parseFloat(m[1]);
    const unit = Object.keys(DURATION_MULTIPLIERS).find((key) => DURATION_TYPES[key].includes(m[3].toLowerCase()));
    if (!unit) {
        return;
    }
    const multiplier = DURATION_MULTIPLIERS[unit];
    return value * multiplier;
}
//# sourceMappingURL=utils.js.map