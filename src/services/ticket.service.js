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
async function createPdfBuffer(booking, flight, qrBuffer) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        size: 'A4', 
        margin: 50,
        bufferPages: true,
        info: {
          Title: `E-Ticket - ${booking.pnr || booking._id}`,
          Subject: 'Electronic Airline Ticket',
          Keywords: 'airline ticket boarding pass e-ticket'
        }
      });

      const bufs = [];
      doc.on('data', (d) => bufs.push(d));
      doc.on('end', () => resolve(Buffer.concat(bufs)));

      // Page dimensions and layout constants
      const pageWidth = doc.page.width - 100; // 50px margins on each side
      const margin = 50;
      
      // Color palette
      const colors = {
        primary: '#1e3a8a',      // Deep blue
        secondary: '#3b82f6',    // Bright blue
        accent: '#ef4444',       // Red for important info
        dark: '#1f2937',         // Dark gray
        medium: '#6b7280',       // Medium gray
        light: '#f3f4f6',        // Light gray
        white: '#ffffff',
        success: '#10b981'       // Green for confirmed
      };

      // Typography helpers
      const fonts = {
        regular: 'Helvetica',
        bold: 'Helvetica-Bold',
        oblique: 'Helvetica-Oblique'
      };

      // Helper functions
      const drawSection = (title, content, options = {}) => {
        const { backgroundColor = colors.light, titleColor = colors.primary, padding = 15 } = options;
        
        // Section background
        doc.rect(margin - 10, doc.y - 5, pageWidth + 20, content.height || 60)
           .fill(backgroundColor);
        
        doc.fillColor(titleColor)
           .font(fonts.bold)
           .fontSize(12)
           .text(title, margin, doc.y + 5);
        
        doc.moveDown(0.3);
      };

      const drawDivider = () => {
        doc.moveTo(margin, doc.y)
           .lineTo(margin + pageWidth, doc.y)
           .lineWidth(1)
           .strokeColor(colors.light)
           .stroke();
        doc.moveDown(1);
      };

      // ======================
      // HEADER SECTION
      // ======================
      
      // Main header background
      doc.rect(0, 0, doc.page.width, 100).fill(colors.primary);
      
      // Header content
      doc.fillColor(colors.white)
         .font(fonts.bold)
         .fontSize(28)
         .text('ELECTRONIC TICKET', margin, 25);
      
      doc.fontSize(12)
         .font(fonts.regular)
         .text(`Issued: ${new Date().toLocaleDateString('en-US', { 
           weekday: 'long', 
           year: 'numeric', 
           month: 'long', 
           day: 'numeric',
           hour: '2-digit',
           minute: '2-digit'
         })}`, margin, 60, { align: 'right' });

      // Move below header
      doc.y = 120;

      // ======================
      // BOOKING REFERENCE SECTION
      // ======================
      
      // PNR Box - Prominent display
      const pnrBoxHeight = 80;
      doc.rect(margin, doc.y, pageWidth, pnrBoxHeight)
         .fill(colors.secondary)
         .stroke();

      doc.fillColor(colors.white)
         .font(fonts.bold)
         .fontSize(16)
         .text('BOOKING REFERENCE', margin + 20, doc.y + 15);
      
      doc.fontSize(32)
         .text(booking.pnr || 'N/A', margin + 20, doc.y + 35);

      // Status badges on the right
      const statusX = margin + pageWidth - 150;
      doc.fontSize(10)
         .fillColor(colors.white)
         .text('STATUS', statusX, doc.y - 45);
      
      const statusColor = booking.status === 'confirmed' ? colors.success : colors.accent;
      doc.rect(statusX, doc.y - 30, 120, 25)
         .fill(statusColor)
         .stroke();
      
      doc.fillColor(colors.white)
         .font(fonts.bold)
         .fontSize(12)
         .text((booking.status || 'PENDING').toUpperCase(), statusX + 10, doc.y - 20);

      doc.y += pnrBoxHeight + 30;

      // ======================
      // FLIGHT INFORMATION SECTION
      // ======================
      
      if (flight) {
        // Flight header
        doc.fillColor(colors.primary)
           .font(fonts.bold)
           .fontSize(14)
           .text('FLIGHT DETAILS', margin, doc.y);
        
        drawDivider();

        // Flight number and route - Large and prominent
        doc.font(fonts.bold)
           .fontSize(24)
           .fillColor(colors.dark)
           .text(`${flight.flightNumber || 'N/A'}`, margin, doc.y);

        doc.fontSize(20)
           .text(`${flight.origin?.code || ''} → ${flight.destination?.code || ''}`, 
                 margin + 150, doc.y - 25);

        doc.moveDown(1.5);

        // Departure and Arrival in two columns
        const colWidth = pageWidth / 2;
        
        // Departure column
        doc.rect(margin, doc.y, colWidth - 10, 120).fill(colors.light);
        doc.fillColor(colors.primary)
           .font(fonts.bold)
           .fontSize(12)
           .text('DEPARTURE', margin + 15, doc.y + 15);
        
        doc.fillColor(colors.dark)
           .font(fonts.regular)
           .fontSize(16)
           .text(flight.origin?.name || 'Unknown Airport', margin + 15, doc.y + 35, 
                 { width: colWidth - 30 });
        
        doc.fontSize(14)
           .fillColor(colors.medium)
           .text(flight.origin?.code || '', margin + 15, doc.y + 55);
        
        if (flight.departureTime) {
          const depTime = new Date(flight.departureTime);
          doc.fontSize(18)
             .fillColor(colors.dark)
             .font(fonts.bold)
             .text(depTime.toLocaleTimeString('en-US', { 
               hour: '2-digit', 
               minute: '2-digit' 
             }), margin + 15, doc.y + 75);
          
          doc.fontSize(12)
             .font(fonts.regular)
             .fillColor(colors.medium)
             .text(depTime.toLocaleDateString(), margin + 15, doc.y + 100);
        }

        // Arrival column
        const arrivalX = margin + colWidth + 10;
        doc.rect(arrivalX, doc.y - 85, colWidth - 20, 120).fill(colors.light);
        doc.fillColor(colors.primary)
           .font(fonts.bold)
           .fontSize(12)
           .text('ARRIVAL', arrivalX + 15, doc.y - 70);
        
        doc.fillColor(colors.dark)
           .font(fonts.regular)
           .fontSize(16)
           .text(flight.destination?.name || 'Unknown Airport', arrivalX + 15, doc.y - 50, 
                 { width: colWidth - 50 });
        
        doc.fontSize(14)
           .fillColor(colors.medium)
           .text(flight.destination?.code || '', arrivalX + 15, doc.y - 30);
        
        if (flight.arrivalTime) {
          const arrTime = new Date(flight.arrivalTime);
          doc.fontSize(18)
             .fillColor(colors.dark)
             .font(fonts.bold)
             .text(arrTime.toLocaleTimeString('en-US', { 
               hour: '2-digit', 
               minute: '2-digit' 
             }), arrivalX + 15, doc.y - 10);
          
          doc.fontSize(12)
             .font(fonts.regular)
             .fillColor(colors.medium)
             .text(arrTime.toLocaleDateString(), arrivalX + 15, doc.y + 15);
        }

        doc.y += 150;
      }

      // ======================
      // PASSENGER INFORMATION SECTION
      // ======================
      
      doc.fillColor(colors.primary)
         .font(fonts.bold)
         .fontSize(14)
         .text('PASSENGER INFORMATION', margin, doc.y);
      
      drawDivider();

      // Passenger table
      const passengers = booking.passengers || [];
      if (passengers.length > 0) {
        // Table header
        doc.rect(margin, doc.y, pageWidth, 30).fill(colors.primary);
        
        const colWidths = {
          name: pageWidth * 0.4,
          passport: pageWidth * 0.25,
          seat: pageWidth * 0.2,
          class: pageWidth * 0.15
        };

        let currentX = margin + 10;
        doc.fillColor(colors.white)
           .font(fonts.bold)
           .fontSize(11);

        doc.text('PASSENGER NAME', currentX, doc.y + 10);
        currentX += colWidths.name;
        doc.text('PASSPORT/ID', currentX, doc.y + 10);
        currentX += colWidths.passport;
        doc.text('SEAT', currentX, doc.y + 10);
        currentX += colWidths.seat;
        doc.text('CLASS', currentX, doc.y + 10);

        doc.moveDown(2);

        // Passenger rows
        passengers.forEach((passenger, index) => {
          const rowY = doc.y;
          const rowHeight = 35;
          
          // Alternating row colors
          const bgColor = index % 2 === 0 ? colors.white : colors.light;
          doc.rect(margin, rowY, pageWidth, rowHeight).fill(bgColor);

          currentX = margin + 10;
          doc.fillColor(colors.dark)
             .font(fonts.regular)
             .fontSize(11);

          // Passenger name
          doc.text(passenger.name || `Passenger ${index + 1}`, 
                   currentX, rowY + 12, { width: colWidths.name - 10 });
          
          currentX += colWidths.name;
          // Passport
          doc.text(passenger.passport || 'N/A', 
                   currentX, rowY + 12, { width: colWidths.passport - 10 });
          
          currentX += colWidths.passport;
          // Seat
          const seatNumber = (booking.seats && booking.seats[index]) || 
                           (booking.seats && typeof booking.seats === 'string' ? booking.seats : 'N/A');
          doc.text(seatNumber, currentX, rowY + 12, { width: colWidths.seat - 10 });
          
          currentX += colWidths.seat;
          // Class
          doc.text('Economy', currentX, rowY + 12); // Default to Economy

          doc.y = rowY + rowHeight;
        });
      } else {
        doc.fillColor(colors.medium)
           .fontSize(12)
           .text('No passenger information available', margin, doc.y);
        doc.moveDown(2);
      }

      // ======================
      // FARE INFORMATION & QR CODE SECTION
      // ======================
      
      const fareQRSectionY = doc.y + 20;
      
      // Left side: Fare details
      doc.fillColor(colors.primary)
         .font(fonts.bold)
         .fontSize(14)
         .text('FARE BREAKDOWN', margin, fareQRSectionY);
      
      const fareBoxY = fareQRSectionY + 25;
      doc.rect(margin, fareBoxY, pageWidth * 0.6, 100).fill(colors.light);
      
      doc.fillColor(colors.dark)
         .font(fonts.regular)
         .fontSize(12);
      
      const fareDetails = [
        [`Base Fare:`, `${booking.fare || 0} ${process.env.CURRENCY || 'USD'}`],
        [`Passengers:`, `${booking.passengerCount || passengers.length}`],
        [`Payment Status:`, `${booking.paymentStatus || 'Pending'}`],
        [`Booking ID:`, `${String(booking._id).slice(-12)}`]
      ];

      fareDetails.forEach((detail, index) => {
        const itemY = fareBoxY + 15 + (index * 20);
        doc.text(detail[0], margin + 15, itemY);
        doc.text(detail[1], margin + 150, itemY);
      });

      // Right side: QR Code
      const qrX = margin + pageWidth * 0.65;
      if (qrBuffer) {
        doc.fillColor(colors.primary)
           .font(fonts.bold)
           .fontSize(12)
           .text('BOARDING PASS QR CODE', qrX, fareQRSectionY);
        
        // QR code with border
        doc.rect(qrX, fareQRSectionY + 25, 150, 150).stroke(colors.medium);
        doc.image(qrBuffer, qrX + 10, fareQRSectionY + 35, { width: 130, height: 130 });
        
        doc.fillColor(colors.medium)
           .font(fonts.regular)
           .fontSize(9)
           .text('Show this QR code at\ncheck-in and boarding', 
                 qrX, fareQRSectionY + 180, { align: 'center', width: 150 });
      }

      doc.y = Math.max(fareBoxY + 120, fareQRSectionY + 220);

      // ======================
      // IMPORTANT NOTICES SECTION
      // ======================
      
      doc.moveDown(2);
      
      // Important notice box
      doc.rect(margin, doc.y, pageWidth, 80).fill('#fef2f2').stroke(colors.accent);
      
      doc.fillColor(colors.accent)
         .font(fonts.bold)
         .fontSize(12)
         .text('IMPORTANT TRAVEL INFORMATION', margin + 15, doc.y + 15);
      
      doc.fillColor(colors.dark)
         .font(fonts.regular)
         .fontSize(10)
         .text('• Please arrive at the airport at least 2 hours before domestic flights and 3 hours before international flights', 
               margin + 15, doc.y + 35, { width: pageWidth - 30 });
      doc.text('• Valid photo ID and this e-ticket are required for check-in', 
               margin + 15, doc.y + 50, { width: pageWidth - 30 });
      doc.text('• Check-in closes 45 minutes before departure for domestic flights', 
               margin + 15, doc.y + 65, { width: pageWidth - 30 });

      doc.y += 100;

      // ======================
      // FOOTER SECTION
      // ======================
      
      // Footer separator
      doc.moveTo(margin, doc.y)
         .lineTo(margin + pageWidth, doc.y)
         .lineWidth(2)
         .strokeColor(colors.primary)
         .stroke();
      
      doc.moveDown(1);
      
      // Footer text
      doc.fillColor(colors.medium)
         .font(fonts.regular)
         .fontSize(9)
         .text('This is an electronic ticket. Please present this document or the QR code above for check-in and boarding.', 
               margin, doc.y, { align: 'center', width: pageWidth });
      
      doc.moveDown(0.5);
      doc.text('For customer support, visit our website or contact your travel agent.', 
               margin, doc.y, { align: 'center', width: pageWidth });
      
      // Version info
      doc.fontSize(8)
         .fillColor(colors.light)
         .text(`Document ID: ${String(booking._id).slice(-8)} | Generated: ${new Date().toISOString()}`, 
               margin, doc.y + 20, { align: 'center', width: pageWidth });

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

