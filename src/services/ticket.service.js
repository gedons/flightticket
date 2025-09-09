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
 * Enhanced Helper: return a Buffer of a professionally styled pdf created for this booking,
 * embedding booking details and the QR (qrBuffer).
 */
async function createPdfBuffer(booking, flight, qrBuffer) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        size: 'A4', 
        margin: 40,
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
      const pageWidth = doc.page.width - 80; // 40px margins on each side
      const margin = 40;
      const centerX = margin + pageWidth / 2;
      
      // Enhanced color palette - Modern airline branding
      const colors = {
        primary: '#0F172A',      // Slate 900 - Professional dark
        secondary: '#1E40AF',    // Blue 700 - Trust and reliability
        accent: '#F59E0B',       // Amber 500 - Premium gold accent
        danger: '#EF4444',       // Red 500 - Urgent information
        success: '#059669',      // Emerald 600 - Confirmed status
        dark: '#1F2937',         // Gray 800 - Dark text
        medium: '#6B7280',       // Gray 500 - Medium text
        light: '#F3F4F6',        // Gray 100 - Light backgrounds
        lighter: '#F9FAFB',      // Gray 50 - Very light
        white: '#FFFFFF',
        border: '#E5E7EB'        // Gray 200 - Borders
      };

      // Typography system
      const fonts = {
        regular: 'Helvetica',
        bold: 'Helvetica-Bold',
        oblique: 'Helvetica-Oblique'
      };

      // Utility functions
      const drawCard = (x, y, width, height, options = {}) => {
        const { 
          fillColor = colors.white, 
          strokeColor = colors.border,
          strokeWidth = 1,
          radius = 8
        } = options;
        
        // Create rounded rectangle effect
        doc.roundedRect(x, y, width, height, radius)
           .fillAndStroke(fillColor, strokeColor)
           .lineWidth(strokeWidth);
      };

      const drawGradientHeader = (height = 120) => {
        // Create gradient effect with multiple rectangles
        const steps = 10;
        for (let i = 0; i < steps; i++) {
          const alpha = 1 - (i * 0.1);
          const stepHeight = height / steps;
          doc.rect(0, i * stepHeight, doc.page.width, stepHeight)
             .fillColor(colors.primary, alpha)
             .fill();
        }
      };

      const drawIconText = (icon, text, x, y, options = {}) => {
        const { fontSize = 10, color = colors.dark, width = 200 } = options;
        doc.fillColor(color)
           .fontSize(fontSize)
           .text(`${icon} ${text}`, x, y, { width });
      };

      // ======================
      // HEADER SECTION - Enhanced with gradient and logo space
      // ======================
      
      // Gradient background
      drawGradientHeader(140);
      
      // Header overlay for better contrast
      doc.rect(0, 0, doc.page.width, 140)
         .fill(colors.primary)
         .fillOpacity(0.9);

      // Airline branding area (left side)
      doc.fillColor(colors.white)
         .font(fonts.bold)
         .fontSize(32)
         .text('AMERICAN', margin, 30);
      
      doc.fontSize(12)
         .font(fonts.regular)
         .fillColor(colors.accent)
         .text('A I R L I N E S', margin, 65);

      // Document title (right side)
      doc.fillColor(colors.white)
         .font(fonts.bold)
         .fontSize(24)
         .text('E-TICKET', margin, 30, { align: 'right', width: pageWidth });
      
      doc.fontSize(11)
         .font(fonts.regular)
         .fillColor(colors.lighter)
         .text(`Issued: ${new Date().toLocaleDateString('en-US', { 
           weekday: 'short', 
           year: 'numeric', 
           month: 'short', 
           day: 'numeric',
           hour: '2-digit',
           minute: '2-digit',
           hour12: true
         })}`, margin, 55, { align: 'right', width: pageWidth });

      // Decorative line
      doc.moveTo(margin, 100)
         .lineTo(margin + pageWidth, 100)
         .lineWidth(2)
         .strokeColor(colors.accent)
         .stroke();

      // Reset position
      doc.y = 160;

      // ======================
      // PNR & STATUS SECTION - Modern card design
      // ======================
      
      const pnrCardHeight = 90;
      drawCard(margin, doc.y, pageWidth, pnrCardHeight, { 
        fillColor: colors.secondary,
        strokeColor: colors.secondary
      });

      // PNR Section
      doc.fillColor(colors.white)
         .font(fonts.regular)
         .fontSize(12)
         .text('BOOKING REFERENCE', margin + 25, doc.y + 20);
      
      doc.fontSize(36)
         .font(fonts.bold)
         .text(booking.pnr || 'PENDING', margin + 25, doc.y + 35);

      // Status badge (top right of card)
      const statusText = (booking.status || 'pending').toUpperCase();
      const statusColor = booking.status === 'confirmed' ? colors.success : 
                         booking.status === 'cancelled' ? colors.danger : colors.accent;
      
      const badgeWidth = 100;
      const badgeX = margin + pageWidth - badgeWidth - 25;
      
      doc.roundedRect(badgeX, doc.y + 20, badgeWidth, 30, 15)
         .fill(statusColor);
      
      doc.fillColor(colors.white)
         .font(fonts.bold)
         .fontSize(11)
         .text(statusText, badgeX, doc.y + 30, { align: 'center', width: badgeWidth });

      // Passenger count indicator
      doc.fillColor(colors.lighter)
         .font(fonts.regular)
         .fontSize(10)
         .text(`${booking.passengerCount || (booking.passengers || []).length || 1} Passenger(s)`, 
               badgeX, doc.y + 55, { align: 'center', width: badgeWidth });

      doc.y += pnrCardHeight + 25;

      // ======================
      // FLIGHT INFORMATION - Enhanced layout
      // ======================
      
      if (flight) {
        // Section header
        doc.fillColor(colors.primary)
           .font(fonts.bold)
           .fontSize(16)
           .text('FLIGHT DETAILS', margin, doc.y);
        
        // Underline accent
        doc.moveTo(margin, doc.y + 5)
           .lineTo(margin + 120, doc.y + 5)
           .lineWidth(3)
           .strokeColor(colors.accent)
           .stroke();

        doc.y += 25;

        // Flight route card
        const routeCardHeight = 80;
        drawCard(margin, doc.y, pageWidth, routeCardHeight, { 
          fillColor: colors.lighter,
          strokeColor: colors.border
        });

        // Flight number (prominent)
        doc.fillColor(colors.primary)
           .font(fonts.bold)
           .fontSize(28)
           .text(flight.flightNumber || 'TBA', margin + 25, doc.y + 15);

        // Route with arrow
        const routeY = doc.y + 45;
        doc.fontSize(20)
           .fillColor(colors.secondary)
           .text(flight.origin?.code || 'DEP', margin + 25, routeY);

        // Flight arrow
        doc.fontSize(16)
           .fillColor(colors.medium)
           .text('✈', centerX - 10, routeY);

        doc.fontSize(20)
           .fillColor(colors.secondary)
           .text(flight.destination?.code || 'ARR', margin + pageWidth - 80, routeY);

        // Aircraft type (if available)
        if (flight.aircraft) {
          doc.fillColor(colors.medium)
             .font(fonts.regular)
             .fontSize(10)
             .text(`Aircraft: ${flight.aircraft}`, margin + pageWidth - 150, doc.y + 15);
        }

        doc.y += routeCardHeight + 20;

        // Departure and Arrival cards - Side by side
        const timeCardWidth = (pageWidth - 15) / 2;
        const timeCardHeight = 140;

        // Departure Card
        drawCard(margin, doc.y, timeCardWidth, timeCardHeight, { 
          fillColor: colors.white,
          strokeColor: colors.border
        });

        doc.fillColor(colors.secondary)
           .font(fonts.bold)
           .fontSize(14)
           .text('DEPARTURE', margin + 20, doc.y + 20);

        doc.fillColor(colors.dark)
           .font(fonts.regular)
           .fontSize(12)
           .text(flight.origin?.name || 'Airport Name TBA', 
                 margin + 20, doc.y + 45, { width: timeCardWidth - 40 });

        doc.fontSize(11)
           .fillColor(colors.medium)
           .text(`Terminal: ${flight.origin?.terminal || 'TBA'}`, margin + 20, doc.y + 65);

        if (flight.departureTime) {
          const depTime = new Date(flight.departureTime);
          doc.fontSize(24)
             .fillColor(colors.primary)
             .font(fonts.bold)
             .text(depTime.toLocaleTimeString('en-US', { 
               hour: '2-digit', 
               minute: '2-digit',
               hour12: false 
             }), margin + 20, doc.y + 85);
          
          doc.fontSize(11)
             .font(fonts.regular)
             .fillColor(colors.medium)
             .text(depTime.toLocaleDateString('en-US', {
               weekday: 'short',
               month: 'short',
               day: 'numeric'
             }), margin + 20, doc.y + 115);
        }

        // Arrival Card
        const arrivalX = margin + timeCardWidth + 15;
        drawCard(arrivalX, doc.y - timeCardHeight, timeCardWidth, timeCardHeight, { 
          fillColor: colors.white,
          strokeColor: colors.border
        });

        doc.fillColor(colors.secondary)
           .font(fonts.bold)
           .fontSize(14)
           .text('ARRIVAL', arrivalX + 20, doc.y - timeCardHeight + 20);

        doc.fillColor(colors.dark)
           .font(fonts.regular)
           .fontSize(12)
           .text(flight.destination?.name || 'Airport Name TBA', 
                 arrivalX + 20, doc.y - timeCardHeight + 45, 
                 { width: timeCardWidth - 40 });

        doc.fontSize(11)
           .fillColor(colors.medium)
           .text(`Terminal: ${flight.destination?.terminal || 'TBA'}`, 
                 arrivalX + 20, doc.y - timeCardHeight + 65);

        if (flight.arrivalTime) {
          const arrTime = new Date(flight.arrivalTime);
          doc.fontSize(24)
             .fillColor(colors.primary)
             .font(fonts.bold)
             .text(arrTime.toLocaleTimeString('en-US', { 
               hour: '2-digit', 
               minute: '2-digit',
               hour12: false 
             }), arrivalX + 20, doc.y - timeCardHeight + 85);
          
          doc.fontSize(11)
             .font(fonts.regular)
             .fillColor(colors.medium)
             .text(arrTime.toLocaleDateString('en-US', {
               weekday: 'short',
               month: 'short',
               day: 'numeric'
             }), arrivalX + 20, doc.y - timeCardHeight + 115);
        }

        // Flight duration (center between cards)
        if (flight.departureTime && flight.arrivalTime) {
          const duration = new Date(flight.arrivalTime) - new Date(flight.departureTime);
          const hours = Math.floor(duration / (1000 * 60 * 60));
          const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
          
          doc.fillColor(colors.accent)
             .font(fonts.bold)
             .fontSize(10)
             .text(`${hours}h ${minutes}m`, centerX - 25, doc.y - 70, 
                   { align: 'center', width: 50 });
          
          doc.fillColor(colors.medium)
             .font(fonts.regular)
             .fontSize(8)
             .text('Duration', centerX - 25, doc.y - 55, 
                   { align: 'center', width: 50 });
        }

        doc.y += 25;
      }

      // ======================
      // PASSENGER INFORMATION - Modern table design
      // ======================
      
      doc.fillColor(colors.primary)
         .font(fonts.bold)
         .fontSize(16)
         .text('PASSENGER INFORMATION', margin, doc.y);
      
      // Underline accent
      doc.moveTo(margin, doc.y + 5)
         .lineTo(margin + 180, doc.y + 5)
         .lineWidth(3)
         .strokeColor(colors.accent)
         .stroke();

      doc.y += 25;

      const passengers = booking.passengers || [];
      if (passengers.length > 0) {
        // Modern table design
        const tableY = doc.y;
        const rowHeight = 45;
        const headerHeight = 35;
        
        // Table container
        const tableHeight = headerHeight + (passengers.length * rowHeight);
        drawCard(margin, tableY, pageWidth, tableHeight, {
          fillColor: colors.white,
          strokeColor: colors.border
        });

        // Column definitions
        const columns = [
          { title: 'PASSENGER NAME', width: pageWidth * 0.35, align: 'left' },
          { title: 'DOCUMENT ID', width: pageWidth * 0.25, align: 'left' },
          { title: 'SEAT', width: pageWidth * 0.15, align: 'center' },
          { title: 'CLASS', width: pageWidth * 0.25, align: 'center' }
        ];

        // Table header
        doc.rect(margin, tableY, pageWidth, headerHeight)
           .fill(colors.light);

        let currentX = margin + 15;
        doc.fillColor(colors.dark)
           .font(fonts.bold)
           .fontSize(11);

        columns.forEach(col => {
          doc.text(col.title, currentX, tableY + 12, { 
            width: col.width - 10, 
            align: col.align 
          });
          currentX += col.width;
        });

        // Passenger rows
        passengers.forEach((passenger, index) => {
          const rowY = tableY + headerHeight + (index * rowHeight);
          
          // Alternating row colors
          if (index % 2 === 1) {
            doc.rect(margin, rowY, pageWidth, rowHeight)
               .fill(colors.lighter);
          }

          currentX = margin + 15;
          doc.fillColor(colors.dark)
             .font(fonts.regular)
             .fontSize(11);

          // Passenger name
          doc.text(passenger.name || `Passenger ${index + 1}`, 
                   currentX, rowY + 15, { 
                     width: columns[0].width - 10,
                     align: columns[0].align 
                   });
          currentX += columns[0].width;

          // Document ID
          doc.text(passenger.passport || passenger.documentId || 'Not provided', 
                   currentX, rowY + 15, { 
                     width: columns[1].width - 10,
                     align: columns[1].align 
                   });
          currentX += columns[1].width;

          // Seat
          const seatNumber = (booking.seats && booking.seats[index]) || 
                           (booking.seats && typeof booking.seats === 'string' ? booking.seats : 'TBA');
          doc.text(seatNumber, currentX, rowY + 15, { 
            width: columns[2].width - 10,
            align: columns[2].align 
          });
          currentX += columns[2].width;

          // Class
          doc.text(passenger.class || flight?.class || 'Economy', 
                   currentX, rowY + 15, { 
                     width: columns[3].width - 10,
                     align: columns[3].align 
                   });
        });

        doc.y = tableY + tableHeight + 25;
      } else {
        drawCard(margin, doc.y, pageWidth, 60, { 
          fillColor: colors.lighter,
          strokeColor: colors.border
        });
        
        doc.fillColor(colors.medium)
           .fontSize(12)
           .text('No passenger information available', margin + 25, doc.y + 25);
        doc.y += 85;
      }

      // ======================
      // BOTTOM SECTION - Fare & QR Code
      // ======================
      
      const bottomSectionY = doc.y;
      const fareCardWidth = pageWidth * 0.55;
      const qrCardWidth = pageWidth * 0.4;

      // Fare Information Card
      drawCard(margin, bottomSectionY, fareCardWidth, 160, {
        fillColor: colors.white,
        strokeColor: colors.border
      });

      doc.fillColor(colors.primary)
         .font(fonts.bold)
         .fontSize(14)
         .text('BOOKING DETAILS', margin + 20, bottomSectionY + 20);

      const fareItems = [
        { label: 'Base Fare:', value: `${booking.currency || '$'}${booking.fare || '0.00'}` },
        { label: 'Passengers:', value: `${booking.passengerCount || passengers.length || 1}` },
        { label: 'Payment Status:', value: booking.paymentStatus || 'Pending' },
        { label: 'Booking Date:', value: booking.createdAt ? 
          new Date(booking.createdAt).toLocaleDateString() : 'N/A' },
        { label: 'Confirmation:', value: booking.confirmationNumber || 'Pending' }
      ];

      fareItems.forEach((item, index) => {
        const itemY = bottomSectionY + 50 + (index * 18);
        doc.fillColor(colors.medium)
           .font(fonts.regular)
           .fontSize(10)
           .text(item.label, margin + 20, itemY);
        
        doc.fillColor(colors.dark)
           .font(fonts.bold)
           .text(item.value, margin + 120, itemY);
      });

      // QR Code Card
      const qrCardX = margin + fareCardWidth + 15;
      if (qrBuffer) {
        drawCard(qrCardX, bottomSectionY, qrCardWidth, 160, {
          fillColor: colors.white,
          strokeColor: colors.border
        });

        doc.fillColor(colors.primary)
           .font(fonts.bold)
           .fontSize(12)
           .text('MOBILE BOARDING PASS', qrCardX + 15, bottomSectionY + 15, {
             align: 'center',
             width: qrCardWidth - 30
           });

        // QR code
        const qrSize = 90;
        const qrX = qrCardX + (qrCardWidth - qrSize) / 2;
        doc.image(qrBuffer, qrX, bottomSectionY + 35, { 
          width: qrSize, 
          height: qrSize 
        });

        doc.fillColor(colors.medium)
           .font(fonts.regular)
           .fontSize(9)
           .text('Present at check-in\nand security', 
                 qrCardX + 15, bottomSectionY + 135, {
                   align: 'center',
                   width: qrCardWidth - 30
                 });
      }

      doc.y = bottomSectionY + 180;

      // ======================
      // IMPORTANT NOTICES
      // ======================
      
      drawCard(margin, doc.y, pageWidth, 100, {
        fillColor: '#FEF3CD', // Warm yellow background
        strokeColor: colors.accent
      });

      doc.fillColor(colors.accent)
         .font(fonts.bold)
         .fontSize(12)
         .text('⚠ IMPORTANT TRAVEL INFORMATION', margin + 20, doc.y + 15);

      const notices = [
        'Check-in opens 24 hours before departure and closes 45 minutes prior',
        'Arrive at airport 2-3 hours early (domestic/international)',
        'Valid government-issued photo ID required for all passengers'
      ];

      notices.forEach((notice, index) => {
        doc.fillColor(colors.dark)
           .font(fonts.regular)
           .fontSize(9)
           .text(`• ${notice}`, margin + 20, doc.y + 35 + (index * 15), {
             width: pageWidth - 40
           });
      });

      doc.y += 120;

      // ======================
      // FOOTER
      // ======================
      
      // Decorative footer line
      doc.moveTo(margin, doc.y)
         .lineTo(margin + pageWidth, doc.y)
         .lineWidth(2)
         .strokeColor(colors.accent)
         .stroke();

      doc.y += 15;

      // Footer content
      doc.fillColor(colors.medium)
         .font(fonts.regular)
         .fontSize(9)
         .text('This is a valid electronic ticket. Save or print for your records.', 
               margin, doc.y, { align: 'center', width: pageWidth });

      doc.y += 15;
      doc.fillColor(colors.light)
         .fontSize(8)
         .text(`Document ID: ${String(booking._id).slice(-8).toUpperCase()} | Generated: ${new Date().toLocaleString()}`, 
               margin, doc.y, { align: 'center', width: pageWidth });

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

