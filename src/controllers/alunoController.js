const pool = require('../config/database');
const registrarLog = require('../utils/logger');
const { emailNovaSubmissao } = require('../services/emailService');


exports.postSubmeterAtividade = async (req, res) => {
    const {
        course_id,
        category_id,
        title,
        description,
        institution_name,
        certificate_number,
        organizer_name,
        requested_hours,
        activity_date
    } = req.body;

    const user_id = req.usuario.id; // vem do token
    const arquivo = req.file;

    try {
        const userCourse = await pool.query(
            `SELECT id FROM user_courses
             WHERE user_id = $1 AND course_id = $2 AND is_active = true`,
            [user_id, course_id]
        );

        if (userCourse.rows.length === 0) {
            return res.status(403).json({
                erro: "Você não está matriculado neste curso."
            });
        }

        const user_course_id = userCourse.rows[0].id;
        const regra = await pool.query(
            `SELECT * FROM course_activity_rules
             WHERE course_id = $1 AND category_id = $2`,
            [course_id, category_id]
        );

        if (regra.rows.length === 0) {
            return res.status(404).json({
                erro: "Categoria não permitida para este curso."
            });
        }

        const resultado = await pool.query(
            `INSERT INTO submissions
             (user_course_id, category_id, title, description,
              institution_name, certificate_number, organizer_name,
              requested_hours, activity_date, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'submitted')
             RETURNING *`,
            [
                user_course_id,
                category_id,
                title,
                description,
                institution_name,
                certificate_number,
                organizer_name,
                requested_hours,
                activity_date
            ]
        );

        const submissao = resultado.rows[0];

        if (arquivo) {
            await pool.query(
                `INSERT INTO submission_files
                 (submission_id, original_filename, storage_path, file_type, mime_type, file_size_kb)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    submissao.id,
                    arquivo.originalname,
                    arquivo.path,
                    'pdf',
                    arquivo.mimetype,
                    Math.round(arquivo.size / 1024)
                ]
            );
        }

        const coordenadores = await pool.query(
            `SELECT u.id, u.email, u.full_name
            FROM course_coordinators cc
            JOIN users u ON u.id = cc.user_id
            WHERE cc.course_id = $1 AND cc.is_active = true`,
            [course_id]
         );

        for (const coord of coordenadores.rows) {
            await emailNovaSubmissao(coord.email, title);

           await pool.query(
                `INSERT INTO notifications (user_id, submission_id, type, title, message)
                VALUES ($1, $2, 'submission_created', $3, $4)`,
                [
                    coord.id,  
                    submissao.id,
                    `Nova submissão: ${title}`,
                    `O aluno submeteu uma nova atividade para avaliação.`
                ]
            );
        }

        await registrarLog(req.usuario.id, 'CRIAR_SUBMISSAO', 'submissions', submissao.id, { title, course_id, category_id });

        res.status(201).json({
            mensagem: "Atividade submetida com sucesso!",
            submissao
        });

    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};

exports.putEditarSubmissao = async (req, res) => {
    const { id } = req.params;
    const { title, description, requested_hours, activity_date } = req.body;
    const user_id = req.usuario.id;

    try {
        const submissao = await pool.query(
            `SELECT s.*
             FROM submissions s
             JOIN user_courses uc ON uc.id = s.user_course_id
             WHERE s.id = $1 AND uc.user_id = $2`,
            [id, user_id]
        );

        if (submissao.rows.length === 0) {
            return res.status(404).json({ erro: "Submissão não encontrada." });
        }

        const statusEditaveis = ['submitted', 'returned_for_adjustment'];
        if (!statusEditaveis.includes(submissao.rows[0].status)) {
            return res.status(400).json({
                erro: "Só é possível editar submissões pendentes ou devolvidas para ajuste."
            });
        }

        const resultado = await pool.query(
            `UPDATE submissions
             SET title = $1,
                 description = $2,
                 requested_hours = $3,
                 activity_date = $4,
                 updated_at = NOW()
             WHERE id = $5
             RETURNING *`,
            [title, description, requested_hours, activity_date, id]
        );

        await registrarLog(req.usuario.id, 'EDITAR_SUBMISSAO', 'submissions', id, { title });
        res.status(200).json({ mensagem: "Submissão atualizada!", submissao: resultado.rows[0] });

    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};

exports.deleteSubmissao = async (req, res) => {
    const { id } = req.params;
    const user_id = req.usuario.id;

    try {
        const submissao = await pool.query(
            `SELECT s.*
             FROM submissions s
             JOIN user_courses uc ON uc.id = s.user_course_id
             WHERE s.id = $1 AND uc.user_id = $2`,
            [id, user_id]
        );

        if (submissao.rows.length === 0) {
            return res.status(404).json({ erro: "Submissão não encontrada." });
        }

        if (submissao.rows[0].status !== 'submitted') {
            return res.status(400).json({
                erro: "Só é possível deletar submissões ainda não avaliadas."
            });
        }

        await pool.query(`DELETE FROM submissions WHERE id = $1`, [id]);

        await registrarLog(req.usuario.id, 'DELETAR_SUBMISSAO', 'submissions', id, {});
        res.status(200).json({ mensagem: "Submissão deletada com sucesso!" });

    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};

exports.getMinhasSubmissoes = async (req, res) => {
    const user_id = req.usuario.id;
    const { status, course_id } = req.query;

    try {
        let params = [user_id];
        let filtros = '';

        if (status) {
            filtros += ` AND s.status = $${params.length + 1}::submission_status_enum`;
            params.push(status);
        }

        if (course_id) {
            filtros += ` AND uc.course_id = $${params.length + 1}`;
            params.push(course_id);
        }

        const resultado = await pool.query(
            `SELECT
                s.*,
                c.name AS course_name,
                cat.name AS category_name,
                sf.original_filename,
                sf.storage_path,
                sf.ocr_confidence
             FROM submissions s
             JOIN user_courses uc ON uc.id = s.user_course_id
             JOIN courses c ON c.id = uc.course_id
             JOIN categories cat ON cat.id = s.category_id
             LEFT JOIN submission_files sf ON sf.submission_id = s.id
             WHERE uc.user_id = $1
             ${filtros}
             ORDER BY s.submitted_at DESC`,
            params
        );

        res.status(200).json(resultado.rows);

    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};

exports.getResumoHoras = async (req, res) => {
    const user_id = req.usuario.id;
      const { course_id } = req.params;
     try {
        const userCourse = await pool.query(
            `SELECT uc.course_id, c.name as course_name, c.minimum_required_hours
             FROM user_courses uc
             JOIN courses c ON c.id = uc.course_id
             WHERE uc.user_id = $1 AND uc.course_id = $2 AND uc.is_active = true`,
            [user_id, course_id]
        );

        if (userCourse.rows.length === 0) {
            return res.status(404).json({ erro: "Aluno não matriculado neste curso." });
        }

        const { course_name, minimum_required_hours } = userCourse.rows[0];

        // 2. Pegar as regras (limites por categoria)
        const regras = await pool.query(
            `SELECT car.*, cat.name as category_name
             FROM course_activity_rules car
             JOIN categories cat ON cat.id = car.category_id
             WHERE car.course_id = $1`,
            [course_id]
        );

        // 3. Pegar as horas aprovadas por categoria
        const aprovadas = await pool.query(
            `SELECT s.category_id, SUM(s.approved_hours) as total_aprovado
             FROM submissions s
             JOIN user_courses uc ON uc.id = s.user_course_id
             WHERE uc.user_id = $1 AND uc.course_id = $2 AND s.status = 'approved'
             GROUP BY s.category_id`,
            [user_id, course_id]
        );

        // 4. Pegar as horas em análise (pendentes)
        const emAnalise = await pool.query(
            `SELECT SUM(s.requested_hours) as total_pendente
             FROM submissions s
             JOIN user_courses uc ON uc.id = s.user_course_id
             WHERE uc.user_id = $1 AND uc.course_id = $2 AND s.status NOT IN ('approved', 'rejected')`,
            [user_id, course_id]
        );

        // Mapear aprovadas para fácil acesso
        const aprovadasMap = {};
        aprovadas.rows.forEach(r => {
            aprovadasMap[r.category_id] = parseFloat(r.total_aprovado) || 0;
        });

        // Montar o resumo por categoria
        const limites = regras.rows.map(regra => {
            const horasAprovadas = aprovadasMap[regra.category_id] || 0;
            return {
                categoria: regra.category_name,
                min_horas: regra.min_hours,
                max_horas: regra.max_hours,
                horas_aprovadas: horasAprovadas,
                percentual: Math.min(100, (horasAprovadas / regra.max_hours) * 100)
            };
        });

        const totalIntegralizado = Object.values(aprovadasMap).reduce((a, b) => a + b, 0);

        res.status(200).json({
            curso: userCourse.rows[0].course_name,
            total_obrigatorio: minimum_required_hours,
            total_integralizado: totalIntegralizado,
            total_em_analise: emAnalise.rows[0].total_pendente || 0,
            percentual_total: Math.min(100, (totalIntegralizado / minimum_required_hours) * 100),
            limites: limites
        });

    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};

exports.getMeusDados = async (req, res) => {
    const user_id = req.usuario.id;
    try {
        const aluno = await pool.query(
            `SELECT u.full_name as nome, u.email
             FROM users u
             WHERE u.id = $1`,
            [user_id]
        );

        const cursos = await pool.query(
            `SELECT c.id, c.name
             FROM user_courses uc
             JOIN courses c ON c.id = uc.course_id
             WHERE uc.user_id = $1 AND uc.is_active = true
             ORDER BY c.name`,
            [user_id]
        );

        const stats = await pool.query(
            `SELECT 
                COUNT(*) as total_submissoes,
                COUNT(*) FILTER (WHERE status NOT IN ('approved', 'rejected')) as pendentes,
                SUM(approved_hours) as horas_aprovadas
             FROM submissions s
             JOIN user_courses uc ON uc.id = s.user_course_id
             WHERE uc.user_id = $1`,
            [user_id]
        );

        res.status(200).json({
            aluno: aluno.rows[0],
            cursos: cursos.rows, // <-- estava faltando no response
            total_submissoes: parseInt(stats.rows[0].total_submissoes) || 0,
            pendentes: parseInt(stats.rows[0].pendentes) || 0,
            horas_aprovadas: parseFloat(stats.rows[0].horas_aprovadas) || 0
        });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};