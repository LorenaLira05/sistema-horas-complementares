const express = require('express');
const router = express.Router();
const coordenadorController = require('../controllers/coordenadorController');
const authMiddleware = require('../middleware/auth');

router.get('/teste', (req, res) => res.json({ msg: "Rota Coordenador funcionando!" }));

router.post('/regras', authMiddleware(['COORDENADOR']), coordenadorController.postCriarRegra);
router.get('/regras/:curso_id', authMiddleware(['COORDENADOR', 'ALUNO']), coordenadorController.getRegrasPorCurso);
router.put('/regras/:id', authMiddleware(['COORDENADOR']), coordenadorController.putAtualizarRegra);   

// cadastrar Aluno
router.post('/aluno', authMiddleware(['COORDENADOR']), coordenadorController.postCadastrarAluno);

//ver Alunos (passando o ID do curso na URL)
router.get('/alunos/:curso_id', authMiddleware(['COORDENADOR']), coordenadorController.getAlunosDoCurso);
router.put('/aluno/:id', authMiddleware(['COORDENADOR']), coordenadorController.putAtualizarAluno);         

// ver Submissões Pendentes
router.get('/submissoes/:curso_id', authMiddleware(['COORDENADOR']), coordenadorController.getSubmissoesPendentes);

// validar Submissão
router.patch('/validar/:id', authMiddleware(['COORDENADOR']), coordenadorController.patchValidarSubmissao);

module.exports = router;
