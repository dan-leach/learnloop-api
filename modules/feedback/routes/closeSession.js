/**
 * @module closeSession
 * @memberof module:feedback
 * @summary Module for closing a session to further feedback submissions.
 *
 * @description
 * This module provides functionality to close an active feedback session, update the session status in the database,
 * and notify all associated organizers except the one performing the closure.
 *
 * @requires ../../../config.json - Configuration file containing database table
 * settings for session data retrieval.
 * @requires ./insertSession - For inserting new subsessions as part of an session series update.
 *
 * @exports closeSession Core function for the module
 */

/**
 * @async
 * @function closeSession
 * @memberof module:closeSession
 * @summary Closes a session to further feedback and notifies organisers other than the one performing the closure.
 *
 * @requires ./updateSession - Uses existing update functions for getting the session details and closing a session in the database
 *
 * @param {object} link - Database connection for executing SQL queries.
 * @param {object} sessionDetails - The details of the session being closed.
 * @param {object} user - The user making the update, including their email.
 * @returns {Promise<array>} - Returns array of any emails that failed to send.
 * @throws {Error} - Throws an error for any issues during the closure process.
 */
const closeSession = async (link, sessionDetails, user) => {
  const updateSessionRoute = require("./updateSession");

  // Close session in the database
  await updateSessionRoute.closeSessionInDatabase(link, sessionDetails.id);

  // Notify organisers of the closure
  let sendMailFails = [];
  for (let organiser of sessionDetails.organisers) {
    if (organiser.email === user.email) continue;
    const emailOutcome = await updateSessionRoute.emailOrganiserUpdate(
      sessionDetails,
      user,
      organiser,
      buildMailBodyClosure,
      "Feedback request closed"
    );
    if (!emailOutcome.sendSuccess)
      sendMailFails.push({
        name: organiser.name,
        email: organiser.email,
        error: emailOutcome.error,
      });
  }

  return sendMailFails;
};

/**
 * @function buildMailBodyClosure
 * @memberof module:closeSession
 * @summary Constructs the email body for notifying organisers about the closure of a session.
 *
 * @description This function generates a personalized email body that informs the recipient of the closure
 * of their feedback request, including relevant session and series details.
 *
 * @requires ../../../config.json - For the client URL
 *
 * @param {Object} data - The session details.
 * @param {Object} user - The user who closed the session.
 * @param {Object} recipient - The recipient of the email, containing their name.
 * @returns {string} - The constructed HTML body for the email.
 */
const buildMailBodyClosure = (data, user, recipient) => {
  const config = require("../../../config.json");
  // Initialize the email body with a greeting and removal details
  let body = `
          <p>Hello ${recipient.name},</p>
          <p>Your feedback request on <a href='${config.client.url}'>LearnLoop</a> for the session '${data.title}' has been closed by ${user.name}. No further feedback can be submitted, but any submitted previously can still be viewed.</p>
      `;

  return body; // Return the constructed email body
};

module.exports = { closeSession };
