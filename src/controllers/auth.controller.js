// src/controllers/auth.controller.js
const User = require("../models/user.model");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

exports.register = async (req, res, next) => {
  try {
    const { name, email, password, phone, role } = req.body;

    // Check if user exists
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "Email already in use" });

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Only allow role=admin if creating via seed or admin interface
    const newUser = await User.create({
      name,
      email,
      passwordHash,
      phone,
      role: role === "admin" ? "admin" : "user",
    });

    res.status(201).json({ message: "User registered", userId: newUser._id });
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "1h" }
    );

    res.json({ token, role: user.role });
  } catch (err) {
    next(err);
  }
};

exports.me = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).select("-passwordHash");
    res.json(user);
  } catch (err) {
    next(err);
  }
};
