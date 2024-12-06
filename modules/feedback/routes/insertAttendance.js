/**
 * @module insertAttendance
 * @memberof module:feedback
 * @summary Handles the insertion of attendance data.
 *
 * @requires ../../../config.json - Configuration settings for the application.
 *
 * @exports insertAttendance - Core module function.
 */

const config = require("../../../config.json");

/**
 * @async
 * @function insertAttendance
 * @memberof module:insertAttendance
 * @summary Inserts an attendance log into the database.
 *
 * @param {object} link - Database connection for database queries.
 * @param {object} data - The attendee data, including the session ID.
 * @returns {Promise<boolean>} - True if the process completes successfully
 * @throws {Error} - Throws an error if the database connection fails or if the attendance data insertion fails.
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

    return true;
  } catch (error) {
    throw error;
  }
};

module.exports = { insertAttendance };
