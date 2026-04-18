const pool = require('../config/database');

const registrarLog = async (usuario_id, acao, entity_name, entity_id, details = {}) => {
    try {
        if (!usuario_id) return;
        await pool.query(
            `INSERT INTO audit_logs (user_id, action, entity_name, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [usuario_id, acao, entity_name, entity_id, JSON.stringify(details)]
        );
    } catch (err) {
        console.error('Erro ao registrar log:', err.message);
    }
};

module.exports = registrarLog;