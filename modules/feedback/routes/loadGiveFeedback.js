/**
 * @module loadGiveFeedback
 * @summary Module for loading the session details to populate the feedback form.
 *
 * @description This module provides functionality for retrieving and preparing session details for
 * use in the feedback form. It formats session dates, retrieves subsession details, and ensures that
 * sensitive organiser information is excluded from the returned session data.
 *
 * @requires ../../utilities/dateUtilities - Provides utilities for formatting dates into different formats.
 * @requires ./loadUpdateSession - Provides methods for fetching session and subsession details from the database.
 *
 * @exports loadGiveFeedback - Core function for this module.
 */

const dateUtilities = require("../../utilities/dateUtilities");

/**
 * @async
 * @function loadGiveFeedback
 * @memberof module:loadGiveFeedback
 * @summary Fetches and formats session details for the feedback form.
 *
 * @description This function retrieves a session's details from the database, including its subsession information.
 * It formats the session date to ISO format, fetches additional subsession details as needed, and sanitizes the
 * session object by removing organiser information.
 *
 * @param {object} link - The database connection object used to execute SQL queries.
 * @param {string} id - The unique identifier of the session to retrieve.
 * @returns {Promise<object>} - Resolves with the session object, including formatted date and subsessions.
 * @throws {Error} - Throws an error if the session details cannot be retrieved or formatted.
 */
const loadGiveFeedback = async (link, id) => {
  // Import methods for fetching session and subsession details
  const loadUpdateSessionRoute = require("./loadUpdateSession");

  // Fetch the main session details
  const session = await loadUpdateSessionRoute.selectSessionDetails(link, id);

  // Check not accessing a subsession directly
  if (session.isSubsession) {
    throw Object.assign(
      new Error(
        "Please use the session series code to submit feedback (cannot submit direct to subsession)"
      ),
      { statusCode: 400 }
    );
  }

  // Format the session date to UK format
  session.date = dateUtilities.formatDateUK(session.date);

  // Extract and retrieve subsession details, if any
  const subsessionIDs = session.subsessions;
  session.subsessions = await loadUpdateSessionRoute.selectSubsessionDetails(
    link,
    subsessionIDs
  );

  // Remove organiser data from the session object
  delete session.organisers;

  return session; // Return the processed session object
};

module.exports = { loadGiveFeedback };
