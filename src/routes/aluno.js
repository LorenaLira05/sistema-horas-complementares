const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const alunoController = require('../controllers/alunoController');
const uploadController = require('../controllers/uploadController');

router.get('/teste', (req, res) => res.json({ msg: "Rota Aluno funcionando!" }));
router.post('/submissao',authMiddleware(['ALUNO']), uploadController.upload.single('arquivo'), alunoController.postSubmeterAtividade);          
router.put('/submissao/:id', authMiddleware(['ALUNO']), alunoController.putEditarSubmissao);      
router.get('/submissoes', authMiddleware(['ALUNO']), alunoController.getMinhasSubmissoes);
router.delete('/submissao/:id', authMiddleware(['ALUNO']), alunoController.deleteSubmissao);


module.exports = router; 