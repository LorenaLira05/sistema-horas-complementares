const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const alunoController = require('../controllers/alunoController');

router.get('/teste', (req, res) => res.json({ msg: "Rota Aluno funcionando!" }));

router.post('/submissao', authMiddleware(['ALUNO']), alunoController.postSubmeterAtividade);   
router.get('/submissoes', authMiddleware(['ALUNO']), alunoController.getMinhasSubmissoes);         
router.put('/submissao/:id', authMiddleware(['ALUNO']), alunoController.putEditarSubmissao);      

router.delete('/submissao/:id', authMiddleware(['ALUNO']), alunoController.deleteSubmissao);

module.exports = router; 