/**
 * @module updateNotificationPreferences
 * @memberof module:feedback
 * @summary Module for updating notification preferences for an organiser.
 *
 * @description
 * This module provides functionality to update the notification prefernce for an organiser in the database
 * and send an email notification that this has happened.
 *
 * @requires ../../../config.json - Configuration file containing database table
 * settings for session data retrieval.
 *
 * @exports updateNotificationPreferences Core function for the module
 */

/**
 * @async
 * @function updateNotificationPreferences
 * @memberof module:updateNotificationPreferences
 * @summary Updates the notification preference and sends a email notification.
 *
 * @param {object} link - Database connection for executing SQL queries.
 * @param {object} data - The request containing the notification preference.
 * @param {object} sessionDetails - The details of the session being updated.
 * @param {object} organiserIndex - The index of the organiser in organsiers array making the preference change.
 * @returns {Promise<array>} - Returns array of any emails that failed to send.
 * @throws {Error} - Throws an error for any issues during the closure process.
 */
const updateNotificationPreferences = async (
  link,
  data,
  sessionDetails,
  organiserIndex
) => {
  //set the notifications preference in the organisers array
  sessionDetails.organisers[organiserIndex].notifications = data.notifications;

  const organiser = sessionDetails.organisers[organiserIndex];

  //update the organisers array in the database
  const resetPinRoute = require("./resetPin");
  await resetPinRoute.updateOrganiserDetailsInDatabase(
    link,
    data.id,
    sessionDetails.organisers
  );

  // Notify organiser of the closure
  const updateSessionRoute = require("./updateSession");
  let sendMailFails = [];
  const emailOutcome = await updateSessionRoute.emailOrganiserUpdate(
    sessionDetails,
    {},
    organiser,
    buildMailBodyUpdateNotificationPreference,
    "Notification preference updated"
  );
  if (!emailOutcome.sendSuccess)
    sendMailFails.push({
      name: organiser.name,
      email: organiser.email,
      error: emailOutcome.error,
    });

  return sendMailFails;
};

/**
 * @function buildMailBodyUpdateNotificationPreference
 * @memberof module:updateNotificationPreferences
 * @summary Constructs the email body for notifying organiser about their notification preference update.
 *
 * @requires ../../../config.json - For the client URL
 *
 * @param {Object} data - The session details.
 * @param {Object} user - Not required for this buildMailBody function.
 * @param {Object} recipient - The recipient of the email, containing their name.
 * @param {Object} seriesData - Not required for this buildMailBody function.
 * @returns {string} - The constructed HTML body for the email.
 */
const buildMailBodyUpdateNotificationPreference = (
  data,
  user = {},
  recipient,
  seriesData = {}
) => {
  const config = require("../../../config.json");
  // Initialize the email body with a greeting and removal details
  let body = `
            <p>Hello ${recipient.name},</p>
            <p>Your feedback submission notification preferences have been updated on <a href='${
              config.client.url
            }'>LearnLoop</a> for the session '${
    data.title
  }'. Notifications are now <strong>${
    recipient.notifications ? "enabled" : "disabled"
  }</strong>.</p>
        `;

  return body; // Return the constructed email body
};

module.exports = { updateNotificationPreferences };
