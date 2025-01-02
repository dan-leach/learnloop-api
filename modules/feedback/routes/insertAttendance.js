/**
 * @module insertAttendance
 * @memberof module:feedback
 * @summary Handles the insertion of attendance data into the database.
 *
 * @description
 * Provides functionality for logging attendance for a specific session by inserting
 * relevant attendee data into the configured attendance table.
 *
 * @requires ../../../config.json - Configuration settings for the application.
 *
 * @exports insertAttendance - Core module function for logging attendance.
 */

const config = require("../../../config.json");

/**
 * @async
 * @function insertAttendance
 * @memberof module:insertAttendance
 * @summary Inserts an attendance record into the database.
 *
 * @description
 * This function takes the attendee data and session ID, then inserts the information
 * into the attendance table. If the database connection is invalid or the insertion fails,
 * an error is thrown.
 *
 * @param {object} link - Database connection object for executing queries.
 * @param {object} data - The attendee data, including session ID, name, region, and organisation.
 * @param {string} data.id - The unique session identifier.
 * @param {object} data.attendee - Object containing attendee details.
 * @param {string} data.attendee.name - The name of the attendee.
 * @param {string} data.attendee.region - The region of the attendee.
 * @param {string} data.attendee.organisation - The organisation of the attendee.
 * @returns {Promise<boolean>} - Resolves to true if the insertion is successful.
 * @throws {Error} - Throws an error if the database connection is invalid or the query fails.
 */
const insertAttendance = async (link, data) => {
  // Ensure a valid database connection is provided
  if (!link) {
    throw new Error("Database connection failed.");
  }

  try {
    // Construct SQL query for inserting attendance data
    const query = `INSERT INTO ${config.feedback.tables.tblAttendance} 
      (id, name, region, organisation) 
      VALUES (?, ?, ?, ?)`;

    // Execute the insert query with attendance data
    await link.execute(query, [
      data.id,
      data.attendee.name,
      data.attendee.region,
      data.attendee.organisation,
    ]);

    return true; // Return true upon successful insertion
  } catch (error) {
    throw error; // Rethrow error for higher-level handling
  }
};

module.exports = { insertAttendance };
