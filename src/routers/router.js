const express = require("express");

const router = express.Router();

const user = require("./user");
const property = require("./property");
const admin = require("./admin");
const inquiry = require("./inquiry");

router.use(user);
router.use(property);
router.use("/admin", admin);
router.use(inquiry);

module.exports = router;
