// ...user model...
const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({
name: String,
email: { type: String, unique: true, index: true },
passwordHash: String,
phone: String,
role: { type: String, enum: ['user','admin'], default: 'user' },
createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('User', userSchema);
