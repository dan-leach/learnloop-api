/**
 * @module updateSession
 * @memberof module:interaction
 * @summary Module for updating the session details.
 *
 * @description This module facilitates the updating of session data. It provides
 * a comprehensive set of asynchronous functions to update, retrieve, and manipulate session
 * details stored in the database. The primary focus of this module is to
 * ensure accurate session data management, handle changes made by users, and send
 * notifications to organisers regarding updates or removals.
 *
 * @requires ../../../config.json - Configuration file containing database table
 * settings for session data retrieval.
 *
 * @exports updateSession Core function for the module
 */

const config = require("../../../config.json");

/**
 * @async
 * @function updateSession
 * @memberof module:updateSession
 * @summary Updates the details of a session.
 *
 * @param {object} link - Database connection for executing SQL queries.
 * @param {object} data - The updated session data.
 * @returns {Promise<boolean>} - Returns true if the update is successful.
 * @throws {Error} - Throws an error for any issues during the update process.
 */
const updateSession = async (link, data) => {
  // Retrieve old session details from the database
  const oldSessionDetails = await selectSessionDetails(link, data.id);

  const organiser = {
    name: data.name,
    email: data.email.toLowerCase(),
    salt: oldSessionDetails.organisers[0].salt,
    pinHash: oldSessionDetails.organisers[0].pinHash,
  };
  const status = {
    createStep: "ready",
    facilitatorIndex: 0,
    lockedSlides: [],
  };

  const betaTesters = require("../../private/betaTesters.json");
  if (!betaTesters.includes(organiser.email)) {
    throw Object.assign(
      new Error("Email is not on list of approved beta-testers"),
      { statusCode: 403 }
    );
  }

  // Insert the updated session data into the database
  await updateSessionInDatabase(link, data, organiser, status);

  //deactivate the old submissions which may no longer be appropriate for the slide
  deactivateOldSubmissions(link, data.id);

  return true;
};

/**
 * @async
 * @function selectSessionDetails
 * @memberof module:updateSession
 * @summary Retrieves session details from the database by session ID.
 *
 * @description This function executes a SQL query to select a session from the database
 * based on the provided session ID. If the session is found, it parses
 * any JSON fields and returns the session details. If the session is not
 * found, an error is thrown.
 *
 * @param {object} link - Database connection for executing SQL queries.
 * @param {number|string} id - The ID of the session to retrieve.
 * @returns {Promise<object>} - A promise that resolves to the session details.
 * @throws {Error} - Throws an error if the session cannot be found or if the query fails.
 */
const selectSessionDetails = async (link, id) => {
  // Execute SQL query to select session by ID
  const [rows] = await link.execute(
    `SELECT * FROM ${config.interaction.tables.tblSessions} WHERE id = ?`,
    [id]
  );

  if (rows.length > 0) {
    const session = rows[0];

    // Parse JSON fields in the session object
    ["organisers", "slides", "status"].forEach((field) => {
      if (session[field]) {
        session[field] = JSON.parse(session[field]);
      }
    });

    return session; // Return the session details
  }

  // Throw an error if no session is found
  throw Object.assign(new Error("Session not found"), { statusCode: 400 });
};

/**
 * @async
 * @function updateSessionInDatabase
 * @memberof module:updateSession
 * @summary Updates a session's details in the database.
 *
 * @description This function modifies the specified session's details, including its name, title,
 * date, organisers, questions, and other relevant fields based on the provided session data.
 *
 * @param {Object} link - The MySQL connection object used to execute queries.
 * @param {Object} data - The session data to be updated.
 * @param {Object} organiser - The organiser data  to be updated.
 * @param {Object} status - The status data to be updated.
 * @returns {Promise<void>} - Resolves when the session has been successfully updated in the database.
 * @throws {Error} - Throws an error if the query execution fails.
 */
const updateSessionInDatabase = async (link, data, organiser, status) => {
  // Destructure the session data object for ease of access
  const { id, title, slides, feedbackId } = data;

  // Construct the update query for modifying session details
  const query = `UPDATE ${config.interaction.tables.tblSessions} SET 
                  title = ?, 
                  organisers = ?, 
                  slides = ?, 
                  feedbackId = ?, 
                  status = ?
                  WHERE id = ?`;

  // Execute the query with the provided session data and subsession IDs
  await link.execute(query, [
    title,
    [organiser],
    slides,
    feedbackId ? feedbackId : null,
    status,
    id,
  ]);
};

/**
 * @async
 * @function deactivateOldSubmissions
 * @memberof module:updateSession
 * @summary Sets the active parameter for old submissions to false.
 *
 * @description Deactivates submissions made prior to the session update which may no longer
 * be appropriate for the slides.
 *
 * @param {Object} link - The MySQL connection object used to execute queries.
 * @param {string} id - The session ID for which submissions are to be deactivated.
 * @returns {Promise<void>} - Resolves when the submissions have been deactivated in the database.
 * @throws {Error} - Throws an error if the query execution fails.
 */
const deactivateOldSubmissions = async (link, id) => {
  // Execute the query with the provided id
  await link.execute(
    `UPDATE ${config.interaction.tables.tblSubmissions} SET active = ? WHERE id = ? AND active = ?`,
    [false, id, true]
  );
};

module.exports = {
  updateSession,
};
