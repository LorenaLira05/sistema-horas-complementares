const pool = require('../config/database');

exports.getDashboardCoordenador = async (req, res) => {
    const user_id = parseInt(req.usuario.id);
    const isSuperAdmin =
        req.usuario.perfis &&
        req.usuario.perfis.includes('super_admin');

    try {
        let course_ids = [];

        if (isSuperAdmin) {
            const todosCursos = await pool.query(
                `SELECT id
                 FROM courses
                 WHERE is_active = true`
            );
            course_ids = todosCursos.rows.map(r => r.id);
        } else {
            const cursosDoCoordenador = await pool.query(
                `SELECT course_id
                 FROM course_coordinators
                 WHERE user_id = $1
                   AND is_active = true`,
                [user_id]
            );
            course_ids = cursosDoCoordenador.rows.map(r => r.course_id);
        }

        // Se o coordenador não gerencia nenhum curso, retorna estrutura analítica zerada
        if (course_ids.length === 0) {
            return res.status(200).json({
                metricas: { pendentes: 0, aprovadas: 0, reprovadas: 0, media_horas: 0 },
                total_alunos: 0,
                total_cursos: 0,
                por_categoria: [],
                cursos_mais_envios: [],
                ultimas_atividades: [],
                insights: [],
                recomendacoes: [],
                resumoRisco: []
            });
        }

        const metricas = await pool.query(
            `SELECT
                SUM(pendentes) AS pendentes,
                SUM(aprovadas) AS aprovadas,
                SUM(reprovadas) AS reprovadas,
                ROUND(AVG(media_horas), 1) AS media_horas
             FROM view_dashboard_coordenador
             WHERE course_id = ANY($1)`,
            [course_ids]
        );

        const alunos = await pool.query(
            `SELECT
                SUM(total_alunos) AS total_alunos
             FROM view_dashboard_coordenador
             WHERE course_id = ANY($1)`,
            [course_ids]
        );

        const porCategoria = await pool.query(
            `SELECT
                category_name AS categoria,
                COUNT(*) AS total
             FROM view_submissoes_completo
             WHERE course_id = ANY($1)
             GROUP BY category_name
             ORDER BY total DESC`,
            [course_ids]
        );

        const cursosMaisEnvios = await pool.query(
            `SELECT
                course_name AS nome_curso,
                COUNT(*) AS total_envios
             FROM view_submissoes_completo
             WHERE course_id = ANY($1)
             GROUP BY course_name
             ORDER BY total_envios DESC
             LIMIT 5`,
            [course_ids]
        );

        const ultimasAtividades = await pool.query(
            `SELECT
                submission_id,
                title,
                status,
                submitted_at,
                student_name AS nome_aluno,
                category_name AS categoria
             FROM view_submissoes_completo
             WHERE course_id = ANY($1)
             ORDER BY submitted_at DESC
             LIMIT 5`,
            [course_ids]
        );

        // novas queries analiticas (python) 
        
        const insightsPipeline = await pool.query(
            `SELECT id, perfil_destino, referencia_tipo, referencia_id, 
                    tipo_insight, titulo, descricao, nivel_alerta, valor_numerico 
             FROM insights
             WHERE (referencia_tipo = 'curso' AND referencia_id = ANY($1))
                OR (referencia_tipo = 'aluno' AND referencia_id IN (
                    SELECT user_id FROM user_courses WHERE course_id = ANY($1)
                ))
                OR (perfil_destino = 'superadmin' AND $2 = true);`,
            [course_ids, isSuperAdmin]
        );

        // Recomendações geradas para alunos que pertencem aos cursos do coordenador
        const recomendacoesPipeline = await pool.query(
            `SELECT id, perfil_destino, referencia_id, nome_regra, titulo, recomendacao, motivo, prioridade 
             FROM recomendacoes
             WHERE (perfil_destino = 'aluno' AND referencia_id IN (
                 SELECT user_id FROM user_courses WHERE course_id = ANY($1)
             ))
             OR (perfil_destino = 'superadmin' AND $2 = true);`,
            [course_ids, isSuperAdmin]
        );

        // Distribuição consolidada de risco dos alunos para alimentar gráficos de pizza/rosca
        const resumoRiscoPipeline = await pool.query(
            `SELECT nivel_risco, COUNT(*)::int as quantidade 
             FROM classificacao_risco
             WHERE course_id = ANY($1)
             GROUP BY nivel_risco;`,
            [course_ids]
        );

        res.status(200).json({
            metricas: {
                pendentes: parseInt(metricas.rows[0].pendentes || 0),
                aprovadas: parseInt(metricas.rows[0].aprovadas || 0),
                reprovadas: parseInt(metricas.rows[0].reprovadas || 0),
                media_horas: parseFloat(metricas.rows[0].media_horas || 0)
            },
            total_alunos: parseInt(alunos.rows[0].total_alunos || 0),
            total_cursos: course_ids.length,
            por_categoria: porCategoria.rows,
            cursos_mais_envios: cursosMaisEnvios.rows,
            ultimas_atividades: ultimasAtividades.rows,

            insights: insightsPipeline.rows,
            recomendacoes: recomendacoesPipeline.rows,
            resumoRisco: resumoRiscoPipeline.rows
        });

    } catch (err) {
        console.error('Erro Dashboard Coordenador:', err);
        res.status(500).json({
            erro: err.message
        });
    }
};