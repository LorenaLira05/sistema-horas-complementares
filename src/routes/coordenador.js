const express = require('express');
const router = express.Router();
const coordenadorController = require('../controllers/coordenadorController');
const authMiddleware = require('../middleware/auth');


router.get('/teste', (req, res) => res.json({ msg: "Rota Coordenador funcionando!" }));
router.post('/categoria', authMiddleware(['coordinator', 'super_admin']), coordenadorController.postCriarCategoria);
router.get('/categorias', authMiddleware(['coordinator', 'super_admin', 'student']), coordenadorController.getListaCategorias);
router.post('/regras', authMiddleware(['coordinator', 'super_admin']), coordenadorController.postCriarRegra);
router.get('/regras/todas', authMiddleware(['coordinator', 'super_admin']), coordenadorController.getTodasRegras);
router.get('/regras/:course_id', authMiddleware(['coordinator', 'student']), coordenadorController.getRegrasPorCurso);
router.put('/regras/:id', authMiddleware(['coordinator', 'super_admin']), coordenadorController.putAtualizarRegra);
router.delete('/regras/:id', authMiddleware(['coordinator', 'super_admin']), coordenadorController.deleteRegra);
router.post('/aluno', authMiddleware(['coordinator']), coordenadorController.postCadastrarAluno);
router.get('/alunos/:course_id', authMiddleware(['coordinator']), coordenadorController.getAlunosDoCurso);
router.get('/meus-cursos', authMiddleware(['coordinator']), coordenadorController.getMeusCursos);
router.get('/aluno/:id', authMiddleware(['coordinator', 'super_admin']), coordenadorController.getAlunoById);
router.put('/aluno/:id', authMiddleware(['coordinator']), coordenadorController.putAtualizarAluno);
router.patch('/aluno/:id/inativar', authMiddleware(['coordinator', 'super_admin']), coordenadorController.patchInativarAluno);
router.patch('/aluno/:id/status', authMiddleware(['coordinator', 'super_admin']), coordenadorController.patchStatusAluno);
router.delete('/aluno/:id', authMiddleware(['coordinator']), coordenadorController.deleteAluno);
router.get('/submissoes/:course_id', authMiddleware(['coordinator', 'super_admin']), coordenadorController.getSubmissoes);
router.get('/submissao/:id', authMiddleware(['coordinator']), coordenadorController.getSubmissaoPorId);
router.patch('/validar/:id', authMiddleware(['coordinator']), coordenadorController.patchValidarSubmissao);
router.get('/resumo-geral', authMiddleware(['coordinator', 'super_admin']), coordenadorController.getResumoGeral);
module.exports = router;