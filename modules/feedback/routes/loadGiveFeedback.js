/**
 * @module loadGiveFeedback
 * @memberof module:feedback
 * @summary Module for loading the session details to populate the feedback form.
 *
 * @description This module contains the logic for returning the details for feedback session prior to
 * a user providing feedback via the feedback form.
 *
 * @requires ../../utilities/dateUtilities - Utilities for formatting date objects into various string representations.
 * @requires ./loadUpdateSession - Reuse selectSessionDetails from loadUpdateSessionRoute
 *
 * @exports loadGiveFeedback Core function for the module
 */

const dateUtilities = require("../../utilities/dateUtilities");

/**
 * @async
 * @function loadGiveFeedback
 * @memberof module:loadGiveFeedback
 * @summary Loads the details of a specific session, including its subsessions.
 *
 * @description This function retrieves the session details from the database, formats the date
 * to ISO format, and fetches any related subsession details. It also sanitizes the
 * organiser data by removing organiser data before returning the session object.
 *
 * @param {object} link - Database connection for executing queries.
 * @param {string} id - The unique identifier of the session to be loaded.
 * @returns {Promise<object>} - The session object containing details and subsessions.
 * @throws {Error} - Throws an error if the session cannot be retrieved.
 */
const loadGiveFeedback = async (link, id) => {
  try {
    // Retrieve session details from the database
    const loadUpdateSessionRoute = require("./loadUpdateSession");
    const session = await loadUpdateSessionRoute.selectSessionDetails(link, id);

    // Format the session date to ISO format
    session.date = dateUtilities.formatDateISO(session.date);

    // Extract subsession IDs from the session
    const subsessionIDs = session.subsessions;

    // Retrieve details for each subsession
    session.subsessions = await loadUpdateSessionRoute.selectSubsessionDetails(
      link,
      subsessionIDs
    );

    // Remove organiser data
    delete session.organisers;

    return session; // Return the cleaned-up session object
  } catch (error) {
    throw error; // Rethrow the error for handling by the caller
  }
};

module.exports = { loadGiveFeedback };
