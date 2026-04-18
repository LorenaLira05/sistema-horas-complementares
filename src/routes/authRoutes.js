const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

router.post('/login', authController.login);
router.post('/setup', authController.setup);
router.post('/trocar-senha', authMiddleware(['student', 'coordinator', 'super_admin']), authController.trocarSenha);

module.exports = router;