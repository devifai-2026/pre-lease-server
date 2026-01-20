const express = require("express");

const router = express.Router();

const user = require("./user");
const property = require("./property");

router.use(user);
router.use(property);

module.exports = router;
