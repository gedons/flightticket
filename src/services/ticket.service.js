// src/services/ticket.service.js
require('dotenv').config();
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const Booking = require('../models/booking.model');
const Flight = require('../models/flight.model');
const Ticket = require('../models/ticket.model');

const jwt = require('jsonwebtoken');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const BARCODE_SECRET = process.env.BARCODE_SIGNING_SECRET || process.env.JWT_SECRET ;
const BARCODE_EXPIRES_DAYS = parseInt(process.env.BARCODE_EXPIRES_DAYS || '365', 10) || 365;
const FRONTEND_BASE = (process.env.FRONTEND_BASE_URL || process.env.CLIENT_BASE_URL || '').replace(/\/+$/, '') || '';
const CLOUD_FOLDER = process.env.CLOUDINARY_FOLDER || 'tickets';

function createBarcodeToken(payload = {}) {
  // token payload should include ticketId or bookingId and pnr
  return jwt.sign(payload, BARCODE_SECRET, { expiresIn: `${BARCODE_EXPIRES_DAYS}d` });
}

async function generateQrBuffer(scanUrl) {
  return QRCode.toBuffer(scanUrl, { type: 'png', errorCorrectionLevel: 'H', margin: 1, scale: 6 });
}

async function fetchLogoBuffer(logoUrl) {
  if (!logoUrl) return null;
  try {
    const res = await axios.get(logoUrl, { responseType: 'arraybuffer', timeout: 10_000 });
    return Buffer.from(res.data);
  } catch (err) {
    console.warn('fetchLogoBuffer failed', err.message || err);
    return null;
  }
}

// utility: compute travel minutes if times present
function minutesBetween(a, b) {
  if (!a || !b) return null;
  const diffMs = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(diffMs / 60000);
}

// simple haversine distance (km)
function haversineKm(lat1, lon1, lat2, lon2) {
  if (![lat1,lon1,lat2,lon2].every(v => typeof v === 'number')) return null;
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)*Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return Math.round(R * c);
}

// Enhanced modern PDF generator with improved design and additional information
async function createPdfBuffer({ booking, flight, ticketBarcodeBuffer, airlineLogoBuffer }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        size: 'A4', 
        margin: 0, // We'll handle margins manually for better control
        info: {
          Title: `E-Ticket - ${booking.pnr || ''}`,
          Author: flight?.airline?.name || 'American Airline',
          Subject: 'Electronic Ticket'
        }
      });
      
      const bufs = [];
      doc.on('data', (d) => bufs.push(d));
      doc.on('end', () => resolve(Buffer.concat(bufs)));

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const margin = 30;
      const contentWidth = pageWidth - (margin * 2);

      // Modern color palette
      const colors = {
        primary: '#0B5394',        // Deep blue
        secondary: '#1565C0',      // Medium blue
        accent: '#42A5F5',         // Light blue
        success: '#00C853',        // Green
        warning: '#FF8F00',        // Orange
        background: '#F8FAFC',     // Very light gray
        surface: '#FFFFFF',        // White
        text: '#1A202C',          // Dark gray
        textMuted: '#64748B',     // Medium gray
        border: '#E2E8F0',        // Light border
        gradient: '#E3F2FD'       // Light blue gradient
      };

      // Header with gradient background
      const headerHeight = 140;
      doc.rect(0, 0, pageWidth, headerHeight)
         .fillColor(colors.primary)
         .fill();
      
      // Add subtle gradient effect
      doc.rect(0, headerHeight - 20, pageWidth, 20)
         .fillColor(colors.secondary)
         .fill();

      // Header content
      let currentY = 25;
      
      // Logo and airline name
      if (airlineLogoBuffer) {
        try {
          doc.image(airlineLogoBuffer, margin, currentY, { width: 60, height: 42 });
        } catch (e) {
          console.warn('Logo rendering failed:', e.message);
        }
      }
      
      // Airline name and ticket title
      const airlineName = flight?.airline?.name || 'American Airline';
      doc.fillColor('#FFFFFF')
         .font('Helvetica-Bold')
         .fontSize(22)
         .text(airlineName, margin + 80, currentY);
      
      doc.font('Helvetica')
         .fontSize(14)
         .fillColor('#E3F2FD')
         .text('ELECTRONIC TICKET', margin + 80, currentY + 25);

      // PNR and status in top right
      doc.font('Helvetica-Bold')
         .fontSize(11)
         .fillColor('#E3F2FD')
         .text('CONFIRMATION NUMBER', pageWidth - 200, currentY);
      
      doc.fontSize(18)
         .fillColor('#FFFFFF')
         .text(booking.pnr || 'N/A', pageWidth - 200, currentY + 15);

      // Booking status
      const status = booking.status || 'CONFIRMED';
      const statusColor = status === 'CONFIRMED' ? colors.success : colors.warning;
      
      doc.rect(pageWidth - 150, currentY + 45, 120, 25)
         .fillColor(statusColor)
         .fill();
      
      doc.font('Helvetica-Bold')
         .fontSize(10)
         .fillColor('#FFFFFF')
         .text(status, pageWidth - 140, currentY + 52);

      // Passenger information section
      currentY = headerHeight + 20;
      
      // Passenger card
      doc.rect(margin, currentY, contentWidth, 80)
         .fillColor(colors.surface)
         .fill()
         .strokeColor(colors.border)
         .lineWidth(1)
         .stroke();

      // Passenger header
      doc.rect(margin, currentY, contentWidth, 30)
         .fillColor(colors.background)
         .fill();
      
      doc.fillColor(colors.text)
         .font('Helvetica-Bold')
         .fontSize(12)
         .text('PASSENGER INFORMATION', margin + 15, currentY + 10);

      // Passenger details
      const passengerY = currentY + 45;
      const passenger = booking.passengers?.[0] || {};
      
      doc.font('Helvetica-Bold')
         .fontSize(16)
         .fillColor(colors.text)
         .text(passenger.name || booking.passengerName || 'N/A', margin + 15, passengerY);
      
      doc.font('Helvetica')
         .fontSize(11)
         .fillColor(colors.textMuted)
         .text(`Email: ${passenger.email || booking.email || 'N/A'}`, margin + 15, passengerY + 20);

      // Additional passenger info in right column
      if (passenger.phone || booking.phone) {
        doc.text(`Phone: ${passenger.phone || booking.phone}`, margin + 300, passengerY + 20);
      }

      // QR Code in passenger section
      const qrSize = 65;
      try {
        doc.image(ticketBarcodeBuffer, pageWidth - margin - qrSize - 10, passengerY - 10, { 
          width: qrSize, 
          height: qrSize 
        });
      } catch (err) {
        console.warn('QR code rendering failed:', err.message);
      }

      currentY += 100;

      // Flight overview card
      doc.rect(margin, currentY, contentWidth, 100)
         .fillColor(colors.primary)
         .fill();

      // Flight overview content
      const flightOverviewY = currentY + 20;
      
      // Flight number and route
      const flightNumber = flight?.flightNumber || 'N/A';
      const seg0 = flight?.segments?.[0] || {};
      const route = `${seg0.origin?.code || 'DEP'} → ${seg0.destination?.code || 'ARR'}`;
      
      doc.fillColor('#FFFFFF')
         .font('Helvetica-Bold')
         .fontSize(24)
         .text(`${flightNumber}`, margin + 20, flightOverviewY);
      
      doc.fontSize(16)
         .text(route, margin + 20, flightOverviewY + 30);

      // Flight date and time
      const flightDate = seg0.departureTime 
        ? new Date(seg0.departureTime).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          })
        : 'Date TBD';
      
      doc.font('Helvetica')
         .fontSize(12)
         .fillColor(colors.gradient)
         .text(flightDate, margin + 20, flightOverviewY + 55);

      // Price and class info (right side)
      const farePrice = booking.totalPrice || booking.price || flight?.price;
      if (farePrice) {
        doc.font('Helvetica')
           .fontSize(11)
           .fillColor(colors.gradient)
           .text('TOTAL FARE', pageWidth - margin - 150, flightOverviewY);
        
        doc.font('Helvetica-Bold')
           .fontSize(20)
           .fillColor('#FFFFFF')
           .text(`$${farePrice}`, pageWidth - margin - 150, flightOverviewY + 15);
      }

      // Class information
      const fareClass = booking.class || seg0.cabin || 'Economy';
      doc.font('Helvetica')
         .fontSize(11)
         .fillColor(colors.gradient)
         .text('CLASS', pageWidth - margin - 150, flightOverviewY + 45);
      
      doc.font('Helvetica-Bold')
         .fontSize(14)
         .fillColor('#FFFFFF')
         .text(fareClass, pageWidth - margin - 150, flightOverviewY + 60);

      currentY += 120;

      // Flight segments (enhanced design)
      (flight?.segments || []).forEach((seg, idx) => {
        // Segment card with shadow effect
        doc.rect(margin, currentY, contentWidth, 160)
           .fillColor(colors.surface)
           .fill()
           .strokeColor(colors.border)
           .lineWidth(1)
           .stroke();

        // Segment header with accent color
        doc.rect(margin, currentY, contentWidth, 35)
           .fillColor(colors.accent)
           .fill();
        
        doc.fillColor('#FFFFFF')
           .font('Helvetica-Bold')
           .fontSize(13)
           .text(`FLIGHT SEGMENT ${idx + 1}`, margin + 20, currentY + 12);

        // Segment date
        const segDate = seg.departureTime 
          ? new Date(seg.departureTime).toLocaleDateString('en-US', { 
              month: 'short', 
              day: 'numeric' 
            })
          : '';
        
        doc.font('Helvetica')
           .fontSize(11)
           .text(segDate, pageWidth - margin - 100, currentY + 12);

        let segmentY = currentY + 55;

        // Departure section (enhanced layout)
        doc.fillColor(colors.text)
           .font('Helvetica-Bold')
           .fontSize(24)
           .text(seg.origin?.code || 'DEP', margin + 20, segmentY);
        
        doc.font('Helvetica-Bold')
           .fontSize(12)
           .fillColor(colors.textMuted)
           .text('DEPARTURE', margin + 20, segmentY - 15);
        
        doc.font('Helvetica')
           .fontSize(11)
           .fillColor(colors.text)
           .text(seg.origin?.city || seg.origin?.name || '', margin + 20, segmentY + 25);

        // Departure time with better formatting
        const depTime = seg.departureTime ? new Date(seg.departureTime) : null;
        doc.font('Helvetica-Bold')
           .fontSize(18)
           .fillColor(colors.primary)
           .text(
             depTime ? depTime.toLocaleTimeString([], { 
               hour: '2-digit', 
               minute: '2-digit' 
             }) : '--:--', 
             margin + 20, segmentY + 45
           );

        // Enhanced flight path with modern design
        const centerX = pageWidth / 2;
        const lineY = segmentY + 30;
        
        // Flight path line
        doc.strokeColor(colors.accent)
           .lineWidth(3)
           .moveTo(140, lineY)
           .lineTo(centerX - 30, lineY)
           .stroke();
        
        // Airplane icon (simple representation)
        doc.fillColor(colors.accent)
           .circle(centerX, lineY, 8)
           .fill();
        
        doc.strokeColor(colors.accent)
           .lineWidth(3)
           .moveTo(centerX + 30, lineY)
           .lineTo(pageWidth - 160, lineY)
           .stroke();

        // Flight duration (enhanced)
        const travelMins = seg.travelTimeMinutes || minutesBetween(seg.departureTime, seg.arrivalTime);
        const duration = travelMins ? `${Math.floor(travelMins/60)}h ${travelMins%60}m` : 'N/A';
        
        doc.font('Helvetica-Bold')
           .fontSize(10)
           .fillColor(colors.textMuted)
           .text('DURATION', centerX - 25, lineY - 20, { width: 50, align: 'center' });
        
        doc.font('Helvetica-Bold')
           .fontSize(12)
           .fillColor(colors.text)
           .text(duration, centerX - 25, lineY + 15, { width: 50, align: 'center' });

        // Arrival section (enhanced layout)
        doc.fillColor(colors.text)
           .font('Helvetica-Bold')
           .fontSize(24)
           .text(seg.destination?.code || 'ARR', pageWidth - margin - 80, segmentY);
        
        doc.font('Helvetica-Bold')
           .fontSize(12)
           .fillColor(colors.textMuted)
           .text('ARRIVAL', pageWidth - margin - 80, segmentY - 15);
        
        doc.font('Helvetica')
           .fontSize(11)
           .fillColor(colors.text)
           .text(seg.destination?.city || seg.destination?.name || '', pageWidth - margin - 80, segmentY + 25, {
             width: 80,
             align: 'left'
           });

        // Arrival time
        const arrTime = seg.arrivalTime ? new Date(seg.arrivalTime) : null;
        doc.font('Helvetica-Bold')
           .fontSize(18)
           .fillColor(colors.primary)
           .text(
             arrTime ? arrTime.toLocaleTimeString([], { 
               hour: '2-digit', 
               minute: '2-digit' 
             }) : '--:--', 
             pageWidth - margin - 80, segmentY + 45
           );

        // Additional flight info section (bottom of segment)
        const infoY = segmentY + 80;
        
        // Info boxes
        const infoBoxes = [
          { label: 'SEAT', value: seg.seat || booking.seatNumber || 'TBD' },
          { label: 'GATE', value: seg.gate || 'TBD' },
          { label: 'TERMINAL', value: seg.terminal || 'TBD' },
          { label: 'AIRCRAFT', value: seg.aircraft || flight?.aircraft || 'TBD' }
        ];

        infoBoxes.forEach((info, i) => {
          const boxX = margin + 20 + (i * 120);
          
          doc.font('Helvetica-Bold')
             .fontSize(9)
             .fillColor(colors.textMuted)
             .text(info.label, boxX, infoY);
          
          doc.font('Helvetica-Bold')
             .fontSize(12)
             .fillColor(colors.text)
             .text(info.value, boxX, infoY + 15);
        });

        currentY += 180;
      });

      // Booking details section (enhanced)
      currentY += 10;
      doc.rect(margin, currentY, contentWidth, 120)
         .fillColor(colors.background)
         .fill()
         .strokeColor(colors.border)
         .stroke();

      doc.fillColor(colors.text)
         .font('Helvetica-Bold')
         .fontSize(14)
         .text('BOOKING DETAILS', margin + 20, currentY + 20);

      const detailsY = currentY + 45;
      
      // Booking details in grid format
      const bookingDetails = [
        ['Booking Reference', booking.reference || booking._id.toString().slice(-6).toUpperCase()],
        ['Booking Date', booking.createdAt ? new Date(booking.createdAt).toLocaleDateString() : 'N/A'],
        ['Payment Status', booking.paymentStatus || 'Paid'],
        ['Ticket Type', 'Electronic Ticket']
      ];

      bookingDetails.forEach((detail, i) => {
        const row = Math.floor(i / 2);
        const col = i % 2;
        const x = margin + 20 + (col * 280);
        const y = detailsY + (row * 30);
        
        doc.font('Helvetica')
           .fontSize(10)
           .fillColor(colors.textMuted)
           .text(detail[0] + ':', x, y);
        
        doc.font('Helvetica-Bold')
           .fontSize(11)
           .fillColor(colors.text)
           .text(detail[1], x + 100, y);
      });

      // Price breakdown (if available)
      if (booking.priceBreakdown) {
        currentY += 140;
        doc.rect(margin, currentY, contentWidth, 100)
           .fillColor(colors.surface)
           .fill()
           .strokeColor(colors.border)
           .stroke();

        doc.fillColor(colors.text)
           .font('Helvetica-Bold')
           .fontSize(14)
           .text('FARE BREAKDOWN', margin + 20, currentY + 20);

        let breakdownY = currentY + 45;
        Object.entries(booking.priceBreakdown).forEach(([key, value]) => {
          doc.font('Helvetica')
             .fontSize(11)
             .fillColor(colors.text)
             .text(key.charAt(0).toUpperCase() + key.slice(1), margin + 20, breakdownY);
          
          doc.text(`$${value}`, pageWidth - margin - 100, breakdownY);
          breakdownY += 15;
        });
      }

      // Important notices section (enhanced)
      const footerY = pageHeight - 120;
      doc.rect(0, footerY, pageWidth, 120)
         .fillColor(colors.primary)
         .fill();

      doc.fillColor('#FFFFFF')
         .font('Helvetica-Bold')
         .fontSize(14)
         .text('IMPORTANT TRAVEL INFORMATION', margin, footerY + 20);

      const notices = [
        '• Check-in opens 24 hours before departure. Online check-in recommended.',
        '• Arrive at airport 2 hours early for domestic, 3 hours for international flights.',
        '• Valid government-issued ID required. Check passport/visa requirements.',
        '• This e-ticket is valid for travel. Save or print for your records.'
      ];

      notices.forEach((notice, i) => {
        doc.font('Helvetica')
           .fontSize(10)
           .fillColor(colors.gradient)
           .text(notice, margin, footerY + 45 + (i * 15), { width: contentWidth - 20 });
      });

      // Footer with contact info
      doc.font('Helvetica')
         .fontSize(9)
         .fillColor(colors.gradient)
         .text(`Generated on ${new Date().toLocaleString()} | Customer Service: 1-800-XXX-XXXX`, 
               margin, footerY + 105);

      doc.end();
    } catch (err) {
      console.error('PDF generation error:', err);
      reject(err);
    }
  });
}

// Cloudinary upload function
async function uploadBufferToCloudinary(buffer, resourceType = 'auto', publicId = null) {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: CLOUD_FOLDER,
      resource_type: resourceType,
      use_filename: true,
      unique_filename: true
    };

    // Only add public_id if provided
    if (publicId) {
      uploadOptions.public_id = publicId;
    }

    const stream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          return reject(error);
        }
        console.log('Cloudinary upload success:', result.secure_url);
        resolve(result);
      }
    );
    
    stream.end(buffer);
  });
}

/**
 * Main: create ticket (QR+PDF) for a bookingId.
 * If a ticket exists already we update it; otherwise create new Ticket doc.
 */
async function createTicketForBooking(bookingId) {
  if (!bookingId) throw new Error('bookingId required');

  // 1) fetch booking and flight
  const booking = await Booking.findById(bookingId).lean();
  if (!booking) throw new Error('Booking not found');

  const flight = booking.flightId
    ? (typeof booking.flightId === 'object' ? booking.flightId : await Flight.findById(booking.flightId).lean())
    : null;

  // 2) create or ensure ticket document exists BEFORE generating token/QR/PDF
  let ticketDoc = await Ticket.findOne({ bookingId: booking._id });
  const now = new Date();
  if (!ticketDoc) {
    ticketDoc = await Ticket.create({
      bookingId: booking._id,
      issuedAt: now,
      ticketVersion: 0
    });
  }

  // 3) create signed barcode token that references the ticketId (not bookingId)
  const payload = { ticketId: String(ticketDoc._id), pnr: booking.pnr || null };
  const token = createBarcodeToken(payload);
  
  // e.g. https://your-frontend.app/tickets/<ticketId>/view?token=<signedToken>
  const scanUrlForQr = `${FRONTEND_BASE}/tickets/${encodeURIComponent(String(ticketDoc._id))}/view`;

  // 5) generate QR buffer and optionally fetch airline logo
  const [qrBuffer, logoBuffer] = await Promise.all([
    generateQrBuffer(scanUrlForQr),
    fetchLogoBuffer(flight?.airline?.logoUrl)
  ]);

  // 6) generate PDF buffer (use your existing createPdfBuffer)
  const pdfBuffer = await createPdfBuffer({
    booking,
    flight,
    ticketBarcodeBuffer: qrBuffer,
    airlineLogoBuffer: logoBuffer
  });

  // 7) Upload assets to Cloudinary
  const timestamp = Date.now();
  const basename = `ticket_${String(ticketDoc._id)}_${timestamp}`;

  // NOTE: using your uploadBufferToCloudinary(buffer, resourceType, publicId) signature
  const [qrRes, pdfRes] = await Promise.all([
    uploadBufferToCloudinary(qrBuffer, 'image', `${basename}_qr`),
    // include .pdf in the public id to help Cloudinary detect format
    uploadBufferToCloudinary(pdfBuffer, 'raw', `${basename}_pdf.pdf`)
  ]);

  // 8) Build an attachment (download) URL that forces a .pdf filename in the browser (optional)
  let pdfDownloadUrl = pdfRes.secure_url;
  try {
    pdfDownloadUrl = cloudinary.url(pdfRes.public_id, {
      resource_type: 'raw',
      secure: true,
      transformation: [{ flags: 'attachment', format: 'pdf' }]
    });
  } catch (err) {
    // fallback to secure_url
    console.warn('cloudinary.url builder failed, falling back to secure_url', err?.message || err);
  }

  // 9) Update ticket document with all metadata (store token & scan URL)
  const issuedAt = new Date();
  const ticketData = {
    bookingId: booking._id,
    barcodeUrl: qrRes.secure_url,
    eTicketPdfUrl: pdfDownloadUrl,   // download-forced URL
    rawPdfUrl: pdfRes.secure_url,    // raw url
    issuedAt,
    scanUrl: scanUrlForQr,           // IMPORTANT: uses ticket id + token
    barcodeToken: token,             // signed JWT referencing ticketId
    pdfMetadata: {
      qr: qrRes,
      pdf: pdfRes
    },
    ticketVersion: (ticketDoc.ticketVersion || 0) + 1
  };

  await Ticket.updateOne({ _id: ticketDoc._id }, { $set: ticketData });
  ticketDoc = await Ticket.findById(ticketDoc._id).lean();

  return ticketDoc;
}

/**
 * regeneratePdfForTicket(ticketId): wrapper to regenerate QR+PDF for an existing Ticket (based on booking)
 */
async function regeneratePdfForTicket(ticketId) {
  if (!ticketId) throw new Error('ticketId required');
  const ticket = await Ticket.findById(ticketId).lean();
  if (!ticket) throw new Error('Ticket not found');

  // regenerate using bookingId from ticket
  const bookingId = ticket.bookingId;
  return createTicketForBooking(bookingId);
}

module.exports = {
  createTicketForBooking,
  regeneratePdfForTicket,
  createBarcodeToken,
  generateQrBuffer
};