/**
 * @module fetchFeedbackPDF
 * @memberof module:feedback
 * @summary Generates a PDF feedback report for a specific session.
 *
 * @description
 * This module retrieves feedback and session details from the database, organizes the information, and generates
 * a PDF report. The report includes feedback comments, scores, session information, and a score guide. The generated
 * PDF is streamed directly to the client as a downloadable file.
 *
 * @requires PDFKit - A library for creating PDFs in Node.js.
 * @requires path - For resolving file paths.
 * @requires entities For decoding html entities
 * @requires ../../../config.json - Configuration settings for the application (including URLs).
 * @requires ../../utilities/dateUtilities - Utility functions for date formatting.
 * @requires ./updateSession - Module for retrieving session details from the database.
 * @requires ./viewFeedback - Module for retrieving feedback details from the database.
 *
 * @exports fetchFeedbackPDF - The core module function that generates and serves the PDF feedback report.
 */

const PDFDocument = require("pdfkit");
const path = require("path");
const config = require("../../../config.json");
const dateUtilities = require("../../utilities/dateUtilities");
const { decode } = require("entities");

/**
 * @async
 * @function fetchFeedbackPDF
 * @memberof module:fetchFeedbackPDF
 * @summary Generates and serves a PDF feedback report.
 *
 * @param {string} id - The session ID for which feedback is being retrieved.
 * @param {object} res - The HTTP response object to stream the PDF to the client.
 * @param {object} link - The database connection for executing SQL queries.
 * @returns {Promise<boolean>} - Resolves to `true` if the PDF is generated and sent successfully.
 * @throws {Error} - Throws an error if PDF generation or data retrieval fails.
 */
const fetchFeedbackPDF = async (id, res, link) => {
  try {
    // Retrieve session details and feedback data from the database
    const updateSessionRoute = require("./updateSession");
    const sessionDetails = await updateSessionRoute.getOldSessionDetails(
      id,
      link
    );

    const { viewFeedback } = require("./viewFeedback");
    const { feedback, questions, subsessions } = await viewFeedback(id, link);

    // Create a new PDF document
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 100, bottom: 50, left: 50, right: 50 },
    });

    // Set headers for file download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${decode(sessionDetails.title)}-feedback-report.pdf`
    );

    // Pipe the PDF into the response
    doc.pipe(res);

    // Add header background and logo
    const headerHeight = 60;
    const pageWidth = doc.page.width;

    doc.rect(0, 0, pageWidth, headerHeight).fill("#17a2b8");

    const logoPath = path.resolve(__dirname, "../../utilities/logo.png");
    const logoHeight = 40;
    doc.image(logoPath, 5, 10, { height: logoHeight });

    // Add session title and metadata
    doc
      .fill("black")
      .font("Helvetica-Bold")
      .moveDown(1)
      .fontSize(26)
      .text(`Feedback Report`, { align: "left" })
      .moveDown(0.2);

    doc
      .font("Helvetica")
      .fontSize(14)
      .text(
        `For '${decode(sessionDetails.title)}' by ${decode(
          sessionDetails.name
        )} on ${dateUtilities.formatDateUK(sessionDetails.date)}`
      )
      .moveDown(0.3);

    const dateString = dateUtilities.formatDateUK(new Date());
    doc.text(`Report generated: ${dateString}`).moveDown(1);

    // Add feedback sections
    doc.moveDown(1).fontSize(20).text(`Positive Comments`).moveDown(0.2);
    for (const comment of feedback.positive) {
      doc
        .fontSize(12)
        .text(`${decode(comment)}`)
        .moveDown(0.3);
    }

    doc.moveDown(1).fontSize(20).text(`Constructive Comments`).moveDown(0.2);
    for (const comment of feedback.negative) {
      doc
        .fontSize(12)
        .text(`${decode(comment)}`)
        .moveDown(0.3);
    }

    // Add custom question responses
    for (const question of questions) {
      doc
        .moveDown(1)
        .fontSize(20)
        .text(`${decode(question.title)}`)
        .moveDown(0.2);

      if (question.type === "text") {
        for (const response of question.responses) {
          doc
            .fontSize(12)
            .text(`${decode(response)}`)
            .moveDown(0.3);
        }
      } else if (question.type === "select" || question.type === "checkbox") {
        for (const option of question.options) {
          doc
            .fontSize(12)
            .text(`${decode(option.title)}: ${option.count}`)
            .moveDown(0.3);
        }
      }
    }

    // Add overall feedback score
    const averageScore = (
      feedback.score.reduce((sum, num) => sum + num, 0) / feedback.score.length
    ).toFixed(1);
    doc
      .moveDown(1)
      .fontSize(20)
      .text(`Overall Score: ${averageScore}/100`)
      .moveDown(0.2);

    // Add subsession details
    if (subsessions.length) {
      doc.moveDown(1).fontSize(20).text(`Sessions`).moveDown(0.2);
      for (const subsession of subsessions) {
        doc
          .fontSize(16)
          .text(`'${decode(subsession.title)}' by ${decode(subsession.name)}`)
          .moveDown(0.1);

        doc.fontSize(14).text(`Positive Comments`).moveDown(0.2);
        for (const comment of subsession.feedback.positive) {
          doc
            .fontSize(10)
            .text(`${decode(comment)}`)
            .moveDown(0.3);
        }

        doc.fontSize(14).text(`Constructive Comments`).moveDown(0.2);
        for (const comment of subsession.feedback.negative) {
          doc
            .fontSize(10)
            .text(`${decode(comment)}`)
            .moveDown(0.3);
        }

        const subsessionScore = (
          subsession.feedback.score.reduce((sum, num) => sum + num, 0) /
          subsession.feedback.score.length
        ).toFixed(1);
        doc
          .moveDown(1)
          .fontSize(14)
          .text(`Overall Score: ${subsessionScore}/100`)
          .moveDown(1);
      }
    }

    // Add score guide
    doc.fontSize(14).text(`Score Guide`).moveDown(0.3);
    const scoreGuide = [
      ">95: An overwhelmingly excellent session, couldn't be improved",
      ">80: An excellent session, minimal grounds for improvement",
      ">70: A very good session, minor points for improvement",
      ">60: A fairly good session, could be improved further",
      ">40: Basically sound, but needs further development",
      ">=20: Not adequate in its current state",
      "<20: An extremely poor session",
    ];
    for (const line of scoreGuide) {
      doc.fontSize(10).text(line).moveDown(0.2);
    }

    // Finalize the PDF
    doc.end();
    return true;
  } catch (error) {
    throw error;
  }
};

module.exports = { fetchFeedbackPDF };
