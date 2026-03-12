const express = require('express');
const router = express.Router();
const { chat } = require('../controllers/chat');
const { requireAuthUser } = require('../middleware/auth');

router.post('/', requireAuthUser, chat);

module.exports = router;
