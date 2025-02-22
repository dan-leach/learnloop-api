/**
 * @module resetPin
 * @summary Module for resetting organiser PINs and sending email notifications.
 *
 * @description This module contains functionality for resetting organiser PINs,
 * updating organiser details in the database, and sending the updated PIN via email.
 * It ensures that sensitive data is securely handled.
 *
 * @requires ../../../config.json - Application configuration, including database table settings.
 * @requires ../../utilities/pinUtilities - Utility functions for PIN creation and hashing.
 * @requires ../../utilities/mailUtilities - Utility functions for building and sending emails.
 * @requires entities For decoding html entities
 *
 * @exports resetPin - Core function to reset an organiser's PIN.
 * @exports updateOrganiserDetailsInDatabase - Updates organiser details in the database.
 */

const config = require("../../../config.json");
const { decode } = require("entities");

/**
 * @async
 * @function resetPin
 * @memberof module:resetPin
 * @summary Resets the PIN for an organiser and sends the new PIN via email.
 *
 * @description Retrieves organisers from the database, identifies the target organiser by email,
 * generates a new PIN, updates the database, and sends the new PIN to the organiser via email.
 *
 * @param {object} link - The database connection object used to execute queries.
 * @param {object} data - The request data, including session ID and organiser email.
 * @param {object} session - The session data corresponding to the request.
 * @returns {Promise<Array<object>>} - Returns an array of failed email attempts, if any.
 * @throws {Error} - Throws an error if the organiser email is not found or any operation fails.
 */
const resetPin = async (link, data, session) => {
  const {
    getOrganisers,
    createPin,
    createSalt,
    hashPin,
  } = require("../../utilities/pinUtilities");

  // Retrieve organisers for the session
  const organisers = await getOrganisers(data.id, "feedback", link);

  const organiserIndex = organisers.findIndex(
    (organiser) => organiser.email.toLowerCase() === data.email.toLowerCase()
  );

  if (organiserIndex === -1) {
    throw Object.assign(
      new Error("Email not found as organiser for this session"),
      { statusCode: 401 }
    );
  }

  // Generate a new PIN, salt, and hash
  const pin = createPin();
  organisers[organiserIndex].salt = createSalt();
  organisers[organiserIndex].pinHash = hashPin(
    pin,
    organisers[organiserIndex].salt
  );

  // Update organiser details in the database
  await updateOrganiserDetailsInDatabase(link, data.id, organisers);

  // Send email notification with the new PIN
  const emailOutcome = await emailPinReset(
    session,
    pin,
    organisers[organiserIndex].name,
    organisers[organiserIndex].email
  );

  // Collect any email failures
  const sendMailFails = [];
  if (!emailOutcome.sendSuccess) {
    sendMailFails.push({
      name: organisers[organiserIndex].name,
      email: organisers[organiserIndex].email,
      error: emailOutcome.error,
    });
  }

  return sendMailFails;
};

/**
 * @async
 * @function updateOrganiserDetailsInDatabase
 * @memberof module:resetPin
 * @summary Updates organiser details in the database.
 *
 * @description Updates the database record for a session with the new organiser details,
 * including updated PIN hashes and salts.
 *
 * @param {object} link - The database connection object used to execute queries.
 * @param {string} id - The session ID for which organiser details are being updated.
 * @param {Array<object>} organisers - The updated organisers array.
 * @returns {Promise<void>} - Resolves when the update is successful.
 * @throws {Error} - Throws an error if the query execution fails.
 */
const updateOrganiserDetailsInDatabase = async (link, id, organisers) => {
  const tableName = config.feedback.tables.tblSessions;
  const query = `UPDATE ${tableName} SET organisers = ? WHERE id = ?`;

  await link.execute(query, [JSON.stringify(organisers), id]);
};

/**
 * @async
 * @function emailPinReset
 * @memberof module:resetPin
 * @summary Sends an email notification with the new PIN.
 *
 * @description Sends an email to the organiser with their updated PIN and session details.
 *
 * @param {object} session - The session details.
 * @param {string} pin - The newly generated PIN.
 * @param {string} name - The organiser's name.
 * @param {string} email - The organiser's email address.
 * @returns {Promise<object>} - Resolves with the email sending outcome.
 */
const emailPinReset = async (session, pin, name, email) => {
  const appURL = config.client.url;
  const shortenedAppURL = appURL.replace("https://", "");

  const body = buildMailBody(name, appURL, session, pin);
  const subject = `Pin Reset: ${decode(session.title)}`;
  const heading = `Pin Reset`;

  const mailUtilities = require("../../utilities/mailUtilities");
  const html = mailUtilities.buildMailHTML(
    subject,
    heading,
    body,
    true,
    appURL,
    shortenedAppURL
  );

  try {
    await mailUtilities.sendMail(email, subject, html);
    return { sendSuccess: true };
  } catch (error) {
    return { sendSuccess: false, error: error.message };
  }
};

/**
 * @function buildMailBody
 * @memberof module:resetPin
 * @summary Builds the email body for the new PIN notification.
 *
 * @description Constructs the HTML content for the email sent to the organiser with the new PIN.
 *
 * @param {string} name - The organiser's name.
 * @param {string} appURL - The application URL.
 * @param {object} session - The session details.
 * @param {string} pin - The new PIN.
 * @returns {string} - The constructed email body as a string.
 */
const buildMailBody = (name, appURL, session, pin) => {
  return `
    <p>Hello ${name},<br><br>
    Your PIN for the session <strong>'${session.title}'</strong> has been reset.</p>
    <p>Please keep this email for future reference.</p>
    <span style="font-size:2em">
      Your session ID is <strong>${session.id}</strong><br>
      Your session PIN is <strong>${pin}</strong>
    </span><br>
    Do not share your PIN or this email with attendees. 
    <a href="${appURL}/feedback/resetPIN/${session.id}">Reset your PIN</a>.<br><br>
  `;
};

module.exports = {
  resetPin,
  updateOrganiserDetailsInDatabase,
};
