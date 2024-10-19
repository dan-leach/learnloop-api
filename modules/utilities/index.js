const crypto = require("crypto");
const config = require("../../config.json");

/**
 * Creates a unique short id and checks it is unique.
 * async
 * @param {Object} link - Database link or connection object.
 * @param {string} module - The name of the module in use (e.g. feedback)
 * @returns {Promise<string>} A unique short Id.
 */
const createUniqueId = async (link, module) => {
  let id;
  let isUnique;
  let count = 0;

  //get the name of the sessions table according to module
  const tblName = config[module].tables.tblSessions;

  do {
    id = buildId(module.charAt(0)); //prefix is first letter of module name (e.g. f for feedback)
    isUnique = await idIsUnique(link, tblName, id);
    count++;
    if (count > 100)
      throw new Error(
        "Unable to create unique feedback session ID after 100 attempts."
      );
  } while (!isUnique);

  return id;
};

/**
 * Builds a unique id based on the module type.
 *
 * @param {string} prefix - The prefix character to denonte the module.
 * @returns {string} The generated unique id starting with the prefix character followed by 5 random characters.
 */
const buildId = (prefix) => {
  const permittedChars = "23456789abcdeghjkmnpqrstuvwxyzABCDEGHJKMNPQRSTUVWXYZ";
  let id = prefix;

  for (let i = 0; i < 5; i++) {
    id += permittedChars[Math.floor(Math.random() * permittedChars.length)];
  }
  return id;
};

/**
 * Check if a session id exists in the sessions table.
 * async
 * @param {mysql.Connection} link - The database connection.
 * @param {string} tblName - The name of the table to check the Id uniqueness against
 * @param {string} id - The session ID to check.
 * @returns {Promise<boolean>} - Returns false if the session ID exists, true if not.
 */
const idIsUnique = async (link, tblName, id) => {
  if (!link) {
    throw new Error("Database connection failed.");
  }

  try {
    const query = `SELECT COUNT(*) as count FROM ${tblName} WHERE id = ?`;
    const result = await link.execute(query, [id]);
    const count = result[0][0].count;
    return count === 0;
  } catch (error) {
    throw new Error("dbIDIsUnique database query failed: " + error.message);
  }
};

/**
 * Generates a random 6-digit PIN.
 *
 * @returns {string} A randomly generated 6-digit PIN.
 */
const createPin = () => {
  const permittedChars = "0123456789";
  let pin = "";
  for (let i = 0; i < 6; i++) {
    pin += permittedChars[Math.floor(Math.random() * permittedChars.length)];
  }
  return pin;
};

/**
 * Generates a random salt.
 *
 * @param {number} [length=16] - The length of the salt to generate (default is 16 bytes).
 * @returns {string} A randomly generated salt in hexadecimal format.
 */
const createSalt = (length = 16) => {
  return crypto.randomBytes(length).toString("hex"); // Generates a salt of specified length
};

/**
 * Hashes a PIN using SHA-256 with the provided salt.
 *
 * @param {string} pin - The PIN to hash.
 * @param {string} salt - The salt to use in the hashing process.
 * @returns {string} The resulting SHA-256 hash of the PIN and salt.
 */
const hashPin = (pin, salt) => {
  return crypto
    .createHash("sha256")
    .update(pin + salt)
    .digest("hex");
};

/**
 * Retrieves the pinHash and salt from the database for a given ID.
 *
 * @param {string} id - The session id.
 * @param {string} module - The module of the session.
 * @param {Object} link - The database connection object used to execute queries.
 * @returns {Promise<{ pinHash: string, salt: string }>} - An object containing pinHash and salt.
 */
async function getOrganisers(id, module, link) {
  const tbl = config[module].tables.tblSessions;
  try {
    const [rows] = await link.execute(
      `SELECT organisers FROM ${tbl} WHERE id = ?`,
      [id]
    );

    if (rows.length > 0) {
      return JSON.parse(rows[0].organisers);
    } else {
      throw new Error("Session not found");
    }
  } catch (error) {
    console.error("Error retrieving data at getOrganisers:", error);
    throw error; // Rethrow the error for handling in the calling function
  }
}

/**
 * Checks if a PIN matches the given PIN hash.
 *
 * @param {string} pin - The PIN to check.
 * @param {string} salt - The stored salt.
 * @param {string} pinHash - The stored hash of the PIN.
 * @returns {boolean} True if the PIN matches the hash; otherwise, false.
 */
const pinIsValid = (pin, salt, pinHash) => {
  const hash = hashPin(pin, salt);
  if (process.env.adminPinHash === hash) return true;
  return pinHash === hash;
};

/**
 * Generates the footer content for an email, optionally including a development mode notice and an invitation to use LearnLoop.
 *
 * @param {boolean} includeInvite - Whether to include an invitation to use LearnLoop.
 * @param {string} appURL - The full URL for LearnLoop.
 * @param {string} shortenedAppURL - The shortened version of the LearnLoop URL for display.
 * @returns {string} - The generated HTML string for the footer content.
 */
const addMailFooter = (includeInvite, appURL, shortenedAppURL) => {
  let footer = "";

  // Add dev mode warning if applicable
  if (config.devMode) {
    footer += `
      <p>
        This session uses the development version of LearnLoop and may include experimental features which might not be supported long-term. Please report any bugs or other feedback to <a href='mailto:${config.email}'>${config.email}</a>.
      </p>`;
  }

  // Optionally include an invitation to use LearnLoop
  if (includeInvite) {
    footer += `
      <p>
        You can request feedback for your own sessions using LearnLoop. Visit <a href='${appURL}'>${shortenedAppURL}</a> to get started!
      </p>`;
  }

  return footer;
};

/**
 * Builds the HTML structure for an email, including the header, body, and footer.
 *
 * @param {string} subject - The subject of the email, used in the title tag.
 * @param {string} heading - The main heading text displayed in the email body.
 * @param {string} body - The HTML content for the body of the email.
 * @param {boolean} isLead - Determines whether the recipient is a lead, influencing the footer content.
 * @param {string} appURL - The full URL of the application, used for links in the email.
 * @param {string} shortenedAppURL - A shortened version of the app URL, used in the footer invitation link.
 */

const buildMailHTML = (
  subject,
  heading,
  body,
  isLead,
  appURL,
  shortenedAppURL
) => {
  return `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
      <style>
        /* General email resets */
        body {
          margin: 0;
          padding: 0;
          font-family: Arial, sans-serif;
          background-color: #f4f4f4;
        }
        table {
          border-spacing: 0;
        }
        img {
          display: block;
          border: 0;
        }
        td {
          padding: 0;
        }
        /* Container styling */
        .email-container {
          width: 100%;
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
          border-radius: 10px;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
        }
        .email-header {
          background-color: #17a2b8;
          padding: 20px;
          text-align: center;
          color: #ffffff;
        }
        .email-body {
          padding: 20px;
          color: #333333;
          line-height: 1.6;
        }
        .email-footer {
          padding: 20px;
          text-align: center;
          font-size: 12px;
          color: #888888;
        }
        a {
          color: #17a2b8;
        }
      </style>
    </head>
    <body>
      <!-- Start Email Container -->
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #f4f4f4; padding: 20px;">
        <tr>
          <td>
            <!-- Email Content Area -->
            <table class="email-container" cellpadding="0" cellspacing="0" role="presentation">
              <!-- Email Header -->
              <tr>
                <td class="email-header">
                  <img src='cid:logo' alt='LearnLoop Logo' height='50'>
                </td>
              </tr>

              <!-- Email Body -->
              <tr>
                <td class="email-body">
                  <h2>${heading}</h2>
                  ${body}
                  Kind regards,<br>
                  <strong><a href='${appURL}'>LearnLoop</a></strong><br>
                </td>
              </tr>

              <!-- Email Footer -->
              <tr>
                <td class="email-footer">
                  <p>&copy; ${new Date().getFullYear()} LearnLoop</p>
                  ${addMailFooter(!isLead, appURL, shortenedAppURL)}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
`;
};

/**
 * Sends an email using Nodemailer.
 *
 * @param {string} email - The recipient's email address.
 * @param {string} subject - The subject line of the email.
 * @param {string} html - The HTML content of the email.
 * @returns {Promise<boolean>} - Returns a promise that resolves to `true` if the email was sent successfully, or `false` if an error occurred.
 */
const sendMail = (email, subject, html) => {
  const nodemailer = require("nodemailer");

  // Load DKIM and email credentials
  const keys = require("../../private/keys.json");

  // Configure the email transporter using Nodemailer
  const transporter = nodemailer.createTransport({
    host: "mail.learnloop.co.uk",
    port: 465,
    secure: true, // true for port 465, false for other ports
    auth: {
      user: "noreply@learnloop.co.uk",
      pass: keys.emailKey,
    },
    dkim: {
      domainName: "learnloop.co.uk",
      privateKey: keys.emailDkimPrivateKey,
    },
  });

  // Import node path module used to build path to logo
  const path = require("path");

  // Email options including the recipient, subject, HTML content, and attachments
  const mailOptions = {
    from: "noreply@learnloop.co.uk",
    to: email,
    subject: subject,
    html: html,
    attachments: [
      {
        filename: "logo.png", // The logo file name to include in the email
        path: path.resolve(__dirname, "./logo.png"), // The full path to the logo image
        cid: "logo", // Content ID to reference the logo in the HTML content
      },
    ],
  };

  // Send the email using the transporter
  return transporter
    .sendMail(mailOptions)
    .then((info) => {
      console.log("Email sent: " + info.response); // Log successful email response
      return true; // Return success status
    })
    .catch((error) => {
      console.error("sendMail failed", error); // Log any errors that occur during email sending
      return false; // Return failure status
    });
};

/**
 * Formats a Date object as 'dd/mm/yyyy'.
 *
 * @param {Date} date - The date object to format.
 * @returns {string} The formatted date as 'dd/mm/yyyy'.
 */
function formatDateUK(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0"); // Months are zero-based
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
}

/**
 * Formats a Date object as a string in the format YYYY-MM-DD.
 *
 * @param {Date} date - The Date object to format.
 * @returns {string} The formatted date string in YYYY-MM-DD format.
 */
const formatDateISO = (date) => {
  let year = date.getFullYear();
  let month = String(date.getMonth() + 1).padStart(2, "0"); // Months are zero-based
  let day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

module.exports = {
  createUniqueId,
  createPin,
  createSalt,
  hashPin,
  getOrganisers,
  pinIsValid,
  buildMailHTML,
  sendMail,
  formatDateUK,
  formatDateISO,
};
