/**
 * @module dateUtilities
 * @memberof module:LearnLoopAPI
 * @summary Utilities for formatting date objects into various string representations.
 *
 * @description
 * The `dateUtilities` module provides functions to convert JavaScript Date objects
 * into different string formats, specifically tailored for common date representations.
 * This includes formatting dates as 'dd/mm/yyyy' for UK-style dates and 'YYYY-MM-DD'
 * for ISO standard dates. These functions enhance the usability of date data across
 * the LearnLoop API, ensuring consistent date formatting for various use cases.
 *
 * @exports formatDateUK - A function that formats a Date object into a UK date string
 * representation ('dd/mm/yyyy').
 * @exports formatDateISO - A function that formats a Date object into an ISO date string
 * representation ('YYYY-MM-DD').
 */

/**
 * @function formateDateUK
 * @memberof module:dateUtilities
 * @summary Formats a Date object as 'dd/mm/yyyy'.
 *
 * @param {Date} date - The date object to format.
 * @returns {string} The formatted date as 'dd/mm/yyyy'.
 */
function formatDateUK(date) {
  //if string passed, try to convert it to a date object
  if (typeof date === "string") date = new Date(date);
  // Get day, month, and year from the date object
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0"); // Months are zero-based
  const year = date.getFullYear();

  return `${day}/${month}/${year}`; // Return formatted date string
}

/**
 * @function formatDateISO
 * @memberof module:dateUtilities
 * @summary Formats a Date object as a string in the format YYYY-MM-DD.
 *
 * @param {Date} date - The Date object to format.
 * @returns {string} The formatted date string in YYYY-MM-DD format.
 */
const formatDateISO = (date) => {
  // Get year, month, and day from the date object
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0"); // Months are zero-based
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`; // Return formatted date string
};

module.exports = {
  formatDateUK,
  formatDateISO,
};
