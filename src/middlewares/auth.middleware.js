// src/middlewares/auth.middleware.js
const jwt = require('jsonwebtoken');

/**
 * Authenticate requests using Authorization: Bearer <token>
 * - rejects headers with control characters (CR/LF)
 * - accepts 'Bearer' case-insensitively
 * - strips surrounding quotes around token if present
 */
exports.authenticate = (req, res, next) => {
  try {
    const authHeader = req.get('Authorization') || req.get('authorization');
    if (!authHeader) {
      return res.status(401).json({ message: 'No Authorization header provided' });
    }

    // If header contains CR or LF, it's invalid for HTTP headers and often triggers
    // "Invalid character in header content" errors in Node. Reject early.
    if (/\r|\n/.test(authHeader)) {
      return res.status(400).json({ message: 'Invalid characters in Authorization header' });
    }

    // Expect "Bearer <token>"
    const match = authHeader.match(/^\s*Bearer\s+(.+)\s*$/i);
    if (!match) {
      return res.status(401).json({ message: "Malformed Authorization header. Use: 'Authorization: Bearer <token>'" });
    }

    // Extract token and remove surrounding quotes if user accidentally added them
    let token = match[1].trim();
    token = token.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');

    if (!token) {
      return res.status(401).json({ message: 'Empty token' });
    }

    // Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Attach decoded payload (e.g., { userId, role }) to req.user
    req.user = decoded;
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    // unknown error -> forward to error handler
    return next(err);
  }
};
