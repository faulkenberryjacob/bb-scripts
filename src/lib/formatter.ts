/**
 * Formats a given time in milliseconds into a more readable string format (hours, minutes, or seconds).
 * @param {number} timeInMillis - The time in milliseconds to format.
 * @returns {string} - The formatted time string.
 */
export function formatTime(timeInMillis: number) {
  const seconds = timeInMillis / 1000;
  const minutes = seconds / 60;
  const hours = minutes / 60;

  if (hours >= 1) {
    return `${hours.toFixed(2)} hours`;
  } else if (minutes >= 1) {
    return `${minutes.toFixed(2)} minutes`;
  } else {
    return `${seconds.toFixed(2)} seconds`;
  }
}

/**
 * Formats a number into a dollar amount with commas and a dollar sign.
 * @param {number} money - The amount of money to format.
 * @returns {Promise<string>} - The formatted dollar amount.
 */
export function formatDollar(ns: NS, money: number) {
  return `$${ns.formatNumber(money)}`;
}

/**
 * Formats a given number into a short string representation with suffixes (k, m, b) for thousands, millions, and billions.
 * @param {number} num - The number to format.
 * @returns {Promise<string>} - A promise that resolves to the formatted number string.
 */
export async function shortFormatNumber(num: number) {
  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(1) + 'b';
  } else if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1) + 'm';
  } else if (num >= 1_000) {
    return (num / 1_000).toFixed(1) + 'k';
  }
  return num.toString();
}

/**
 * Formats a given number into a string with commas as thousands separators.
 * @param {number} num - The number to format.
 * @returns {Promise<string>} - A promise that resolves to the formatted number string.
 */
export async function formatNumber(num: number) {
  return num.toLocaleString('en-US');
}