const pool = require('../config/database');

exports.getRelatorios = async (req, res) => {
    const user_id = req.usuario.id;

    try {
        // Busca os cursos do coordenador
        const cursosDoCoordenador = await pool.query(
            `SELECT course_id FROM course_coordinators
             WHERE user_id = $1 AND is_active = true`,
            [user_id]
        );

        const course_ids = cursosDoCoordenador.rows.map(r => r.course_id);

        if (course_ids.length === 0) {
            return res.status(200).json({
                total_horas: 0,
                eficiencia: { total: 0, aprovadas: 0, eficiencia_percentual: 0 },
                horas_mensais: [],
                eficiencia_por_curso: [],
                log_atividades: [],
                avaliacao_alunos: []
            });
        }

        // Total de horas aprovadas
        const horasProcessadas = await pool.query(
            `SELECT COALESCE(SUM(s.approved_hours), 0) AS total_horas
             FROM submissions s
             JOIN user_courses uc ON uc.id = s.user_course_id
             WHERE s.status = 'approved'
             AND uc.course_id = ANY($1)`,
            [course_ids]
        );

        // Eficiência geral (% de aprovações)
        const eficiencia = await pool.query(
            `SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE s.status = 'approved') AS aprovadas,
                CASE
                    WHEN COUNT(*) > 0
                    THEN ROUND((COUNT(*) FILTER (WHERE s.status = 'approved')::numeric / COUNT(*)) * 100, 1)
                    ELSE 0
                END AS eficiencia_percentual
             FROM submissions s
             JOIN user_courses uc ON uc.id = s.user_course_id
             WHERE uc.course_id = ANY($1)`,
            [course_ids]
        );

        // Horas aprovadas por mês — usa validated_at da tabela validations
        const horasMensais = await pool.query(
            `SELECT
                TO_CHAR(v.validated_at, 'Mon/YY') AS mes,
                COALESCE(SUM(v.approved_hours), 0) AS horas
             FROM validations v
             JOIN submissions s ON s.id = v.submission_id
             JOIN user_courses uc ON uc.id = s.user_course_id
             WHERE uc.course_id = ANY($1)
             AND v.validation_status = 'approved'
             AND v.validated_at >= NOW() - INTERVAL '6 months'
             GROUP BY TO_CHAR(v.validated_at, 'Mon/YY'), DATE_TRUNC('month', v.validated_at)
             ORDER BY DATE_TRUNC('month', v.validated_at)`,
            [course_ids]
        );

        // Eficiência por curso
        const eficienciaPorCurso = await pool.query(
            `SELECT
                c.name AS nome_curso,
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE s.status = 'approved') AS aprovadas,
                CASE
                    WHEN COUNT(*) > 0
                    THEN ROUND((COUNT(*) FILTER (WHERE s.status = 'approved')::numeric / COUNT(*)) * 100, 1)
                    ELSE 0
                END AS eficiencia
             FROM submissions s
             JOIN user_courses uc ON uc.id = s.user_course_id
             JOIN courses c ON c.id = uc.course_id
             WHERE uc.course_id = ANY($1)
             GROUP BY c.name
             ORDER BY eficiencia DESC`,
            [course_ids]
        );

        // Log de atividades recentes
        const logAtividades = await pool.query(
            `SELECT
                s.id,
                s.title,
                s.status,
                s.submitted_at,
                s.approved_hours,
                u.full_name AS nome_aluno,
                cat.name AS categoria,
                v.comment AS feedback,
                v.validated_at AS data_validacao
             FROM submissions s
             JOIN user_courses uc ON uc.id = s.user_course_id
             JOIN users u ON u.id = uc.user_id
             JOIN categories cat ON cat.id = s.category_id
             LEFT JOIN LATERAL (
                SELECT comment, validated_at
                FROM validations
                WHERE submission_id = s.id
                ORDER BY validated_at DESC
                LIMIT 1
             ) v ON true
             WHERE uc.course_id = ANY($1)
             ORDER BY s.submitted_at DESC
             LIMIT 10`,
            [course_ids]
        );

        // Avaliação dos alunos
        const avaliacaoAlunos = await pool.query(
            `SELECT
                u.full_name AS nome,
                u.email,
                COUNT(s.id) AS total_submissoes,
                COALESCE(SUM(s.approved_hours) FILTER (WHERE s.status = 'approved'), 0) AS horas_acumuladas,
                COUNT(s.id) FILTER (WHERE s.status = 'submitted') AS pendentes
             FROM user_courses uc
             JOIN users u ON u.id = uc.user_id
             JOIN user_roles ur ON ur.user_id = u.id
             JOIN roles r ON r.id = ur.role_id
             LEFT JOIN submissions s ON s.user_course_id = uc.id
             WHERE uc.course_id = ANY($1)
             AND r.name = 'student'
             AND uc.is_active = true
             GROUP BY u.id, u.full_name, u.email
             ORDER BY horas_acumuladas DESC`,
            [course_ids]
        );

        res.status(200).json({
            total_horas: horasProcessadas.rows[0].total_horas,
            eficiencia: eficiencia.rows[0],
            horas_mensais: horasMensais.rows,
            eficiencia_por_curso: eficienciaPorCurso.rows,
            log_atividades: logAtividades.rows,
            avaliacao_alunos: avaliacaoAlunos.rows
        });

    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};