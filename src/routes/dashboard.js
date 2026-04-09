const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const dashboardController = require('../controllers/dashboardController');

router.get('/coordenador', authMiddleware(['COORDENADOR']), dashboardController.getDashboardCoordenador);

module.exports = router;