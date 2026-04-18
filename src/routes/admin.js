const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const adminController = require('../controllers/adminController');

router.get('/cursos', authMiddleware(['super_admin']), adminController.getListaCursos);
router.post('/curso', authMiddleware(['super_admin']), adminController.postCriarCurso);
router.put('/curso/:id', authMiddleware(['super_admin']), adminController.putAtualizarCurso);
router.delete('/curso/:id', authMiddleware(['super_admin']), adminController.deleteCurso);

router.get('/coordenadores', authMiddleware(['super_admin']), adminController.getListaCoordenadores);
router.post('/coordenador', authMiddleware(['super_admin']), adminController.postCadastrarCoordenador);
router.put('/coordenador/:id', authMiddleware(['super_admin']), adminController.putAtualizarCoordenador);
router.delete('/coordenador/:id', authMiddleware(['super_admin']), adminController.deleteCoordenador);

module.exports = router;