// src/services/ticket.service.js
const QRCode = require('qrcode');
const jwt = require('jsonwebtoken');
const Ticket = require('../models/ticket.model');
const cloudinaryService = require('./cloudinary.service');
const PDFDocument = require('pdfkit');
const Booking = require('../models/booking.model');
const Flight = require('../models/flight.model');
const axios = require('axios'); 

const BASE_URL = process.env.BASE_URL;
const BARCODE_SECRET = process.env.BARCODE_SIGNING_SECRET || process.env.JWT_SECRET;
const BARCODE_EXPIRES_DAYS = parseInt(process.env.BARCODE_EXPIRES_DAYS || '365', 10);

/**
 * Create barcode token (JWT)
*/
function createBarcodeToken(payload = {}) {
  const opts = {};
  if (BARCODE_EXPIRES_DAYS > 0) {
    opts.expiresIn = `${BARCODE_EXPIRES_DAYS}d`;
  }
  return jwt.sign(payload, BARCODE_SECRET, opts);
}

/**
 * Helper: return a Buffer of a pdf created for this booking,
 * embedding booking details and the QR (qrBuffer).
 */
// replace the existing createPdfBuffer with this function
async function createPdfBuffer(booking, flight, qrBuffer) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const bufs = [];
      doc.on('data', (d) => bufs.push(d));
      doc.on('end', () => resolve(Buffer.concat(bufs)));

      // Styles / measurements
      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const leftColWidth = pageWidth * 0.62;
      const rightColWidth = pageWidth - leftColWidth;
      const qrSize = Math.min(200, rightColWidth - 10);

      // Colors
      const primary = '#0f172a'; // slate-900
      const accent = '#075985';  // indigo-ish
      const lightAccent = '#f0f9ff';

      // Header: colored bar with logo/name
      doc.rect(doc.x - 40, doc.y - 40, pageWidth + 80, 80).fill(accent);
      doc.fillColor('white').fontSize(18).font('Helvetica-Bold');

      // Optional: embed logo. If you have an airline/logoBuffer variable, use doc.image(logoBuffer, ...)
      // Example (uncomment if you have a local path or buffer):
      // if (logoBuffer) doc.image(logoBuffer, doc.x, doc.y - 30, { width: 60, height: 60 });

      doc.text('E-TICKET', doc.x + 10, doc.y - 30, { continued: true });
      // right-aligned small meta
      doc.fontSize(10).text(`Issued: ${new Date().toLocaleString()}`, { align: 'right' });

      // Move below header
      doc.moveDown(3);
      doc.fillColor(primary);

      // Top row: left = PNR + booking summary; right = QR
      const startY = doc.y;
      // Left column
      doc.fontSize(12).font('Helvetica-Bold');
      doc.text(`PNR: ${booking.pnr || ''}`, doc.x, doc.y);
      doc.moveDown(0.4);
      doc.fontSize(10).font('Helvetica');
      doc.text(`Booking ID: ${String(booking._id)}`);
      doc.text(`Status: ${booking.status || '—'}`);
      doc.text(`Payment: ${booking.paymentStatus || '—'}`);
      doc.moveDown(0.6);

      // Flight summary (left column)
      if (flight) {
        doc.font('Helvetica-Bold').fontSize(11).text(`${flight.flightNumber || ''} — ${flight.origin?.code || ''} → ${flight.destination?.code || ''}`);
        doc.font('Helvetica').fontSize(10);
        doc.text(`${flight.origin?.name || ''} (${flight.origin?.code || ''})`);
        doc.text(`${flight.destination?.name || ''} (${flight.destination?.code || ''})`);
        doc.text(`Departure: ${flight.departureTime ? new Date(flight.departureTime).toLocaleString() : '-'}`);
        doc.text(`Arrival: ${flight.arrivalTime ? new Date(flight.arrivalTime).toLocaleString() : '-'}`);
      }

      // Save current position for QR placement on the right column
      const rightX = doc.page.margins.left + leftColWidth + 10;
      const qrY = startY;

      // Draw QR on the right column (try to fit)
      try {
        doc.image(qrBuffer, rightX, qrY, { width: qrSize, height: qrSize });
      } catch (err) {
        // ignore if QR can't be embedded
      }

      // Move cursor under left column (ensure we don't overlap)
      doc.moveDown(1.5);

      // Separator line
      doc.moveTo(doc.x - 2, doc.y).lineTo(doc.page.margins.left + pageWidth + 2, doc.y).lineWidth(0.5).strokeColor('#E6E7E8').stroke();
      doc.moveDown(0.8);

      // Passenger table header
      doc.font('Helvetica-Bold').fontSize(11).fillColor(primary).text('Passengers', { continued: false });
      doc.moveDown(0.4);

      // Table columns: Name | Passport | Seat
      const col1 = doc.x;
      const col2 = col1 + (pageWidth * 0.45);
      const col3 = col2 + (pageWidth * 0.28);

      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('Name', col1, doc.y, { width: col2 - col1 - 10 });
      doc.text('Passport', col2, doc.y, { width: col3 - col2 - 10 });
      doc.text('Seat', col3, doc.y);
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(10);

      (booking.passengers || []).forEach((p, idx) => {
        const name = p.name || `Passenger ${idx + 1}`;
        const passport = p.passport || '-';
        const seat = (booking.seats && booking.seats[idx]) || (booking.seats && booking.seats.join(', ')) || '-';
        doc.text(name, col1, doc.y, { width: col2 - col1 - 10 });
        doc.text(passport, col2, doc.y, { width: col3 - col2 - 10 });
        doc.text(seat, col3, doc.y);
        doc.moveDown(0.6);
      });

      doc.moveDown(0.4);

      // Fare & extra details
      doc.font('Helvetica-Bold').fontSize(11).text('Fare Details');
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(10);
      doc.text(`Fare: ${booking.fare || 0} ${process.env.CURRENCY || 'USD'}`);
      doc.text(`Passengers: ${booking.passengerCount || (booking.passengers||[]).length}`);
      doc.moveDown(0.6);

      // If there are any extra metadata, show them
      if (booking.meta) {
        doc.font('Helvetica-Bold').fontSize(10).text('Notes');
        doc.font('Helvetica').fontSize(9).text(JSON.stringify(booking.meta).slice(0, 300));
        doc.moveDown(0.6);
      }

      // Draw a nice box with PNR and instruction
      const boxTop = doc.y;
      const boxHeight = 60;
      doc.roundedRect(doc.x - 2, boxTop, pageWidth + 4, boxHeight, 6).stroke('#E6E7E8');
      doc.font('Helvetica-Bold').fontSize(14).text(`PNR: ${booking.pnr || ''}`, doc.x + 8, boxTop + 8);
      doc.font('Helvetica').fontSize(9).text('Show this e-ticket (PDF or QR) at check-in or to gate staff.', doc.x + 8, boxTop + 30);
      doc.moveDown(4);

      // Footer with small terms
      doc.moveTo(doc.page.margins.left, doc.page.height - doc.page.margins.bottom - 90).lineTo(doc.page.margins.left + pageWidth, doc.page.height - doc.page.margins.bottom - 90).strokeColor('#E6E7E8').lineWidth(0.5).stroke();
      doc.fontSize(8).fillColor('#6B7280').text('This is an electronic ticket. Please present the QR code or PDF at the airport. Terms & conditions apply.', { align: 'left' });
      doc.moveDown(0.3);
      doc.text('If you have any questions, contact support.', { align: 'left' });

      // Optionally include barcodeToken text at bottom right
      doc.fontSize(8).fillColor('#374151').text(`Token: ${booking._id ? String(booking._id).slice(-8) : ''}`, { align: 'right' });

      // finalize
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}


/**
 * Create a ticket (QR generation + cloudinary upload + PDF generation + upload + Ticket doc)
 * booking: Booking mongoose doc (or plain object with _id, pnr, passengers, seats, fare, etc.)
 */
exports.createTicketForBooking = async (booking, flight = null) => {
  if (!booking || !booking._id) throw new Error('Invalid booking for ticket generation');

  // Create token with bookingId + issuedAt + pnr
  const payload = { ticketId: String(booking._id), pnr: booking.pnr || null };
  const token = createBarcodeToken(payload);

  // Create scan URL — frontend can also accept this token and show ticket
  const scanUrl = `${BASE_URL}/api/tickets/scan/${encodeURIComponent(token)}`;

  // Generate QR buffer (PNG)
  const qrBuffer = await QRCode.toBuffer(scanUrl, { type: 'png', margin: 1, scale: 6 });

  // Upload QR to Cloudinary (image)
  const publicName = `ticket_qr_${String(booking._id)}_${Date.now()}`;
  const uploadResult = await cloudinaryService.uploadBuffer(qrBuffer, {
    folder: process.env.CLOUDINARY_UPLOAD_FOLDER || 'tickets',
    public_id: publicName,
    resource_type: 'image'
  });

  // Generate PDF buffer (include flight info if passed)
  const pdfBuffer = await createPdfBuffer(booking, flight, qrBuffer);

  // Upload PDF to Cloudinary as RAW with format 'pdf' so URL ends with .pdf and Cloudinary sets content-type
  const pdfPublic = `ticket_pdf_${String(booking._id)}_${Date.now()}`;
  const pdfUploadResult = await cloudinaryService.uploadBuffer(pdfBuffer, {
    folder: process.env.CLOUDINARY_UPLOAD_FOLDER || 'tickets',
    public_id: pdfPublic,
    resource_type: 'raw',
    format: 'pdf'
  });

  // Create or update Ticket doc
  const ticketData = {
    bookingId: booking._id,
    barcodeUrl: uploadResult.secure_url,
    barcodeToken: token,
    issuedAt: new Date(),
    eTicketPdfUrl: pdfUploadResult.secure_url,
    meta: {
      cloudinary: {
        qr: { public_id: uploadResult.public_id, url: uploadResult.secure_url },
        pdf: { public_id: pdfUploadResult.public_id, url: pdfUploadResult.secure_url }
      }
    }
  };

  const ticket = await Ticket.findOneAndUpdate({ bookingId: booking._id }, ticketData, { upsert: true, new: true, setDefaultsOnInsert: true });
  return ticket;
};

