const express = require("express");

const router = express.Router();

const user = require("./user");
const property = require("./property");
const admin = require("./admin");
const inquiry = require("./inquiry");
const rolePermission = require("./rolePermission");
const analytics = require("./analytics");
const brokers = require("./brokers");
const calculator = require("./calculator");
const blog = require("./blog");
const supportRequest = require("./supportRequest");
const contactLead = require("./contactLead");

router.use(user);
router.use(property);
router.use(brokers);
router.use("/admin", admin);
router.use("/admin", analytics);
router.use(inquiry);
router.use(rolePermission);
router.use(calculator);
router.use(blog);
router.use(supportRequest);
router.use(contactLead);

module.exports = router;
