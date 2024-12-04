/**
 * @module giveFeedback
 * @memberof module:feedback
 * @summary Handles the insertion of feedback submissions and notifications.
 *
 * @description
 * Provides functionality for inserting new feedback submissions, including inserting feedback details into the database
 * and notifying organisers via email. In the case of session series, feedback is inserted for each subsession.
 *
 * @requires ../../../config.json - Configuration settings for the application.
 * @requires ../../utilities/mailUtilities - Utilities for sending email notifications.
 * @requires ../../utilities/dateUtilities - Utilities for formatting date objects.
 *
 * @exports giveFeedback - Function for inserting a new session into the database and notifying organisers.
 */

const config = require("../../../config.json");
const mailUtilities = require("../../utilities/mailUtilities");

/**
 * @async
 * @function giveFeedback
 * @memberof module:giveFeedback
 * @summary Inserts a feedback submission into the database and sends notification emails to organisers.
 *
 * @description This function processes a feedback submission for a main session and any related subsessions.
 * It inserts the feedback data into the database and then gathers email information for organisers associated
 * with the session and its subsessions who have opted in for notifications. The function iterates over each
 * organiser, checking if they have notifications enabled, and sends an email notification if required.
 *
 * @param {object} link - Database connection for database queries.
 * @param {object} data - The feedback submission data, including the session ID.
 * @returns {Promise<boolean>} - True if the process completes successfully
 * @throws {Error} - Throws an error if the database connection fails or if the feedback insertion fails.
 */
const giveFeedback = async (link, data, session) => {
  const mails = []; // Array to store email details for organisers

  // Insert the feedback into the database
  await insertFeedbackIntoDatabase(
    link,
    session.id,
    data.feedback,
    data.questions
  );

  // Retrieve organisers associated with the session ID
  const { getOrganisers } = require("../../utilities/pinUtilities");
  const organisers = await getOrganisers(data.id, "feedback", link);

  for (let organiser of organisers) {
    if (organiser.notifications) {
      mails.push({
        name: organiser.name,
        email: organiser.email,
        isLead: organiser.isLead,
        session: session,
      });
    }
  }

  for (let subsessionFeedback of data.subsessions) {
    //check that the subsession is part of the session series
    const subsession = session.subsessions.find(
      (subsession) => subsession.id === subsessionFeedback.id
    );
    if (!subsession) {
      throw new Error(
        `Subsession with id [${subsessionFeedback.id}] not found as subsession for session series [${session.id}].`
      );
    }

    //check the subsession feedback is complete rather than skipped
    if (subsessionFeedback.status != "Complete") continue;

    await insertFeedbackIntoDatabase(
      link,
      subsessionFeedback.id,
      subsessionFeedback,
      []
    );

    const subsessionOrganisers = await getOrganisers(
      subsessionFeedback.id,
      "feedback",
      link
    );

    for (let subsessionOrganiser of subsessionOrganisers) {
      if (subsessionOrganiser.notifications && subsessionOrganiser.email) {
        mails.push({
          name: subsessionOrganiser.name,
          email: subsessionOrganiser.email,
          isLead: false,
          session: subsession,
          seriesData: session,
        });
      }
    }
  }

  for (let mail of mails) {
    await emailOrganiserNotification(
      mail.session,
      mail.name,
      mail.email,
      mail.isLead,
      mail.seriesData
    );
  }

  return true;
};

/**
 * @async
 * @function emailOrganiserNotification
 * @memberof module:giveFeedback
 * @summary Sends an email notification to an organiser regarding a feedback submission.
 *
 * @description This function constructs and sends an email notification to an organiser to inform them
 * of a recent feedback submission.
 *
 * @param {object} data - The session data, including details such as title and lead organiser.
 * @param {string} name - The name of the organiser receiving the email notification.
 * @param {string} email - The email address of the organiser to whom the notification will be sent.
 * @param {boolean} isLead - True if the organiser is the lead for this session.
 * @param {object} [seriesData={}] - Additional data from the parent series if this is a subsession.
 * @throws {Error} - Throws an error if the email dispatch fails or if there are issues with email content generation.
 */
const emailOrganiserNotification = async (
  data,
  name,
  email,
  isLead,
  seriesData = {}
) => {
  // Define application URLs for email content
  const appURL = config.client.url; // Base application URL
  const shortenedAppURL = appURL.replace("https://", ""); // Shortened version for a cleaner email

  // Build the body of the email using provided data
  const body = buildMailBody(name, appURL, shortenedAppURL, data, seriesData);

  // Email heading and subject line
  const heading = `Feedback notification`; // Static heading for the email
  const subject = `${heading}: ${data.title}`; // Dynamic subject line based on session title

  // Build HTML structure for the email notification
  const html = mailUtilities.buildMailHTML(
    subject,
    heading,
    body,
    isLead,
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
 * @async
 * @function insertFeedbackIntoDatabase
 * @memberof module:giveFeedback
 * @summary Inserts a feedback submission into the database.
 *
 * @description Performs an SQL insert operation into the specified feedback submission table.
 * It verifies that a valid database connection is provided before attempting the insertion.
 * The function constructs an SQL query with the feedback data and executes it using the provided database connection.
 *
 * @param {object} link - The database connection object for executing queries.
 * @param {string} id - The unique identifier for the session being inserted.
 * @param {object} feedback - The feedback data to be inserted.
 * * @param {object} questions - The questions data with responses to be inserted.
 * @returns {Promise<boolean>} - Returns true if the insertion is successful.
 * @throws {Error} - Throws an error if the database connection is invalid or if the insertion fails.
 */
const insertFeedbackIntoDatabase = async (link, id, feedback, questions) => {
  console.error(id, feedback);
  // Ensure a valid database connection is provided
  if (!link) {
    throw new Error("Database connection failed."); // Error if connection is not valid
  }

  try {
    // Construct SQL query for inserting session data
    const query = `INSERT INTO ${config.feedback.tables.tblSubmissions} 
      (id, positive, negative, questions, score) 
      VALUES (?, ?, ?, ?, ?)`;

    // Execute the insert query with session data
    await link.execute(query, [
      id,
      feedback.positive,
      feedback.negative,
      questions,
      feedback.score,
    ]);

    return true; // Return true on successful insertion
  } catch (error) {
    throw error; // Rethrow the error for handling at a higher level
  }
};

/**
 * @function buildMailBody
 * @memberof module:giveFeedback
 * @summary Builds the HTML body for the email notification regarding a feedback submission.
 *
 * @param {string} name - The name of the recipient (organiser).
 * @param {string} appURL - The full application URL.
 * @param {string} shortenedAppURL - A shortened version of the application URL.
 * @param {object} data - The session data containing various properties.
 * @param {object} seriesData - Data from the parent session series, if applicable.
 * @returns {string} - The constructed HTML body for the email.
 */
const buildMailBody = (name, appURL, shortenedAppURL, data, seriesData) => {
  // Start building the email body
  let body = `
        <p>Hello ${name},<br><br>
        An attendee has submitted feedback for your session <strong>'${data.title}'</strong>.`;

  if (data.isSubsession) {
    body += `This session is part of the series '${seriesData.title}'. `;
  }

  body += `
  </p><p style='font-size:1.5em'>View your feedback</p>
  <p>Go to <a href='${appURL}/?view=${data.id}'>${shortenedAppURL}/?view=${data.id}</a> and enter your PIN (refer to session creation email, or <a href='${appURL}/?resetPIN=${data.id}'>reset your PIN</a>) to retrieve submitted feedback.<br>
  Please note, to avoid overloading your inbox, no further notifications will be sent for feedback submitted within the next 2 hours.</p>
  <p><a href='${appURL}/?notifications=${data.id}'>Update your notification preferences</a> if you don't want to receive these emails.</p>
`;

  return body; // Return the constructed email body
};

module.exports = { giveFeedback };
