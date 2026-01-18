const express = require('express');
const userrouter = express.Router();
const { signup } = require('../controllers/user');

userrouter.post('/signup', (req, res, next) => signup(req, res, next));
module.exports = userrouter;
