/**
 * @module mailUtilities
 * @memberof module:LearnLoopAPI
 * @summary This module provides utilities for creating and sending emails.
 *
 * @description
 * The `mailUtilities` module offers functionalities for generating and sending
 * emails in the LearnLoop API. It includes methods for constructing email HTML
 * templates, formatting dates in various formats, and sending emails through
 * Nodemailer. The module also manages the inclusion of notices for development
 * mode and invitations for using LearnLoop, ensuring that all emails sent are
 * informative and well-structured.
 *
 * @requires nodemailer - A module for sending emails easily with Node.js.
 * @requires ../../config.json - Configuration file that contains application settings
 * including development mode flags and email credentials.
 *
 * @exports buildMailHTML - Constructs the complete HTML structure for an email.
 * @exports sendMail - Sends an email using the configured Nodemailer transporter.
 * @exports formatDateUK - Formats a date as 'dd/mm/yyyy'.
 * @exports formatDateISO - Formats a date as 'YYYY-MM-DD'.
 */

const config = require("../../config.json");

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

  return footer; // Return the complete footer HTML
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
 * @returns {string} - The complete HTML structure for the email.
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

  // Configure the email transporter using Nodemailer
  const transporter = nodemailer.createTransport({
    host: "mail.learnloop.co.uk",
    port: 465,
    secure: true, // true for port 465, false for other ports
    auth: {
      user: "noreply@learnloop.co.uk",
      pass: process.env.emailKey,
    },
    dkim: {
      domainName: "learnloop.co.uk",
      privateKey: process.env.emailDkimPrivateKey,
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
      console.error("Error sending email:", error); // Log the error
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

  return `${day}/${month}/${year}`; // Return formatted date string
}

/**
 * Formats a Date object as a string in the format YYYY-MM-DD.
 *
 * @param {Date} date - The Date object to format.
 * @returns {string} The formatted date string in YYYY-MM-DD format.
 */
const formatDateISO = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0"); // Months are zero-based
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`; // Return formatted date string
};

module.exports = {
  buildMailHTML,
  sendMail,
  formatDateUK,
  formatDateISO,
};
