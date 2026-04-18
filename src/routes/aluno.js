const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const alunoController = require('../controllers/alunoController');
const uploadController = require('../controllers/uploadController');

router.get('/teste', (req, res) => res.json({ msg: "Rota Aluno funcionando!" }));

router.post('/submissao', authMiddleware(['student']), alunoController.postSubmeterAtividade);
router.put('/submissao/:id', authMiddleware(['student']), alunoController.putEditarSubmissao);
router.delete('/submissao/:id', authMiddleware(['student']), alunoController.deleteSubmissao);
router.get('/submissoes', authMiddleware(['student']), alunoController.getMinhasSubmissoes);

// Upload separado — permite anexar/atualizar arquivo independente da submissão
router.post('/submissao/:submission_id/arquivo', authMiddleware(['student']), uploadController.uploadCertificado);
router.get('/submissao/:submission_id/arquivo', authMiddleware(['student']), uploadController.getCertificado);

module.exports = router;