const express = require("express");

const router = express.Router();

const user = require("./user");
const property = require("./property");
const admin = require("./admin");
const inquiry = require("./inquiry");
const rolePermission = require("./rolePermission");
const analytics = require("./analytics");

router.use(user);
router.use(property);
router.use("/admin", admin);
router.use("/admin", analytics);
router.use(inquiry);
router.use(rolePermission);

module.exports = router;
