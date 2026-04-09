const pool = require('../config/database');

exports.getDashboardCoordenador = async (req, res) => {
    const curso_id = req.usuario.curso_id;

    try {
        // Métricas gerais das submissões
        const metricas = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE a.status = 'PENDENTE') as pendentes,
                COUNT(*) FILTER (WHERE a.status = 'APROVADO') as aprovadas,
                COUNT(*) FILTER (WHERE a.status = 'REJEITADO') as reprovadas,
                COALESCE(AVG(a.horas_aprovadas) FILTER (WHERE a.status = 'APROVADO'), 0) as media_horas
            FROM atividades_enviadas a
            JOIN usuarios u ON a.aluno_id = u.id
            WHERE u.curso_id = $1`,
            [curso_id]
        );

        // Total de alunos do curso
        const alunos = await pool.query(`
            SELECT COUNT(*) as total_alunos
            FROM usuarios
            WHERE curso_id = $1 AND perfil = 'ALUNO'`,
            [curso_id]
        );

        // Envios por categoria
        const porCategoria = await pool.query(`
            SELECT 
                r.nome_categoria as categoria,
                COUNT(*) as total
            FROM atividades_enviadas a
            JOIN regras_atividades r ON a.regra_id = r.id
            JOIN usuarios u ON a.aluno_id = u.id
            WHERE u.curso_id = $1
            GROUP BY r.nome_categoria
            ORDER BY total DESC`,
            [curso_id]
        );

        // Últimas 5 atividades
        const ultimasAtividades = await pool.query(`
            SELECT 
                a.id,
                a.descricao,
                a.status,
                a.data_envio,
                u.nome as nome_aluno,
                r.nome_categoria as categoria
            FROM atividades_enviadas a
            JOIN usuarios u ON a.aluno_id = u.id
            LEFT JOIN regras_atividades r ON a.regra_id = r.id
            WHERE u.curso_id = $1
            ORDER BY a.data_envio DESC
            LIMIT 5`,
            [curso_id]
        );

        res.status(200).json({
            metricas: metricas.rows[0],
            total_alunos: alunos.rows[0].total_alunos,
            por_categoria: porCategoria.rows,
            ultimas_atividades: ultimasAtividades.rows
        });

    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};