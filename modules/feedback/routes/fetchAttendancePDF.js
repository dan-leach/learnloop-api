/**
 * @module fetchAttendancePDF
 * @memberof module:feedback
 * @summary Generates a PDF attendance report.
 *
 * @requires PDFKit - A library for creating PDFs in Node.js.
 * @requires path - For resolving file paths.
 * @requires ../../../config.json - Configuration settings for the application (including URLs).
 * @requires ../../utilities/dateUtilities - Utility functions for date formatting.
 *
 * @exports fetchAttendancePDF - The core module function that generates and serves the PDF attendance report.
 */

const PDFDocument = require("pdfkit");
const path = require("path");
const config = require("../../../config.json");
const dateUtilities = require("../../utilities/dateUtilities");

/**
 * @async
 * @function fetchAttendancePDF
 * @memberof module:fetchAttendancePDF
 * @summary Generates and serves a PDF attendance report.
 *
 * @param {object} sessionDetails - The details of the session.
 * @param {object} res - The HTTP response object to stream the PDF to the client.
 *
 * @returns {Promise<boolean>} - Resolves to `true` if the PDF is generated and sent successfully.
 *
 * @throws {Error} - Throws an error if the PDF generation process fails, such as a missing logo image, failure in path resolution, or issues with generating the PDF.
 */
const fetchAttendancePDF = async (id, res, link) => {
  // Retrieve session details from the database
  const updateSessionRoute = require("./updateSession");
  const sessionDetails = await updateSessionRoute.getOldSessionDetails(
    id,
    link
  );

  const { viewAttendance } = require("./viewAttendance");
  const { attendance } = await viewAttendance(sessionDetails.id, link);

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

    // Add attendance content

    doc
      .fill("black")
      .font("Helvetica-Bold")
      .moveDown(1) // Adjust to move below the header
      .fontSize(26)
      .text(`Attendance report`, { align: "left" })
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

    doc.text(`Total attendees: ${attendance.count}`).moveDown(0.3);

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

    for (const region of attendance.regions) {
      if (attendance.regions.length > 1) {
        doc
          .moveDown(1)
          .fontSize(20)
          .text(`${region.name} (${region.count})`)
          .moveDown(0.2);
      }

      for (const organisation of region.organisations) {
        doc
          .fontSize(14)
          .text(`${organisation.name} (${organisation.count})`)
          .moveDown(0.3);

        doc
          .fontSize(12)
          .text(`${organisation.attendees.join(", ").replace(/,\s*$/, ".")}`)
          .moveDown(1);
      }
    }

    // Finalize the PDF
    doc.end();
    return true;
  } catch (error) {
    throw error;
  }
};

module.exports = { fetchAttendancePDF };
