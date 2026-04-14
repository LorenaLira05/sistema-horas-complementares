const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.login = async (req, res) => {
    const { email, senha } = req.body;

    try {
        const resultado = await pool.query(
            'SELECT * FROM usuarios WHERE email = $1',
            [email]
        );

        const usuario = resultado.rows[0];

        if (!usuario) {
            return res.status(401).json({ erro: "Email ou senha incorretos." });
        }

        const senhaCorreta = await bcrypt.compare(senha, usuario.senha);

        if (!senhaCorreta) {
            return res.status(401).json({ erro: "Email ou senha incorretos." });
        }

        const token = jwt.sign(
            {
                id: usuario.id,
                email: usuario.email,
                perfil: usuario.perfil,
                curso_id: usuario.curso_id
            },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.status(200).json({
            mensagem: "Login realizado com sucesso!",
            token: token,
            perfil: usuario.perfil
        });

    } catch (err) {
        res.status(500).json({ erro: "Erro no login: " + err.message });
    }
};

exports.setup = async (req, res) => {
    const { email, senha } = req.body;

    try {
        const existe = await pool.query(
            "SELECT * FROM usuarios WHERE perfil = 'SUPER_ADMIN'"
        );

        if (existe.rows.length > 0) {
            return res.status(400).json({ 
                erro: "Super Admin já existe. Rota desativada." 
            });
        }

        const senhaCripto = await bcrypt.hash(senha, 10);
        const resultado = await pool.query(
            `INSERT INTO usuarios (nome, email, senha, perfil) 
             VALUES ('Super Admin', $1, $2, 'SUPER_ADMIN') 
             RETURNING id, nome, email, perfil`,
            [email, senhaCripto]
        );

        res.status(201).json({
            mensagem: "Super Admin criado com sucesso!",
            dados: resultado.rows[0]
        });

    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};