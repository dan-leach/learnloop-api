/**
 * @module fetchFeedbackPDF
 * @memberof module:feedback
 * @summary Generates a PDF feedback report.
 *
 * @requires PDFKit - A library for creating PDFs in Node.js.
 * @requires path - For resolving file paths.
 * @requires ../../../config.json - Configuration settings for the application (including URLs).
 * @requires ../../utilities/dateUtilities - Utility functions for date formatting.
 *
 * @exports fetchAttendancePDF - The core module function that generates and serves the PDF feedback report.
 */

const PDFDocument = require("pdfkit");
const path = require("path");
const config = require("../../../config.json");
const dateUtilities = require("../../utilities/dateUtilities");

/**
 * @async
 * @function fetchFeedbackPDF
 * @memberof module:fetchFeedbackPDF
 * @summary Generates and serves a PDF feedback report.
 *
 * @param {object} id - The session id.
 * @param {object} res - The HTTP response object to stream the PDF to the client.
 *
 * @returns {Promise<boolean>} - Resolves to `true` if the PDF is generated and sent successfully.
 *
 * @throws {Error} - Throws an error if the PDF generation process fails, such as a missing logo image, failure in path resolution, or issues with generating the PDF.
 */
const fetchFeedbackPDF = async (id, res, link) => {
  // Retrieve session details from the database
  const updateSessionRoute = require("./updateSession");
  const sessionDetails = await updateSessionRoute.getOldSessionDetails(
    id,
    link
  );

  const { viewFeedback } = require("./viewFeedback");
  const { feedback, questions, subsessions } = await viewFeedback(id, link);

  console.error(feedback, questions, subsessions);

  try {
    // Create a new PDF document
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 100, bottom: 50, left: 50, right: 50 }, // Adjust top margin for the header
    });

    // Set headers for file download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${sessionDetails.title}-attendance.pdf`
    );

    // Pipe the PDF into the response
    doc.pipe(res);

    // Add header background
    const headerHeight = 60; // Height of the header
    const pageWidth = doc.page.width;

    doc
      .rect(0, 0, pageWidth, headerHeight) // Header at the top
      .fill("#17a2b8");

    // Add logo to header
    const logoPath = path.resolve(__dirname, "../../utilities/logo.png");
    const logoHeight = 40;

    doc.image(logoPath, 5, 10, {
      height: logoHeight,
    });

    // Add feedback content

    doc
      .fill("black")
      .font("Helvetica-Bold")
      .moveDown(1) // Adjust to move below the header
      .fontSize(26)
      .text(`Feedback report`, { align: "left" })
      .moveDown(0.2);

    doc
      .font("Helvetica")
      .fontSize(14)
      .text(
        `For '${sessionDetails.title}' by ${
          sessionDetails.name
        } on ${dateUtilities.formatDateUK(sessionDetails.date)}`
      )
      .moveDown(0.3);

    const date = new Date();
    const dateString =
      String(date.getDate()).padStart(2, "0") +
      "/" +
      String(date.getMonth() + 1).padStart(2, "0") +
      "/" +
      date.getFullYear() +
      " " +
      String(date.getHours()).padStart(2, "0") +
      ":" +
      String(date.getMinutes()).padStart(2, "0");

    doc.text(`Report generated: ${dateString}`).moveDown(1);

    doc.moveDown(1).fontSize(20).text(`Positive comments`).moveDown(0.2);
    for (const comment of feedback.positive) {
      doc.fontSize(12).text(`${comment}`).moveDown(0.3);
    }

    doc.moveDown(1).fontSize(20).text(`Constructive comments`).moveDown(0.2);
    for (const comment of feedback.negative) {
      doc.fontSize(12).text(`${comment}`).moveDown(0.3);
    }

    // custom questions
    for (const question of questions) {
      doc.moveDown(1).fontSize(20).text(`${question.title}`).moveDown(0.2);

      if (question.type === "text") {
        for (const response of question.responses) {
          doc.fontSize(12).text(`${response}`).moveDown(0.3);
        }
      }

      if (question.type === "select") {
        for (const option of question.options) {
          doc
            .fontSize(12)
            .text(`${option.title}: ${option.count}`)
            .moveDown(0.3);
        }
      }

      if (question.type === "checkbox") {
        for (const option of question.options) {
          doc
            .fontSize(12)
            .text(`${option.title}: ${option.count}`)
            .moveDown(0.3);
        }
      }
    }

    //overall score
    doc
      .moveDown(1)
      .fontSize(20)
      .text(
        `Overall score: ${(
          feedback.score.reduce((sum, num) => sum + num, 0) /
          feedback.score.length
        ).toFixed(1)}/100`
      )
      .moveDown(0.2);

    //subsessions
    if (subsessions.length) {
      doc.moveDown(1).fontSize(20).text(`Sessions`).moveDown(0.2);
    }
    for (const subsession of subsessions) {
      doc
        .fontSize(16)
        .text(`'${subsession.title}' by ${subsession.name}`)
        .moveDown(0.1);

      doc.fontSize(14).text(`Positive comments`).moveDown(0.2);
      for (const comment of subsession.feedback.positive) {
        doc.fontSize(10).text(`${comment}`).moveDown(0.3);
      }

      doc.fontSize(14).text(`Constructive comments`).moveDown(0.2);
      for (const comment of subsession.feedback.negative) {
        doc.fontSize(10).text(`${comment}`).moveDown(0.3);
      }

      doc
        .moveDown(1)
        .fontSize(14)
        .text(
          `Overall score: ${(
            subsession.feedback.score.reduce((sum, num) => sum + num, 0) /
            subsession.feedback.score.length
          ).toFixed(1)}/100`
        )
        .moveDown(1);
    }

    doc.fontSize(14).text(`Score guide`).moveDown(0.3);
    doc
      .fontSize(10)
      .text(`>95: an overwhelmingly excellent session, couldn't be improved`)
      .moveDown(0.2);
    doc
      .fontSize(10)
      .text(`>80: an excellent sesssion, minimal grounds for improvement`)
      .moveDown(0.2);
    doc
      .fontSize(10)
      .text(`>70: a very good session, minor points for improvement`)
      .moveDown(0.2);
    doc
      .fontSize(10)
      .text(`>60: a fairly good session, could be improved further`)
      .moveDown(0.2);
    doc
      .fontSize(10)
      .text(`>40: basically sound, but needs further development`)
      .moveDown(0.2);
    doc
      .fontSize(10)
      .text(`>=20: not adequate in its current state`)
      .moveDown(0.2);
    doc.fontSize(10).text(`<20: an extremely poor session`).moveDown(0.2);

    // Finalize the PDF
    doc.end();
    return true;
  } catch (error) {
    throw error;
  }
};

module.exports = { fetchFeedbackPDF };
