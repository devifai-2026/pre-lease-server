const express = require("express");

const router = express.Router();

const user = require("./user");
const property = require("./property");
const admin = require("./admin");

router.use(user);
router.use(property);
router.use(admin);

module.exports = router;
