// src/middlewares/validate.middleware.js
module.exports = (schema) => {
  return (req, res, next) => {
    const data = {};
    if (schema.body) data.body = req.body;
    if (schema.query) data.query = req.query;
    if (schema.params) data.params = req.params;
    const { error } = schema.validate(data, { abortEarly: false, allowUnknown: true });
    if (error) {
      const details = error.details.map(d => ({ message: d.message, path: d.path }));
      return res.status(400).json({ message: 'Validation error', details });
    }
    return next();
  };
};
