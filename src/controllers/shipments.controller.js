// src/controllers/shipments.controller.js
const Shipment = require('../models/shipment.model');
const { generateTrackingCode } = require('../utils/trackingCode');
const QRCode = require('qrcode');
const cloudinary = require('../config/cloudinary');
const shipmentsEvents = require('../events/shipments.events');
const axios = require('axios');
const { renderShipmentPdfBuffer } = require('../utils/shipmentPdf');


const FRONTEND_BASE = (process.env.FRONTEND_BASE_URL || '').replace(/\/+$/, '');
const CLOUD_FOLDER = process.env.CLOUDINARY_FOLDER || 'shipments';
const BARCODE_SECRET = process.env.BARCODE_SIGNING_SECRET || process.env.JWT_SECRET;

// helper: upload buffer to cloudinary
function uploadBufferToCloudinary(buffer, publicIdBase, resourceType = 'image') {
  return new Promise((resolve, reject) => {
    const opts = { folder: CLOUD_FOLDER, resource_type: resourceType, public_id: publicIdBase, overwrite: true };
    const stream = cloudinary.uploader.upload_stream(opts, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
    stream.end(buffer);
  });
}

async function adminCreateShipment(req, res, next) {
  try {
    const body = req.body || {};
    // generate unique tracking code
    let code = (body.trackingCode || '').toUpperCase().replace(/\s+/g,'') || generateTrackingCode();
    let tries = 0;
    while (await Shipment.findOne({ trackingCode: code }) && tries < 6) {
      code = generateTrackingCode();
      tries++;
    }

    const payload = {
      trackingCode: code,
      shipmentDate: body.shipmentDate || new Date(),
      serviceType: body.serviceType || 'Air cargo',
      consignor: body.consignor || {},
      consignee: body.consignee || {},
      contentDetails: body.contentDetails || '',
      quantity: body.quantity || 1,
      receiver: body.receiver || '',
      destination: body.destination || {},
      currentLocationText: body.currentLocationText || '',
      createdBy: req.user?._id
    };

    // if body.image provided (from uploads endpoint)
    if (body.image && typeof body.image === 'object' && body.image.url) {
      payload.image = body.image;
    }

    const doc = await Shipment.create(payload);

    // generate QR that points to frontend public view with tracking code
    const qrUrlPath = `${FRONTEND_BASE}/shipments/${encodeURIComponent(doc.trackingCode)}/view`;
    const qrBuffer = await QRCode.toBuffer(qrUrlPath, { type: 'png', scale: 6 });

    const publicIdBase = `shipment_qr_${doc.trackingCode}`;
    const qrRes = await uploadBufferToCloudinary(qrBuffer, publicIdBase);

    doc.qrUrl = qrRes.secure_url;
    doc.barcodeToken = null; // optionally sign token if you want
    await doc.save();

    res.status(201).json({ shipment: doc });
  } catch (err) { next(err); }
}

async function adminListShipments(req, res, next) {
  try {
    const { page = 1, limit = 50, q } = req.query;
    const filter = {};
    if (q) filter.$or = [{ trackingCode: new RegExp(q, 'i') }, { 'consignor.fullName': new RegExp(q,'i') }, { 'consignee.fullName': new RegExp(q,'i') }];
    const skip = (page - 1) * limit;
    const items = await Shipment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit));
    const total = await Shipment.countDocuments(filter);
    res.json({ data: items, pagination: { totalItems: total, currentPage: Number(page), totalPages: Math.ceil(total/limit), limit: Number(limit) } });
  } catch (err) { next(err); }
}

async function adminGetShipment(req, res, next) {
  try {
    const s = await Shipment.findById(req.params.id);
    if (!s) return res.status(404).json({ message: 'Not found' });
    res.json({ shipment: s });
  } catch (err) { next(err); }
}

async function adminUpdateShipment(req, res, next) {
  try {
    const update = req.body || {};
    const set = {};
    const allowed = ['shipmentDate','serviceType','consignor','consignee','contentDetails','quantity','receiver','destination','currentLocationText','image'];
    for (const k of allowed) if (update[k] !== undefined) set[k] = update[k];
    const s = await Shipment.findByIdAndUpdate(req.params.id, { $set: set }, { new: true });
    if (!s) return res.status(404).json({ message: 'Not found' });
    res.json({ shipment: s });
  } catch (err) { next(err); }
}

async function adminDeleteShipment(req, res, next) {
  try {
    await Shipment.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) { next(err); }
}

async function adminAddLocation(req, res, next) {
  try {
    const { lat, lng, note, etaArrival, status } = req.body;
    const point = {
      coords: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
      note: note || '',
      recordedAt: new Date(),
      etaArrival: etaArrival ? new Date(etaArrival) : undefined
    };

    const s = await Shipment.findByIdAndUpdate(req.params.id, {
      $push: { locations: { $each: [point], $position: 0 } }, // newest-first
      $set: {
        lastSeenAt: point.recordedAt,
        currentLocationText: note || undefined,
        ...(status ? { status } : {})
      }
    }, { new: true });

    if (!s) return res.status(404).json({ message: 'Not found' });

    // emit SSE event for this shipment by trackingCode
    try {
      shipmentsEvents.emit(`shipment:${s.trackingCode}`, {
        type: 'location.updated',
        payload: {
          location: point,
          trackingCode: s.trackingCode,
          status: s.status,
          lastSeenAt: s.lastSeenAt
        },
        timestamp: new Date()
      });
    } catch (emitErr) {
      console.warn('emit failed', emitErr?.message || emitErr);
    }

    res.json({ shipment: s });
  } catch (err) { next(err); }
}

// Public lookup by tracking code (no auth)
async function publicLookupByCode(req, res, next) {
  try {
    const code = (req.query.code || req.params.code || '').toUpperCase().trim();
    if (!code) return res.status(400).json({ message: 'tracking code required' });

    const s = await Shipment.findOne({ trackingCode: code }).lean();
    if (!s) return res.status(404).json({ message: 'Shipment not found' });

    // Expose safe/public fields but include _id so frontend can call print by id
    const publicShape = {
      _id: s._id,
      trackingCode: s.trackingCode,
      shipmentDate: s.shipmentDate,
      serviceType: s.serviceType,
      consignor: s.consignor || {},
      consignee: s.consignee || {},
      image: s.image || null,
      contentDetails: s.contentDetails,
      quantity: s.quantity,
      receiver: s.receiver,
      currentLocationText: s.currentLocationText,
      destination: s.destination || {},
      lastSeenAt: s.lastSeenAt,
      locations: (s.locations || []).slice(0, 200),
      qrUrl: s.qrUrl || null
    };

    res.json({ shipment: publicShape });
  } catch (err) { next(err); }
}

// Public scan endpoint: accepts trackingCode (e.g., from barcode scanner) and returns a redirect url or data
async function publicScan(req, res, next) {
  try {
    const code = (req.query.code || req.params.code || '').toUpperCase().trim();
    if (!code) return res.status(400).json({ message: 'code required' });
    const s = await Shipment.findOne({ trackingCode: code }).lean();
    if (!s) return res.status(404).json({ message: 'Shipment not found' });
    // Option A: redirect to frontend view page
    const url = `${FRONTEND_BASE}/shipments/${encodeURIComponent(s.trackingCode)}/view`;
    // If client expects JSON, return both
    return res.json({ url, shipment: s });
  } catch (err) { next(err); }
}

async function sseStreamForCode(req, res, next) {
  try {
    const code = (req.params.code || '').toUpperCase().trim();
    if (!code) return res.status(400).json({ message: 'code is required' });

    // headers for SSE
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    res.flushHeaders?.();

    // send a ping / initial comment to keep connection alive
    res.write(`:ok\n\n`);

    // listener function
    const handler = (event) => {
      try {
        // only send events for this code (we subscribe per-channel)
        res.write(`event: ${event.type}\n`);
        const data = JSON.stringify(event);
        // SSE data lines must be prefixed by "data: "
        data.split(/\n/).forEach(line => res.write(`data: ${line}\n`));
        res.write('\n');
      } catch (e) {
        console.warn('sse write error', e?.message || e);
      }
    };

    // when emitter emits for `shipment:<code>` we call handler
    const eventName = `shipment:${code}`;
    shipmentsEvents.on(eventName, handler);

    // on close remove listener
    req.on('close', () => {
      shipmentsEvents.off(eventName, handler);
      try { res.end(); } catch (e) {}
    });
  } catch (err) { next(err); }
}

async function fetchBufferFromUrl(url) {
  if (!url) return null;
  try {
    const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 10_000 });
    return Buffer.from(resp.data);
  } catch (err) {
    console.warn('fetchBufferFromUrl failed', err?.message || err);
    return null;
  }
}

// Print / download PDF endpoint (streams PDF)
async function printShipmentPdf(req, res, next) {
  try {
    const s = await Shipment.findById(req.params.id).lean();
    if (!s) return res.status(404).json({ message: 'Shipment not found' });

    // fetch image buffers (image + qr) to include in PDF
    const [imgBuf, qrBuf] = await Promise.all([
      fetchBufferFromUrl(s.image?.url),
      fetchBufferFromUrl(s.qrUrl)
    ]);

    // We changed renderShipmentPdfBuffer signature to accept buffers
    const pdfBuffer = await renderShipmentPdfBuffer(s, { imageBuffer: imgBuf, qrBuffer: qrBuf });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="shipment_${s.trackingCode}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
}

module.exports = {
  adminCreateShipment,
  adminListShipments,
  adminGetShipment,
  adminUpdateShipment,
  adminDeleteShipment,
  adminAddLocation,
  sseStreamForCode,
  publicLookupByCode,
  publicScan,
  printShipmentPdf
};
