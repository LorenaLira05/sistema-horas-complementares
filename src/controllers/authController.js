const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.login = async (req, res) => {
    const { email, senha } = req.body;

    try {
        const resultado = await pool.query(
            `SELECT u.*, array_agg(r.name) AS roles
             FROM users u
             JOIN user_roles ur ON ur.user_id = u.id
             JOIN roles r ON r.id = ur.role_id
             WHERE u.email = $1 AND u.status = 'active'
             GROUP BY u.id`,
            [email]
        );

        const usuario = resultado.rows[0];

        if (!usuario) {
            return res.status(401).json({ erro: "Email ou senha incorretos." });
        }

        const senhaCorreta = await bcrypt.compare(senha, usuario.password_hash);
        if (!senhaCorreta) {
            return res.status(401).json({ erro: "Email ou senha incorretos." });
        }

        const primeiroAcesso = usuario.last_login_at === null;

        await pool.query(
            `UPDATE users SET last_login_at = NOW() WHERE id = $1`,
            [usuario.id]
        );

        const token = jwt.sign(
            {
                id: usuario.id,
                email: usuario.email,
                perfis: usuario.roles, // array: ['student'], ['coordinator'], ['super_admin']
            },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.status(200).json({
            mensagem: "Login realizado com sucesso!",
            token,
            perfis: usuario.roles,
            primeiroAcesso
        });

    } catch (err) {
        res.status(500).json({ erro: "Erro no login: " + err.message });
    }
};

exports.setup = async (req, res) => {
    const { email, senha, nome } = req.body;

    try {
        // Verifica se já existe um super_admin
        const existe = await pool.query(
            `SELECT u.id FROM users u
             JOIN user_roles ur ON ur.user_id = u.id
             JOIN roles r ON r.id = ur.role_id
             WHERE r.name = 'super_admin'`
        );

        if (existe.rows.length > 0) {
            return res.status(400).json({ erro: "Super Admin já existe. Rota desativada." });
        }

        const senhaCripto = await bcrypt.hash(senha, 10);

        const novoUsuario = await pool.query(
            `INSERT INTO users (full_name, email, password_hash)
             VALUES ($1, $2, $3)
             RETURNING id, full_name, email`,
            [nome, email, senhaCripto]
        );

        const userId = novoUsuario.rows[0].id;

        const role = await pool.query(
            `SELECT id FROM roles WHERE name = 'super_admin'`
        );

        await pool.query(
            `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
            [userId, role.rows[0].id]
        );

        res.status(201).json({
            mensagem: "Super Admin criado com sucesso!",
            dados: novoUsuario.rows[0]
        });

    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};

exports.trocarSenha = async (req, res) => {
    const { senhaAtual, novaSenha } = req.body;
    const userId = req.usuario.id;

    try {
        const resultado = await pool.query(
            `SELECT * FROM users WHERE id = $1`,
            [userId]
        );

        const usuario = resultado.rows[0];

        if (!usuario) {
            return res.status(404).json({ erro: "Usuário não encontrado." });
        }

        const senhaCorreta = await bcrypt.compare(senhaAtual, usuario.password_hash);
        if (!senhaCorreta) {
            return res.status(401).json({ erro: "Senha atual incorreta." });
        }

        if (novaSenha.length < 6) {
            return res.status(400).json({ erro: "A nova senha deve ter pelo menos 6 caracteres." });
        }

        const novaSenhaCripto = await bcrypt.hash(novaSenha, 10);

        await pool.query(
            `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
            [novaSenhaCripto, userId]
        );

        res.status(200).json({ mensagem: "Senha alterada com sucesso!" });

    } catch (err) {
        res.status(500).json({ erro: "Erro ao trocar senha: " + err.message });
    }
};