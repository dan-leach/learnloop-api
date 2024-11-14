const config = require("../../../config.json");

/**
 * @async
 * @function resetPin
 * @memberof module:resetPin
 * @summary Resets the pin for an organiser and sends their new pin by email.
 *
 * @param {object} link - Database link
 * @param {object} data - Request data including session id and organiser email
 * @param {object} session - Session data matching the request session id
 * @returns
 */
const resetPin = async (link, data, session) => {
  // Import utility functions for getting organisers and validating PINs
  const {
    getOrganisers,
    createPin,
    createSalt,
    hashPin,
  } = require("../../utilities/pinUtilities");

  // Retrieve organisers associated with the session ID
  const organisers = await getOrganisers(data.id, "feedback", link);

  const organiserIndex = organisers.findIndex(
    (organiser) => organiser.email === data.email
  );

  if (organiserIndex === -1)
    throw new Error("Email not found as organiser for this session.");

  // Create new pin, salt, hash
  const pin = createPin();
  organisers[organiserIndex].salt = createSalt();
  organisers[organiserIndex].pinHash = hashPin(
    pin,
    organisers[organiserIndex].salt
  );

  //insert new pin and salt
  await updateOrganiserDetailsInDatabase(link, data.id, organisers);

  //email the organiser their new pin
  const emailOutcome = await emailPinReset(
    session,
    pin,
    organisers[organiserIndex].name,
    organisers[organiserIndex].email
  );

  const sendMailFails = [];
  if (!emailOutcome.sendSuccess)
    sendMailFails.push({
      name: organisers[organiserIndex].name,
      email: organisers[organiserIndex].email,
      error: emailOutcome.error,
    });

  return sendMailFails;
};

/**
 * @async
 * @function updateOrganiserDetailsInDatabase
 * @memberof module:resetPin
 * @summary Updates the organiser details of a session the database.
 *
 * @param {Object} link - The MySQL connection object used to execute queries.
 * @param {Object} organisers - The organisers array to update.
 * @param {string} id - The session ID.
 * @returns {Promise<void>} - Resolves when the update is complete.
 * @throws {Error} - Throws an error if the query execution fails.
 */
const updateOrganiserDetailsInDatabase = async (link, id, organisers) => {
  const tableName = config.feedback.tables.tblSessions; // Reference to the sessions table

  // Construct the SQL UPDATE query
  const query = `UPDATE ${tableName} SET organisers = ? WHERE id = ?`;

  // Execute the update query with the provided subsession details
  await link.execute(query, [organisers, id]);

  return true;
};

/**
 * @async
 * @function emailPinReset
 * @memberof module:resetPin
 * @summary Sends an email with the new pin.
 *
 * @param {object} data - The session details.
 * @param {string} pin - The new pin.
 * @param {string} name - The name of the organiser receiving the email.
 * @param {string} email - The email address of the organiser to whom the notification will be sent.
 * @throws {Error} - Throws an error if the email dispatch fails or if there are issues with email content generation.
 */
const emailPinReset = async (data, pin, name, email) => {
  const appURL = config.client.url; // Base application URL
  const shortenedAppURL = appURL.replace("https://", ""); // Shortened version for a cleaner email

  // Build the body of the email using provided data
  const body = buildMailBody(name, appURL, data, pin);

  // Email heading and subject line
  const heading = `Pin reset`; // Static heading for the email
  const subject = `${heading}: ${data.title}`; // Dynamic subject line based on session title

  const mailUtilities = require("../../utilities/mailUtilities");
  // Build HTML structure for the email notification
  const html = mailUtilities.buildMailHTML(
    subject,
    heading,
    body,
    true,
    appURL,
    shortenedAppURL
  );

  // Dispatch the email to the organiser
  try {
    await mailUtilities.sendMail(email, subject, html); // Send the email using the specified parameters
    return {
      sendSuccess: true,
    };
  } catch (error) {
    return {
      sendSuccess: false,
      error: error.message,
    };
  }
};

/**
 * @function buildMailBody
 * @memberof module:resetPin
 * @summary Builds the HTML body for the new pin email.
 *
 * @param {string} name - The name of the recipient (organiser).
 * @param {string} appURL - The full application URL.
 * @param {object} data - The session data containing various properties.
 * @param {string} pin - The new pin.
 * @returns {string} - The constructed HTML body for the email.
 */
const buildMailBody = (name, appURL, data, pin) => {
  // Start building the email body
  let body = `
        <p>Hello ${name},<br><br>
        Your pin for the session <strong>'${data.title}'</strong> has been reset.</p>
        <p>Please keep this email for future reference.</p>
        <span style='font-size:2em'>Your session ID is <strong>${data.id}</strong><br>
        Your session PIN is <strong>${pin}</strong></span><br>
        Do not share your PIN or this email with attendees. 
        <a href='${appURL}/feedback/resetPIN/${data.id}'>Reset your PIN</a>.<br><br>
    `;

  return body; // Return the constructed email body
};

module.exports = {
  resetPin,
  updateOrganiserDetailsInDatabase,
};
