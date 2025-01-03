/**
 * @module giveFeedback
 * @memberof module:feedback
 * @summary Handles the insertion of feedback submissions and notifications.
 *
 * @description
 * Provides functionality for inserting new feedback submissions, including inserting feedback details into the database
 * and notifying organisers via email. For session series, feedback is inserted for each subsession.
 *
 * @requires ../../../config.json - Configuration settings for the application.
 * @requires ../../utilities/mailUtilities - Utilities for sending email notifications.
 * @requires ../../utilities/dateUtilities - Utilities for formatting date objects.
 * @requires entities For decoding html entities
 *
 * @exports giveFeedback - Function for inserting feedback submissions and notifying organisers.
 */

const config = require("../../../config.json");
const mailUtilities = require("../../utilities/mailUtilities");
const { decode } = require("entities");

/**
 * @async
 * @function giveFeedback
 * @memberof module:giveFeedback
 * @summary Inserts feedback into the database and sends notification emails to organisers.
 *
 * @description This function processes a feedback submission for a main session and any related subsessions.
 * It inserts feedback data into the database and notifies organisers who have opted in for notifications.
 *
 * @param {object} link - Database connection for database queries.
 * @param {object} data - The feedback submission data, including session ID and feedback details.
 * @param {object} session - The session details, including subsessions if applicable.
 * @returns {Promise<boolean>} - Resolves to true if the process completes successfully.
 * @throws {Error} - Throws an error if database operations or email dispatch fail.
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

  // Retrieve organisers associated with the session
  const { getOrganisers } = require("../../utilities/pinUtilities");
  const organisers = await getOrganisers(data.id, "feedback", link);
  const currentTime = Date.now();
  const notificationTimeout =
    config.api.notificationTimeoutHours * 60 * 60 * 1000;

  for (let organiser of organisers) {
    if (organiser.notifications) {
      // Check organiser has notifications enabled
      if (currentTime - organiser.lastSent > notificationTimeout) {
        // Check organiser hasn't received another notification email within last 2 hours
        mails.push({
          name: organiser.name,
          email: organiser.email,
          isLead: organiser.isLead,
          session,
        });

        organiser.lastSent = currentTime;
      }
    }
  }
  updateLastSentInDatabase(link, session.id, organisers);

  for (let subsessionFeedback of data.subsessions) {
    // Validate the subsession as part of the session series
    const subsession = session.subsessions.find(
      (sub) => sub.id === subsessionFeedback.id
    );
    if (!subsession) {
      throw new Error(
        `Subsession with ID [${subsessionFeedback.id}] not found in session series [${session.id}].`
      );
    }

    // Skip feedback not marked as complete (e.g. "skipped")
    if (subsessionFeedback.status !== "Complete") continue;

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
        if (currentTime - subsessionOrganiser.lastSent > notificationTimeout) {
          // Check organiser hasn't received another notification email within last 2 hours
          mails.push({
            name: subsessionOrganiser.name,
            email: subsessionOrganiser.email,
            isLead: false,
            session: subsession,
            seriesData: session,
          });

          subsessionOrganiser.lastSent = currentTime;
        }
      }
    }
    updateLastSentInDatabase(link, subsessionFeedback.id, subsessionOrganisers);
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
 * @summary Sends an email notification to an organiser regarding feedback submissions.
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
  const appURL = config.client.url; // Base application URL
  const shortenedAppURL = appURL.replace("https://", ""); // Shortened version for email

  const body = buildMailBody(name, appURL, shortenedAppURL, data, seriesData);

  const heading = `Feedback notification`;
  const subject = `${heading}: ${decode(data.title)}`;

  const html = mailUtilities.buildMailHTML(
    subject,
    heading,
    body,
    isLead,
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
 * @async
 * @function insertFeedbackIntoDatabase
 * @memberof module:giveFeedback
 * @summary Inserts feedback into the database.
 *
 * @description Executes an SQL insert operation into the feedback table.
 *
 * @param {object} link - The database connection object for executing queries.
 * @param {string} id - The unique identifier for the session.
 * @param {object} feedback - The feedback data to be inserted.
 * @param {object} questions - The questions data with responses to be inserted.
 * @returns {Promise<boolean>} - Resolves to true if the insertion succeeds.
 * @throws {Error} - Throws an error if the database connection or query execution fails.
 */
const insertFeedbackIntoDatabase = async (link, id, feedback, questions) => {
  if (!link) {
    throw new Error("Database connection failed.");
  }

  const query = `INSERT INTO ${config.feedback.tables.tblSubmissions} 
      (id, positive, negative, questions, score) 
      VALUES (?, ?, ?, ?, ?)`;

  await link.execute(query, [
    id,
    feedback.positive,
    feedback.negative,
    questions,
    feedback.score,
  ]);

  return true;
};

/**
 * @function buildMailBody
 * @memberof module:giveFeedback
 * @summary Constructs the email body for feedback notifications.
 *
 * @description Builds the HTML body of the email sent to organisers regarding feedback submissions.
 *
 * @param {string} name - The name of the recipient (organiser).
 * @param {string} appURL - The full application URL.
 * @param {string} shortenedAppURL - A shortened version of the application URL.
 * @param {object} data - The session data containing various properties.
 * @param {object} seriesData - Data from the parent session series, if applicable.
 * @returns {string} - The constructed HTML body for the email.
 */
const buildMailBody = (name, appURL, shortenedAppURL, data, seriesData) => {
  let body = `
        <p>Hello ${name},<br><br>
        An attendee has submitted feedback for your session <strong>'${data.title}'</strong>.`;

  if (data.isSubsession) {
    body += `This session is part of the series '${seriesData.title}'. `;
  }

  body += `
  </p><p style='font-size:1.5em'>View your feedback</p>
  <p>Go to <a href='${appURL}/feedback/view/${data.id}'>${shortenedAppURL}/feedback/view/${data.id}</a> and enter your PIN (refer to session creation email, or <a href='${appURL}/feedback/resetPIN/${data.id}'>reset your PIN</a>) to retrieve submitted feedback.<br>
  Please note, to avoid overloading your inbox, no further notifications will be sent for feedback submitted within the next 2 hours.</p>
  <p><a href='${appURL}/feedback/notifications/${data.id}'>Update your notification preferences</a> if you don't want to receive these emails.</p>
`;

  return body;
};

/**
 * @async
 * @function updateLastSentInDatabase
 * @memberof module:giveFeedback
 * @summary Updates the organisers object with new lastSent values for a session in the database.
 *
 * @description Executes an SQL insert operation into the sessions table.
 *
 * @param {object} link - The database connection object for executing queries.
 * @param {string} id - The unique identifier for the session.
 * @param {object} organisers - The organisers data with the updated lastSent values to be updated.
 * @returns {Promise<boolean>} - Resolves to true if the update succeeds.
 * @throws {Error} - Throws an error if the database connection or query execution fails.
 */
const updateLastSentInDatabase = async (link, id, organisers) => {
  if (!link) {
    throw new Error("Database connection failed.");
  }

  // Update the session with the new organisers data
  const query = `UPDATE ${config.feedback.tables.tblSessions} 
      SET organisers = ? 
      WHERE id = ?`;

  await link.execute(query, [organisers, id]);

  return true;
};

module.exports = { giveFeedback };
