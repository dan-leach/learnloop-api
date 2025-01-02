/**
 * @module updateNotificationPreferences
 * @summary Module for updating notification preferences for an organiser.
 *
 * @description
 * Provides functionality to update an organiser's notification preferences in the database
 * and sends an email to notify them of the update.
 *
 * @requires ../../../config.json - Configuration file containing database and client settings.
 * @requires ./resetPin - For updating organiser details in the database.
 * @requires ./updateSession - For sending email notifications to organisers.
 *
 * @exports updateNotificationPreferences - Core function for updating notification preferences.
 */

const config = require("../../../config.json");

/**
 * @async
 * @function updateNotificationPreferences
 * @memberof module:updateNotificationPreferences
 * @summary Updates the notification preferences and sends an email notification.
 *
 * @description
 * Updates the organiser's notification preferences in the database and sends a confirmation
 * email about the change. Relies on external modules to handle database updates and email dispatch.
 *
 * @param {object} link - Database connection for executing SQL queries.
 * @param {object} data - The request data containing the notification preferences and session ID.
 * @param {object} sessionDetails - The session details including organiser information.
 * @param {number} organiserIndex - The index of the organiser in the organisers array.
 * @returns {Promise<Array<object>>} - Array of failed email attempts, if any.
 * @throws {Error} - Throws an error for issues during database updates or email sending.
 */
const updateNotificationPreferences = async (
  link,
  data,
  sessionDetails,
  organiserIndex
) => {
  // Update the notification preference in the organisers array
  sessionDetails.organisers[organiserIndex].notifications = data.notifications;
  const organiser = sessionDetails.organisers[organiserIndex];

  // Update the organisers array in the database
  const resetPinRoute = require("./resetPin");
  await resetPinRoute.updateOrganiserDetailsInDatabase(
    link,
    data.id,
    sessionDetails.organisers
  );

  // Notify the organiser of the update
  const updateSessionRoute = require("./updateSession");
  const sendMailFails = [];
  const emailOutcome = await updateSessionRoute.emailOrganiserUpdate(
    sessionDetails,
    {}, // No specific additional data required
    organiser,
    buildMailBodyUpdateNotificationPreference,
    "Notification Preference Updated"
  );

  if (!emailOutcome.sendSuccess) {
    sendMailFails.push({
      name: organiser.name,
      email: organiser.email,
      error: emailOutcome.error,
    });
  }

  return sendMailFails;
};

/**
 * @function buildMailBodyUpdateNotificationPreference
 * @memberof module:updateNotificationPreferences
 * @summary Constructs the email body to notify the organiser about the update.
 *
 * @description
 * Generates an HTML email body to inform the organiser of the updated notification preferences.
 *
 * @param {object} data - The session details including the title.
 * @param {object} user - Unused in this function, reserved for future extensions.
 * @param {object} recipient - The recipient details, including their name and updated preferences.
 * @param {object} seriesData - Unused in this function, reserved for future extensions.
 * @returns {string} - The constructed HTML email body.
 */
const buildMailBodyUpdateNotificationPreference = (
  data,
  user = {},
  recipient,
  seriesData = {}
) => {
  const body = `
    <p>Hello ${recipient.name},</p>
    <p>Your feedback submission notification preferences have been updated on 
      <a href='${config.client.url}'>LearnLoop</a> for the session '<strong>${
    data.title
  }</strong>'.</p>
    <p>Notifications are now <strong>${
      recipient.notifications ? "enabled" : "disabled"
    }</strong>.</p>
  `;
  return body;
};

module.exports = { updateNotificationPreferences };
