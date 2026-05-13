const Joi = require("joi");

exports.validateBody =
  (schema, source = "body") =>
  (req, res, next) => {
    const data =
      source === "body"
        ? req.body
        : source === "query"
          ? req.query
          : req.params;

    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      const msg = error.details.map((d) => d.message).join("; ");
      return res.status(400).json({ success: false, message: msg });
    }
    if (source === "body") {
      req.validatedBody = value;
    } else if (source === "query") {
      req.validatedQuery = value;
      Object.assign(req.query, value);
    } else {
      req.validatedParams = value;
      Object.assign(req.params, value);
    }
    next();
  };
