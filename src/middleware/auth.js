const jwt = require('jsonwebtoken');

const authMiddleware = (perfisPermitidos) => {
    return (req, res, next) => {
        const authHeader = req.headers['authorization'];

        if (!authHeader) {
            return res.status(401).json({ erro: "Token não enviado." });
        }

        const token = authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ erro: "Token inválido." });
        }

        try {
        
            const dados = jwt.verify(token, process.env.JWT_SECRET);

            req.usuario = dados;
            
            if (!perfisPermitidos.includes(dados.perfil)) {
                return res.status(403).json({ erro: "Você não tem permissão para acessar esta área." });
            }

            next(); 

        } catch (err) {
            return res.status(401).json({ erro: "Token expirado ou inválido." });
        }
    };
};

module.exports = authMiddleware;