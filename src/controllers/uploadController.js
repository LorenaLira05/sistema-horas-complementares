const pool = require('../config/database');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const nomeUnico = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
        cb(null, nomeUnico);
    }
});

const fileFilter = (req, file, cb) => {
    const extensao = path.extname(file.originalname).toLowerCase();

    const extensoesPermitidas = ['.jpg', '.jpeg', '.png', '.pdf'];

    if (extensoesPermitidas.includes(extensao)) {
        cb(null, true);
    } else {
        cb(new Error('Tipo de arquivo não permitido. Use JPG, PNG ou PDF.'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } 
});

exports.uploadCertificado = [
    upload.single('certificado'),
    async (req, res) => {
        const { atividade_id } = req.params;

        if (!req.file) {
            return res.status(400).json({ erro: 'Nenhum arquivo enviado.' });
        }

        try {
            const resultado = await pool.query(`
                INSERT INTO certificados (atividade_id, nome_arquivo, caminho_arquivo, tipo_arquivo)
                VALUES ($1, $2, $3, $4)
                RETURNING *`,
                [
                    atividade_id,
                    req.file.originalname,
                    `/uploads/${req.file.filename}`,
                    req.file.mimetype
                ]
            );

            res.status(201).json({
                mensagem: 'Certificado enviado com sucesso!',
                certificado: resultado.rows[0]
            });

        } catch (err) {
            res.status(500).json({ erro: err.message });
        }
    }
];

exports.getCertificado = async (req, res) => {
    const { atividade_id } = req.params;

    try {
        const resultado = await pool.query(`
            SELECT * FROM certificados
            WHERE atividade_id = $1
            ORDER BY criado_em DESC`,
            [atividade_id]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({ erro: 'Nenhum certificado encontrado.' });
        }

        res.status(200).json(resultado.rows);

    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};

module.exports.upload = upload;