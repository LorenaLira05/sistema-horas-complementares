const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const alunoController = require('../controllers/alunoController');
const uploadController = require('../controllers/uploadController');

router.get('/teste', (req, res) => res.json({ msg: 'Rota Aluno funcionando!' }));

// criação de submissão com múltiplos arquivos em um único request
router.post(
    '/submissao',
    authMiddleware(['student']),
    uploadController.upload.array('certificados', 10),
    alunoController.postSubmeterAtividade
);

router.put('/submissao/:id', authMiddleware(['student']), alunoController.putEditarSubmissao);
router.delete('/submissao/:id', authMiddleware(['student']), alunoController.deleteSubmissao);
router.get('/submissoes', authMiddleware(['student', 'coordinator']), alunoController.getMinhasSubmissoes);
router.get('/resumo-horas/:course_id', authMiddleware(['student', 'coordinator']), alunoController.getResumoHoras);
router.get('/meus-dados', authMiddleware(['student', 'coordinator']), alunoController.getMeusDados);

// permite anexar arquivos adicionais a uma submissão que já tem
router.post('/submissao/:submission_id/arquivo', authMiddleware(['student']), uploadController.uploadCertificado);
router.get('/submissao/:submission_id/arquivo', authMiddleware(['student']), uploadController.getCertificado);

module.exports = router;
