const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const adminController = require('../controllers/adminController'); 

// para ver os cursos, precisa ser SUPER_ADMIN
router.get('/cursos', authMiddleware(['SUPER_ADMIN']), adminController.getListaCursos);
router.post('/coordenador', authMiddleware(['SUPER_ADMIN']), adminController.postCadastrarCoordenador);
router.put('/curso/:id', authMiddleware(['SUPER_ADMIN']), adminController.putAtualizarCurso);           

router.post('/curso', authMiddleware(['SUPER_ADMIN']), adminController.postCriarCurso);
router.get('/coordenadores', authMiddleware(['SUPER_ADMIN']), adminController.getListaCoordenadores);
router.put('/coordenador/:id', authMiddleware(['SUPER_ADMIN']), adminController.putAtualizarCoordenador);

module.exports = router;
