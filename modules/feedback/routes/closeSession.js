/**
 * @module closeSession
 * @memberof module:feedback
 * @summary Handles the closure of a feedback session and notifies relevant organisers.
 *
 * @description
 * This module provides functionality to close an active feedback session, update its status in the database,
 * and notify all associated organisers except the one performing the closure.
 *
 * @requires ../../../config.json - Configuration file containing client URL and other settings.
 * @requires ./updateSession - Module for updating session details and emailing organisers.
 *
 * @exports closeSession - Core function for closing sessions.
 */

/**
 * @async
 * @function closeSession
 * @memberof module:closeSession
 * @summary Closes a session to further feedback and notifies organisers other than the one performing the closure.
 *
 * @description
 * This function updates the session status in the database and sends email notifications to organisers,
 * excluding the organiser who initiated the closure. Any email sending failures are returned.
 *
 * @param {object} link - Database connection for executing SQL queries.
 * @param {object} sessionDetails - The details of the session being closed, including its ID and organisers.
 * @param {object} user - The user initiating the closure, including their email and name.
 * @returns {Promise<array>} - Resolves to an array of objects containing details of failed email notifications, if any.
 * @throws {Error} - Throws an error if the session cannot be updated or notifications fail.
 */
const closeSession = async (link, sessionDetails, user) => {
  const updateSessionRoute = require("./updateSession");

  // Update session status in the database to closed
  await updateSessionRoute.closeSessionInDatabase(link, sessionDetails.id);

  // Notify other organisers of the session closure
  const sendMailFails = [];
  for (const organiser of sessionDetails.organisers) {
    if (organiser.email === user.email) continue; // Skip notifying the organiser performing the closure

    try {
      const emailOutcome = await updateSessionRoute.emailOrganiserUpdate(
        sessionDetails,
        user,
        organiser,
        buildMailBodyClosure,
        "Feedback request closed"
      );

      if (!emailOutcome.sendSuccess) {
        sendMailFails.push({
          name: organiser.name,
          email: organiser.email,
          error: emailOutcome.error,
        });
      }
    } catch (error) {
      sendMailFails.push({
        name: organiser.name,
        email: organiser.email,
        error: error.message,
      });
    }
  }

  return sendMailFails;
};

/**
 * @function buildMailBodyClosure
 * @memberof module:closeSession
 * @summary Constructs the email body for notifying organisers about the closure of a session.
 *
 * @description
 * Generates a personalized email body to inform organisers of the closure of their feedback request,
 * including relevant session details and a link to the client application.
 *
 * @param {object} data - The session details, including title and ID.
 * @param {object} user - The user who closed the session, including their name.
 * @param {object} recipient - The recipient of the email, including their name.
 * @returns {string} - The constructed HTML body for the email.
 */
const buildMailBodyClosure = (data, user, recipient) => {
  const config = require("../../../config.json");

  // Construct the email body
  return `
    <p>Hello ${recipient.name},</p>
    <p>Your feedback request on <a href='${config.client.url}'>LearnLoop</a> for the session '${data.title}' has been closed by ${user.name}. No further feedback can be submitted, but any previously submitted feedback can still be viewed.</p>
  `;
};

module.exports = { closeSession };
