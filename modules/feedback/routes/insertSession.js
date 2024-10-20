const config = require("../../../config.json");

/**
 * Inserts a session into the database and sends notification emails to organisers.
 *
 * @param {object} link - Database connection or context to be used for database queries.
 * @param {object} data - The session data, including details about the session and organisers.
 * @param {boolean} [isSubsession=false] - Flag indicating whether the session is a subsession of a series.
 * @param {object} [seriesData={}] - Data from the parent series, if this is a subsession.
 * @returns {Promise<object>} - The ID of the session and the lead organiser's PIN.
 */
const insertSession = async (
  link,
  data,
  isSubsession = false,
  seriesData = {}
) => {
  // Import utilities for generating IDs, PINs, and hashes
  const {
    createUniqueId,
    createPin,
    createSalt,
    hashPin,
  } = require("../../utilities/index");

  // Generate a unique session ID
  const id = await createUniqueId(link, "feedback");
  let leadPin; // Variable to store the lead organiser's PIN
  const mails = []; // Array to store email details for organisers

  let subsessionIds = []; // Array to hold IDs of subsessions
  if (!isSubsession) {
    // Generate PIN, salt, and hashed PIN for each organiser
    for (let organiser of data.organisers) {
      const pin = createPin();
      if (organiser.isLead) {
        leadPin = pin; // Store the lead organiser's PIN to be returned to the client
        data.leadName = organiser.name; // Store lead organiser's name to be used in emails
      }
      const salt = createSalt();
      organiser.pinHash = hashPin(pin, salt);
      organiser.salt = salt;
      organiser.lastSent = null;
      organiser.notifications = true;

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
    for (let subsession of data.subsessions) {
      const { id } = await insertSession(link, subsession, true, data);
      subsessionIds.push(id);
    }
  }

  if (isSubsession) {
    // If this is a subsession, inherit data from the parent series
    data.date = "0000-00-00";
    data.multipleDates = false;
    data.questions = []; // Subsessions do not have custom questions
    data.certificate = false; // Subsessions do not directly provide certificates
    data.attendance = false; // Subsessions do not directly log attendance

    // Generate organiser data for the subsession
    const pin = createPin();
    const salt = createSalt();
    data.organisers = [
      {
        name: data.name,
        email: data.email,
        isLead: false,
        canEdit: false,
        pinHash: hashPin(pin, salt),
        salt: salt,
        notifications: true,
        lastSent: null,
      },
    ];

    // Prepare email data if the subsession organiser has an email
    if (data.email) {
      mails.push({
        name: data.name,
        email: data.email,
        pin: pin,
        isLead: data.organisers[0].isLead,
        canEdit: data.organisers[0].canEdit,
      });
    }
  }

  // Insert the session into the database
  await insertSessionIntoDatabase(link, id, data, subsessionIds, isSubsession);

  // Send emails to all organisers
  for (let mail of mails) {
    emailOrganiser(
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
  }

  // Return the session ID and the lead organiser's PIN
  return { id, leadPin };
};

/**
 * Sends an email to an organiser with details about the session and their PIN.
 *
 * @param {object} data - The session data, including title, organisers, and other relevant information.
 * @param {string} id - The unique ID of the session.
 * @param {string} pin - The PIN for the organiser to access the session.
 * @param {string} name - The name of the organiser.
 * @param {string} email - The email address of the organiser.
 * @param {boolean} isLead - Whether the organiser is the lead organiser of the session.
 * @param {boolean} canEdit - Whether the organiser has editing privileges.
 * @param {boolean} [isSubsession=false] - Flag indicating whether the email is for a subsession of a series.
 * @param {object} [seriesData={}] - Data from the parent series, if this is a subsession.
 * @returns {Promise<boolean>} - Returns `true` if the email was sent successfully, `false` otherwise.
 */
const emailOrganiser = (
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
  // Determine the lead organiser's name (in subsession use the parent sessions lead)
  const leadName = isSubsession ? seriesData.leadName : data.leadName;

  // Define application URLs
  const appURL = config.client.url;
  const shortenedAppURL = appURL.replace("https://", ""); // Create a shortened version of the URL to look better on emails

  // Build the body of the email
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

  // Email heading and subject
  let heading = `Feedback request created`;
  let subject = `${heading}: ${data.title}`;

  // Import utility function to build HTML structure for the email
  const { buildMailHTML } = require("../../utilities/index");
  const html = buildMailHTML(
    subject,
    heading,
    body,
    isLead,
    appURL,
    shortenedAppURL
  );

  //import the sendMail utility then dispatch the email
  const { sendMail } = require("../../utilities/index");
  sendMail(email, subject, html);
};

/**
 * Inserts a session and its associated subsessions into the database.
 *
 * @param {Object} link - The database connection object used to execute queries.
 * @param {string} id - The unique identifier for the session.
 * @param {Object} data - The session data containing details such as name, title, date, and organisers.
 * @param {Array<string>} subsessionIds - An array of unique identifiers for any subsessions associated with this session.
 * @param {boolean} isSubsession - A flag indicating whether this is a subsession.
 * @returns {Promise<boolean>} - Returns a promise that resolves to `true` if the session was successfully inserted, or throws an error if the insertion fails.
 * @throws {Error} - Throws an error if the database connection fails or if the session insertion fails.
 */
const insertSessionIntoDatabase = async (
  link,
  id,
  data,
  subsessionIds,
  isSubsession
) => {
  // Insert the session and subsessions into the database
  if (!link) {
    throw new Error("Database connection failed.");
  }
  try {
    const query = `INSERT INTO ${config.feedback.tables.tblSessions} (id, name, title, date, multipleDates, organisers, questions, certificate, subsessions, isSubsession, attendance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    await link.execute(query, [
      id,
      data.name,
      data.title,
      data.multipleDates || isSubsession ? "0000-00-00" : data.date, //default value in case of multipleDates
      data.multipleDates,
      data.organisers,
      data.questions,
      data.certificate,
      subsessionIds,
      isSubsession,
      data.attendance,
    ]);
    return true;
  } catch (error) {
    throw error;
  }
};

/**
 * Constructs the body of the feedback request email.
 *
 * @param {string} id - The unique identifier for the session.
 * @param {string} pin - The PIN associated with the session.
 * @param {string} name - The name of the email recipient.
 * @param {boolean} isLead - Indicates if the recipient is the lead organiser for the session.
 * @param {boolean} canEdit - Indicates if the recipient has editing rights for the session.
 * @param {string} leadName - The name of the lead organiser (if the recipient is not the lead).
 * @param {string} appURL - The base URL of the application for generating links.
 * @param {string} shortenedAppURL - The shortened version of the application URL.
 * @param {Object} data - The session data, including title, date, organisers, and questions.
 * @param {boolean} isSubsession - Indicates if the session is a subsession.
 * @param {Object} seriesData - Data related to the parent series, if applicable.
 * @returns {string} - The constructed HTML body of the email.
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
  const { formatDateUK } = require("../../utilities/index");
  let multipleDates = isSubsession
    ? seriesData.multipleDates
    : data.multipleDates;
  let date;
  if (!multipleDates)
    date = formatDateUK(isSubsession ? seriesData.date : data.date);
  let body = `
        <p>Hello ${name},<br><br>
        A feedback request has been successfully created${
          isLead ? "" : " by " + leadName
        } on <a href='${appURL}'>LearnLoop</a> for your session '${
    data.title
  }' delivered on ${multipleDates ? "multiple dates" : date}. `;

  if (isSubsession) {
    body += `This session is part of the series '${seriesData.title}'. `;
  } else {
    if (isLead) {
      body += `You are the lead organsier for this event. This means your access to the session cannot be removed and you have editing rights. `;
    } else {
      if (canEdit) {
        body += `You have been given editing rights for this session. `;
      } else {
        body += `You have been given viewing rights for this session. `;
      }
    }
  }

  body += `</p><p>Please keep this email for future reference.</p>
        <span style='font-size:2em'>Your session ID is <strong>${id}</strong><br>
        Your session PIN is <strong>${pin}</strong></span><br>
        Do not share your PIN or this email with attendees. 
        <a href='${appURL}/feedback/resetPIN/${id}'>Reset your PIN</a>.<br>
    `;

  // Use join to cleanly concatenate array elements
  if (data.subsessions && data.subsessions.length) {
    if (data.subsessions.length === 1) {
      body += `Feedback will be collected on the session ${data.subsessions[0].title}.<br>`;
    } else {
      body += `Feedback will be collected on the sessions: <ul>${data.subsessions
        .map(
          (subsession) =>
            `<li>'${subsession.title}' faciliated by ${subsession.name}</li>`
        )
        .join("")}</ul>`;
    }
  }

  // Simplify additional questions section
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
            ? `
            <p>The organiser of this session series will share the feedback link for the whole series with attendees.</p>
        `
            : `
            You can share the direct link: <a href='${appURL}/${id}'>${shortenedAppURL}/${id}</a><br>
            Or, ask them to go to <a href='${appURL}'>${shortenedAppURL}</a> and enter the session ID.<br>
            Or, <a href='${appURL}/feedback/instructions/${id}'>show a page with instructions on how to reach the feedback form</a> including a QR code for your attendees to scan.<br>
            ${
              data.certificate
                ? "<br>Don't forget to let your attendees know that they'll be able to download a certificate of attendance after completing feedback."
                : ""
            }
        `
        }
    `;

  body += `
        <p style='font-size:1.5em'>View your feedback</p>
        <p>Go to <a href='${appURL}/feedback/view/${id}'>${shortenedAppURL}/feedback/view/${id}</a> and enter your PIN to retrieve submitted feedback.<br>
        Email notification of feedback submissions is <strong>enabled</strong>. <a href='${appURL}/feedback/notifications/${id}'>Update your notification preferences</a>.<br>
        ${
          !isSubsession && data.attendance
            ? `The attendance register is <strong>enabled</strong>. <a href='${appURL}/feedback/attendance/${id}'>View attendance register</a>.<br>`
            : ""
        }
    `;

  return body;
};

module.exports = { insertSession };
