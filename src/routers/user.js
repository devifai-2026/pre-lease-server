const express = require("express");
const userrouter = express.Router();
const { signup, login } = require("../controllers/user");

userrouter.post("/signup", (req, res, next) => signup(req, res, next));
userrouter.post("/login", (req, res, next) => login(req, res, next));
module.exports = userrouter;
