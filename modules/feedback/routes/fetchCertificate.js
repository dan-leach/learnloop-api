/**
 * @module fetchCertificate
 * @memberof module:feedback
 * @summary Generates a PDF certificate of attendance for a specific session and attendee.
 *
 * This module exports a function that generates a PDF certificate of attendance with session details, attendee's name, and session information.
 * The generated PDF is sent directly to the client as a downloadable file.
 *
 * @requires PDFKit - A library for creating PDFs in Node.js.
 * @requires path - For resolving file paths.
 * @requires ../../../config.json - Configuration settings for the application (including URLs).
 * @requires ../../utilities/dateUtilities - Utility functions for date formatting.
 *
 * @exports fetchCertificate - The core module function that generates and serves the PDF certificate.
 */

const PDFDocument = require("pdfkit");
const path = require("path");
const config = require("../../../config.json");
const dateUtilities = require("../../utilities/dateUtilities");

/**
 * @async
 * @function fetchCertificate
 * @memberof module:fetchCertificate
 * @summary Generates and serves a PDF certificate of attendance.
 *
 * @param {object} sessionDetails - The details of the session, including the session title, session date, and any subsessions.
 * @param {object} attendee - The attendee's information, including their name.
 * @param {object} res - The HTTP response object to stream the PDF to the client.
 *
 * @returns {Promise<boolean>} - Resolves to `true` if the PDF is generated and sent successfully.
 *
 * @throws {Error} - Throws an error if the PDF generation process fails, such as a missing logo image, failure in path resolution, or issues with generating the PDF.
 */
const fetchCertificate = async (sessionDetails, attendee, res) => {
  console.error(sessionDetails, attendee);
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
      `attachment; filename=${sessionDetails.title}_certificate.pdf`
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

    // Add certificate content

    doc
      .fill("black")
      .font("Helvetica")
      .moveDown(3) // Adjust to move below the header
      .fontSize(26)
      .text("Certificate of Attendance", { align: "center", underline: true })
      .moveDown(2);

    doc
      .fontSize(20)
      .text(`This is to certify that`, { align: "center" })
      .moveDown(1);

    doc
      .fontSize(30)
      .font("Helvetica-Bold")
      .text(attendee.name, { align: "center" })
      .moveDown(0.7);

    doc
      .fontSize(20)
      .font("Helvetica")
      .text(
        `attended '${sessionDetails.title}' ${
          sessionDetails.subsessions.length ? "organised by" : "facilitated by"
        } ${sessionDetails.name}`,
        {
          align: "center",
        }
      )
      .moveDown(1);

    if (sessionDetails.subsessions.length) {
      doc
        .fontSize(16)
        .text(`which included the sessions:`, {
          align: "center",
        })
        .moveDown(0.5);

      for (const subsession of sessionDetails.subsessions) {
        doc
          .fontSize(16)
          .text(`'${subsession.title}' by ${subsession.organisers[0].name}`, {
            align: "center",
          })
          .moveDown(0.3);
      }
    }

    doc.moveDown(2);

    doc
      .fontSize(16)
      .text(
        `Session date: ${dateUtilities.formatDateUK(sessionDetails.date)}`,
        { align: "right" }
      );

    doc
      .text(
        `Certificate generated: ${dateUtilities.formatDateUK(new Date())}`,
        {
          align: "right",
        }
      )
      .moveDown(2);

    doc
      .fontSize(10)
      .fillColor("gray")
      .text(`You can request feedback for your own sessions using LearnLoop.`, {
        align: "center",
      });

    doc.text(
      `Visit ${config.client.url.replace("https://", "")} to get started!`,
      {
        align: "center",
        link: config.client.url,
      }
    ); // Add link to homepage

    // Finalize the PDF
    doc.end();
    return true;
  } catch (error) {
    throw error;
  }
};

module.exports = { fetchCertificate };
