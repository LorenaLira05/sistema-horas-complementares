const pool = require('../config/database');

exports.getDashboardCoordenador = async (req, res) => {
    const user_id = req.usuario.id;

    try {
        const cursosDoCoordenador = await pool.query(
            `SELECT course_id FROM course_coordinators
             WHERE user_id = $1 AND is_active = true`,
            [user_id]
        );

        const course_ids = cursosDoCoordenador.rows.map(r => r.course_id);

        if (course_ids.length === 0) {
            return res.status(200).json({
                metricas: { pendentes: 0, aprovadas: 0, reprovadas: 0, media_horas: 0 },
                total_alunos: 0,
                total_cursos: 0,
                por_categoria: [],
                cursos_mais_envios: [],
                ultimas_atividades: []
            });
        }

        const metricas = await pool.query(
            `SELECT
                COUNT(*) FILTER (WHERE s.status = 'submitted') AS pendentes,
                COUNT(*) FILTER (WHERE s.status = 'approved') AS aprovadas,
                COUNT(*) FILTER (WHERE s.status = 'rejected') AS reprovadas,
                ROUND(COALESCE(AVG(s.approved_hours) FILTER (WHERE s.status = 'approved'), 0), 1) AS media_horas
             FROM submissions s
             JOIN user_courses uc ON uc.id = s.user_course_id
             WHERE uc.course_id = ANY($1)`,
            [course_ids]
        );

        const alunos = await pool.query(
            `SELECT COUNT(DISTINCT uc.user_id) AS total_alunos
             FROM user_courses uc
             JOIN user_roles ur ON ur.user_id = uc.user_id
             JOIN roles r ON r.id = ur.role_id
             WHERE uc.course_id = ANY($1)
             AND r.name = 'student'
             AND uc.is_active = true`,
            [course_ids]
        );

        const totalCursos = course_ids.length;

        const porCategoria = await pool.query(
            `SELECT
                cat.name AS categoria,
                COUNT(*) AS total
             FROM submissions s
             JOIN user_courses uc ON uc.id = s.user_course_id
             JOIN categories cat ON cat.id = s.category_id
             WHERE uc.course_id = ANY($1)
             GROUP BY cat.name
             ORDER BY total DESC`,
            [course_ids]
        );

        const cursosMaisEnvios = await pool.query(
            `SELECT
                c.name AS nome_curso,
                COUNT(*) AS total_envios
             FROM submissions s
             JOIN user_courses uc ON uc.id = s.user_course_id
             JOIN courses c ON c.id = uc.course_id
             WHERE uc.course_id = ANY($1)
             GROUP BY c.name
             ORDER BY total_envios DESC
             LIMIT 5`,
            [course_ids]
        );

        const ultimasAtividades = await pool.query(
            `SELECT
                s.id,
                s.title,
                s.status,
                s.submitted_at,
                u.full_name AS nome_aluno,
                cat.name AS categoria
             FROM submissions s
             JOIN user_courses uc ON uc.id = s.user_course_id
             JOIN users u ON u.id = uc.user_id
             JOIN categories cat ON cat.id = s.category_id
             WHERE uc.course_id = ANY($1)
             ORDER BY s.submitted_at DESC
             LIMIT 5`,
            [course_ids]
        );

        res.status(200).json({
            metricas: metricas.rows[0],
            total_alunos: parseInt(alunos.rows[0].total_alunos),
            total_cursos: totalCursos,
            por_categoria: porCategoria.rows,
            cursos_mais_envios: cursosMaisEnvios.rows,
            ultimas_atividades: ultimasAtividades.rows
        });

    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};