export const AMAZON_ORDER_ID_PATTERN = "\\d{3}-\\d{7}-\\d{7}";

export const MONEY_PATTERN = "-?\\$?\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})?";

export const DATE_MMMM_DD_YYYY_PATTERN =
  "(?<month>[a-z]+)\\.? (?<day>\\d{1,2}), (?<year>\\d{4})";

export const DATE_MMMM_DD_PATTERN = "(?<month>[a-z]+)\\.? (?<day>\\d{1,2})";

export const TIME_OF_DAY_PATTERN = "(\\d{1,2}):(\\d{2})\\s*(AM|PM)";

export const CREDIT_CARD_PATTERN =
  "(\\*\\*\\*\\* \\*\\*\\*\\* \\*\\*\\*\\* (?<last4>\\d{4}))";

export const CREDIT_CARD_NAME_PATTERN =
  "(Visa|MasterCard|American Express|Discover)";
