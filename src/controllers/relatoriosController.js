const pool = require('../config/database');

exports.getRelatorios = async (req, res) => {
    const user_id = parseInt(req.usuario.id);
    const isSuperAdmin =
        req.usuario.perfis &&
        req.usuario.perfis.includes('super_admin');

    try {
        let course_ids = [];

        if (isSuperAdmin) {
            const todosCursos = await pool.query(
                `SELECT id FROM courses WHERE is_active = true`
            );
            course_ids = todosCursos.rows.map(r => r.id);
        } else {
            const cursosDoCoordenador = await pool.query(
                `SELECT course_id
                 FROM course_coordinators
                 WHERE user_id = $1 AND is_active = true`,
                [user_id]
            );
            course_ids = cursosDoCoordenador.rows.map(r => r.course_id);
        }

        if (course_ids.length === 0) {
            return res.status(200).json({
                total_horas: 0,
                eficiencia: { total: 0, aprovadas: 0, eficiencia_percentual: 0, media_horas_aluno: 0 },
                horas_mensais: [],
                eficiencia_por_curso: [],
                log_atividades: [],
                avaliacao_alunos: [],
                insights_detalhados: [],
                resumo_risco_cursos: []
            });
        }

        const relatorioGeral = await pool.query(
            `SELECT
                COALESCE(SUM(s.approved_hours), 0)                            AS total_horas,
                COUNT(s.id)                                                    AS total,
                COUNT(*) FILTER (WHERE s.status = 'approved')                 AS aprovadas,
                ROUND(
                    COUNT(*) FILTER (WHERE s.status = 'approved')::numeric
                    / NULLIF(COUNT(s.id), 0) * 100
                , 1)                                                           AS eficiencia_percentual,
                ROUND(
                    SUM(s.approved_hours) / NULLIF(COUNT(DISTINCT uc.user_id), 0)
                , 1)                                                           AS media_horas_aluno
            FROM submissions s
            JOIN user_courses uc ON uc.id = s.user_course_id
            WHERE uc.course_id = ANY($1)`,
            [course_ids]
        );

        const horasMensais = await pool.query(
            `SELECT
                TO_CHAR(validated_at, 'YYYY-MM') AS mes,
                COALESCE(SUM(approved_hours), 0) AS horas
             FROM validations
             WHERE validation_status = 'approved'
               AND validated_at >= NOW() - INTERVAL '6 months'
               AND submission_id IN (
                    SELECT submission_id
                    FROM view_submissoes_completo
                    WHERE course_id = ANY($1)
               )
             GROUP BY
                TO_CHAR(validated_at, 'YYYY-MM'),
                DATE_TRUNC('month', validated_at)
             ORDER BY DATE_TRUNC('month', validated_at)`,
            [course_ids]
        );

        const eficienciaPorCurso = await pool.query(
            `SELECT
                course_name AS nome_curso,
                total_submissoes AS total,
                total_aprovadas AS aprovadas,
                eficiencia_percentual AS eficiencia
             FROM view_relatorio_geral
             WHERE course_id = ANY($1)
             ORDER BY eficiencia_percentual DESC`,
            [course_ids]
        );

        const logAtividades = await pool.query(
            `SELECT
                submission_id,
                title,
                status,
                submitted_at,
                approved_hours,
                student_name AS nome_aluno,
                category_name AS categoria
             FROM view_submissoes_completo
             WHERE course_id = ANY($1)
             ORDER BY submitted_at DESC
             LIMIT 10`,
            [course_ids]
        );

        const avaliacaoAlunos = await pool.query(
            `SELECT
                full_name AS nome,
                email,
                total_submissoes,
                total_integralizado AS horas_acumuladas
             FROM view_resumo_aluno_por_curso
             WHERE course_id = ANY($1)
             ORDER BY total_integralizado DESC`,
            [course_ids]
        );

        let insightsPipeline = { rows: [] };
        let riscoPorCursoPipeline = { rows: [] };

        try {
            insightsPipeline = await pool.query(
                `SELECT tipo_insight, titulo, descricao, nivel_alerta, valor_numerico
                 FROM insights
                 WHERE (referencia_tipo = 'curso' AND referencia_id = ANY($1))
                    OR (referencia_tipo = 'aluno' AND referencia_id IN (
                        SELECT user_id FROM user_courses WHERE course_id = ANY($1)
                    ))
                 ORDER BY nivel_alerta DESC, tipo_insight`,
                [course_ids]
            );
        } catch (e) {
            console.warn('[Relatórios] Tabela insights não encontrada:', e.message);
        }

        try {
            riscoPorCursoPipeline = await pool.query(
                `SELECT
                    c.name AS nome_curso,
                    cr.nivel_risco,
                    COUNT(*)::int AS total_alunos
                 FROM classificacao_risco cr
                 JOIN courses c ON c.id = cr.curso_id
                 WHERE cr.curso_id = ANY($1)
                 GROUP BY c.name, cr.nivel_risco
                 ORDER BY c.name, cr.nivel_risco`,
                [course_ids]
            );
        } catch (e) {
            console.warn('[Relatórios] Tabela classificacao_risco não encontrada:', e.message);
        }

        const rg = relatorioGeral.rows[0];

        res.status(200).json({
            total_horas: rg.total_horas,
            eficiencia: {
                total:                 rg.total,
                aprovadas:             rg.aprovadas,
                eficiencia_percentual: rg.eficiencia_percentual,
                media_horas_aluno:     parseFloat(rg.media_horas_aluno || 0)
            },
            horas_mensais:       horasMensais.rows,
            eficiencia_por_curso: eficienciaPorCurso.rows,
            log_atividades:      logAtividades.rows,
            avaliacao_alunos:    avaliacaoAlunos.rows,
            insights_detalhados: insightsPipeline.rows,
            resumo_risco_cursos: riscoPorCursoPipeline.rows
        });

    } catch (err) {
        console.error('Erro Relatórios:', err);
        res.status(500).json({ erro: err.message });
    }
};