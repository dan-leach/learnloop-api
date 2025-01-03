/**
 * @module insertSession
 * @memberof module:feedback
 * @summary Handles the creation of new feedback sessions and notifications.
 *
 * @description
 * The `insertSession` module provides functionality for creating new feedback sessions,
 * including inserting session details into the database and notifying organisers via email.
 * It generates unique session IDs and secure PINs for each organiser while allowing for
 * the management of subsessions. The module ensures that all relevant session data is
 * accurately stored, and notifications are sent promptly to ensure organisers are kept informed
 * about their sessions. The module also includes mechanisms for managing permissions and
 * providing relevant links for attendees and organisers alike.
 *
 * @requires ../../../config.json - Configuration settings for the application.
 * @requires ../../utilities/idUtilities - Utility functions for ID generation.
 * @requires ../../utilities/pinUtilities - Utility functions for PIN generation and hashing.
 * @requires ../../utilities/mailUtilities - Utilities for sending email notifications.
 * @requires ../../utilities/dateUtilities - Utilities for formatting date objects.
 * @requires entities For decoding html entities
 *
 * @exports insertSession - Function for inserting a new session into the database and notifying organisers.
 * @exports emailOrganiserInsert - Function to send email notifications to organisers regarding created feedback sessions.
 */

const config = require("../../../config.json");
const idUtilities = require("../../utilities/idUtilities");
const pinUtilities = require("../../utilities/pinUtilities");
const mailUtilities = require("../../utilities/mailUtilities");
const dateUtilities = require("../../utilities/dateUtilities");
const { decode } = require("entities");

/**
 * @async
 * @function insertSession
 * @memberof module:insertSession
 * @summary Inserts a session into the database and sends notification emails to organisers.
 *
 * @description When a new session is created, it generates a unique session ID and, for each organiser,
 * creates a secure PIN along with a hashed version of it. If the session is not a subsession, the function
 * also collects and stores email information for all organisers. If it is a subsession, it inherits certain
 * properties from the parent series and generates a new organiser entry specifically for the subsession.
 * After preparing the session data and any associated email notifications, the function inserts the
 * session into the database and sends notification emails to all organisers. The function ensures that
 * the lead organiser's PIN is returned to the caller for display on in the created view.
 *
 * @param {object} link - Database connection for database queries.
 * @param {object} data - The session data, including details about the session and organisers.
 * @param {boolean} [isSubsession=false] - Flag indicating whether the session is a subsession of a series.
 * @param {object} [seriesData={}] - Data from the parent series, if this is a subsession.
 * @returns {Promise<object>} - The ID of the session and the lead organiser's PIN.
 * @throws {Error} - Throws an error if the database connection fails or if the session insertion fails.
 */
const insertSession = async (
  link,
  data,
  isSubsession = false,
  seriesData = {}
) => {
  // Generate a unique session ID
  const id = await idUtilities.createUniqueId(link, "feedback");
  let leadPin; // Variable to store the lead organiser's PIN
  const mails = []; // Array to store email details for organisers
  let sendMailFails = []; // Array to store details of any failed emails
  const subsessionIds = []; // Array to hold IDs of subsessions

  if (!isSubsession) {
    // Generate PIN, salt, and hashed PIN for each organiser
    for (const organiser of data.organisers) {
      const pin = pinUtilities.createPin();
      if (organiser.isLead) {
        leadPin = pin; // Store the lead organiser's PIN to be returned to the client
        data.leadName = organiser.name; // Store lead organiser's name for email notifications
      }
      organiser.salt = pinUtilities.createSalt();
      organiser.pinHash = pinUtilities.hashPin(pin, organiser.salt); // Hash the PIN
      organiser.lastSent = null; // Initial value for last sent notification
      organiser.notifications = true; // Enable notifications

      // Prepare email data for the organiser
      mails.push({
        name: organiser.name,
        email: organiser.email,
        pin: pin,
        isLead: organiser.isLead,
        canEdit: organiser.canEdit,
      });
    }

    // Insert subsessions and collect their IDs to be added to the parent session database row
    for (const subsession of data.subsessions) {
      const subsessionInsertOutcome = await insertSession(
        link,
        subsession,
        true,
        data
      );
      sendMailFails.push(...subsessionInsertOutcome.sendMailFails);
      subsessionIds.push(subsessionInsertOutcome.id);
    }
  }

  if (isSubsession) {
    // If this is a subsession, inherit data from the parent series
    const pin = pinUtilities.createPin();
    const salt = pinUtilities.createSalt();
    Object.assign(data, {
      date: "0000-00-00",
      multipleDates: false,
      questions: [], // Subsessions do not have custom questions
      certificate: false, // Subsessions do not directly provide certificates
      attendance: false, // Subsessions do not directly log attendance
      organisers: [
        {
          name: data.name,
          email: data.email,
          isLead: false,
          canEdit: false,
          pinHash: pinUtilities.hashPin(pin, salt),
          salt: salt,
          notifications: true,
          lastSent: null,
        },
      ],
    });

    // Prepare email data if the subsession organiser has an email
    if (data.email) {
      mails.push({
        name: data.name,
        email: data.email,
        pin: pin, // Generate a new PIN for the subsession
        isLead: data.organisers[0].isLead,
        canEdit: data.organisers[0].canEdit,
      });
    }
  }

  // Insert the session into the database
  await insertSessionIntoDatabase(link, id, data, subsessionIds, isSubsession);

  // Send emails to all organisers
  for (const mail of mails) {
    const emailOutcome = await emailOrganiserInsert(
      // Ensure emails are sent sequentially
      data,
      id,
      mail.pin,
      mail.name,
      mail.email,
      mail.isLead,
      mail.canEdit,
      isSubsession,
      seriesData
    );
    if (!emailOutcome.sendSuccess)
      sendMailFails.push({
        name: mail.name,
        email: mail.email,
        error: emailOutcome.error,
      });
  }

  // Return the session ID and the lead organiser's PIN
  return { id, leadPin, sendMailFails };
};

/**
 * @async
 * @function emailOrganiserInsert
 * @memberof module:insertSession
 * @summary Sends an email notification to an organiser regarding a created feedback session.
 *
 * @description This function constructs and dispatches an email containing the details of the feedback request
 * created for the organiser. It uses a variety of inputs to customize the email content, including the session
 * ID, the lead organiser's name, and specific session data. The function also handles subsessions by
 * appropriately referencing the lead organiser from the parent session.
 *
 * @param {object} data - The session data, including details such as title and lead organiser.
 * @param {string} id - The unique identifier of the feedback session being created.
 * @param {string} pin - The secure PIN associated with the organiser for the session.
 * @param {string} name - The name of the organiser receiving the email notification.
 * @param {string} email - The email address of the organiser to whom the notification will be sent.
 * @param {boolean} isLead - Indicates whether the organiser is the lead for this session.
 * @param {boolean} canEdit - Indicates whether the organiser has editing privileges for the session.
 * @param {boolean} [isSubsession=false] - Flag indicating whether the session is a subsession.
 * @param {object} [seriesData={}] - Additional data from the parent series if this is a subsession.
 * @returns {Promise<object>} - Returns an object with the success status of the email dispatch.
 * @throws {Error} - Throws an error if the email dispatch fails or if there are issues with email content generation.
 */
const emailOrganiserInsert = async (
  data,
  id,
  pin,
  name,
  email,
  isLead,
  canEdit,
  isSubsession = false,
  seriesData = {}
) => {
  const leadName = isSubsession ? seriesData.leadName : data.leadName;
  const appURL = config.client.url;
  const shortenedAppURL = appURL.replace("https://", "");

  const body = buildMailBody(
    id,
    pin,
    name,
    isLead,
    canEdit,
    leadName,
    appURL,
    shortenedAppURL,
    data,
    isSubsession,
    seriesData
  );

  const heading = "Feedback request created";
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
 * @function insertSessionIntoDatabase
 * @memberof module:insertSession
 * @summary Inserts a feedback session (and its subsessions, if applicable) into the database.
 *
 * @description Performs an SQL insert operation into the specified feedback sessions table.
 * It verifies that a valid database connection is provided before attempting the insertion.
 * The function constructs an SQL query with the session details and executes it using the provided database connection.
 *
 * @param {object} link - The database connection object for executing queries.
 * @param {string} id - The unique identifier for the session being inserted.
 * @param {object} data - The session data containing various properties to be inserted.
 * @param {Array<string>} subsessionIds - An array of IDs for any associated subsessions.
 * @param {boolean} isSubsession - Flag indicating whether the session is a subsession.
 * @returns {Promise<boolean>} - Returns true if the insertion is successful.
 * @throws {Error} - Throws an error if the database connection is invalid or if the insertion fails.
 */
const insertSessionIntoDatabase = async (
  link,
  id,
  data,
  subsessionIds,
  isSubsession
) => {
  if (!link) {
    throw new Error("Database connection failed.");
  }

  const query = `INSERT INTO ${config.feedback.tables.tblSessions} 
      (id, name, title, date, multipleDates, organisers, questions, certificate, subsessions, isSubsession, attendance) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  await link.execute(query, [
    id,
    data.name,
    data.title,
    data.multipleDates || isSubsession ? "0000-00-00" : data.date,
    data.multipleDates,
    data.organisers,
    data.questions,
    data.certificate,
    subsessionIds,
    isSubsession,
    data.attendance,
  ]);

  return true;
};

/**
 * @function buildMailBody
 * @memberof module:insertSession
 * @summary Builds the HTML body for the email notification regarding a feedback session.
 *
 * @description This function generates a detailed HTML email body that provides recipients
 * with information about the created feedback session. It includes session details,
 * access rights, and instructions for directing attendees to the feedback form.
 *
 * @param {string} id - The unique identifier for the session.
 * @param {string} pin - The session PIN for the lead organiser.
 * @param {string} name - The name of the recipient (organiser).
 * @param {boolean} isLead - Indicates if the recipient is the lead organiser.
 * @param {boolean} canEdit - Indicates if the recipient has editing rights for the session.
 * @param {string} leadName - The name of the lead organiser (if not the recipient).
 * @param {string} appURL - The full application URL.
 * @param {string} shortenedAppURL - A shortened version of the application URL.
 * @param {object} data - The session data containing various properties.
 * @param {boolean} isSubsession - Indicates if this email is for a subsession.
 * @param {object} seriesData - Data from the parent session series, if applicable.
 * @returns {string} - The constructed HTML body for the email.
 */
const buildMailBody = (
  id,
  pin,
  name,
  isLead,
  canEdit,
  leadName,
  appURL,
  shortenedAppURL,
  data,
  isSubsession,
  seriesData
) => {
  let multipleDates = isSubsession
    ? seriesData.multipleDates
    : data.multipleDates;
  let date = !multipleDates
    ? dateUtilities.formatDateUK(isSubsession ? seriesData.date : data.date)
    : null;

  let body = `
        <p>Hello ${name},<br><br>
        A feedback request has been successfully created${
          isLead ? "" : " by " + leadName
        } on <a href='${appURL}'>LearnLoop</a> for your session '${
    data.title
  }' delivered on ${multipleDates ? "multiple dates" : date}.`;

  if (isSubsession) {
    body += ` This session is part of the series '${seriesData.title}'. `;
  } else {
    body += isLead
      ? ` You are the lead organiser for this event. Your access to the session cannot be removed, and you have editing rights. `
      : canEdit
      ? ` You have been given editing rights for this session. `
      : ` You have been given viewing rights for this session. `;
  }

  body += `</p><p>Please keep this email for future reference.</p>
        <span style='font-size:2em'>Your session ID is <strong>${id}</strong><br>
        Your session PIN is <strong>${pin}</strong></span><br>
        Do not share your PIN or this email with attendees. 
        <a href='${appURL}/feedback/resetPIN/${id}'>Reset your PIN</a>.<br>`;

  if (data.subsessions && data.subsessions.length) {
    body +=
      data.subsessions.length === 1
        ? `Feedback will be collected on the session ${data.subsessions[0].title}.<br>`
        : `Feedback will be collected on the sessions: <ul>${data.subsessions
            .map(
              (subsession) =>
                `<li>'${subsession.title}' facilitated by ${subsession.name}</li>`
            )
            .join("")}</ul>`;
  }

  if (data.questions && data.questions.length) {
    body += `The following additional questions will be asked:<ul>
            ${data.questions
              .map((question) => `<li>${question.title}</li>`)
              .join("")}
            </ul>`;
  }

  if (canEdit) {
    body += `<a href='${appURL}/feedback/edit/${id}'>Edit your session</a>. This option is only available <strong>before</strong> feedback has been submitted.`;
  }

  body += `
        <p style='font-size:1.5em'>How to direct attendees to the feedback form</p>
        ${
          isSubsession
            ? `<p>The organiser of this session series will share the feedback link for the whole series with attendees.</p>`
            : `You can share the direct link: <a href='${appURL}/${id}'>${shortenedAppURL}/${id}</a><br>
            Or, ask them to go to <a href='${appURL}'>${shortenedAppURL}</a> and enter the session ID.<br>
            Or, <a href='${appURL}/feedback/instructions/${id}'>show a page with instructions on how to reach the feedback form</a> including a QR code for your attendees to scan.<br>
            ${
              data.certificate
                ? "<br>Don't forget to let your attendees know that they'll be able to download a certificate of attendance after completing feedback."
                : ""
            }`
        }`;

  body += `
        <p style='font-size:1.5em'>View your feedback</p>
        <p>Go to <a href='${appURL}/feedback/view/${id}'>${shortenedAppURL}/feedback/view/${id}</a> and enter your PIN to retrieve submitted feedback.<br>
        Email notification of feedback submissions is <strong>enabled</strong>. <a href='${appURL}/feedback/notifications/${id}'>Update your notification preferences</a>.<br>
        ${
          !isSubsession && data.attendance
            ? `The attendance register is <strong>enabled</strong>. <a href='${appURL}/feedback/attendance/${id}'>View attendance register</a>.<br>`
            : ""
        }
        <br><br>`;

  return body;
};

module.exports = { insertSession, emailOrganiserInsert };
