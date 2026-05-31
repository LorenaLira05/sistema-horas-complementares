const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const dashboardController = require('../controllers/dashboardController');
const relatoriosController = require('../controllers/relatoriosController');

router.get('/coordenador', authMiddleware(['coordinator', 'super_admin']), dashboardController.getDashboardCoordenador);
router.get('/relatorios', authMiddleware(['coordinator', 'super_admin']), relatoriosController.getRelatorios);
router.post('/insights/atualizar/:course_id', authMiddleware(['coordinator', 'super_admin']), dashboardController.postAtualizarInsightSobDemanda);

module.exports = router;