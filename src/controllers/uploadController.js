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

// Mapeia mimetype para o enum file_type_enum do banco
const getFileType = (mimetype) => {
    if (mimetype === 'application/pdf') return 'pdf';
    if (mimetype.startsWith('image/')) return 'image';
    return 'other';
};

exports.uploadCertificado = [
    upload.single('certificado'),
    async (req, res) => {
        const { submission_id } = req.params;

        if (!req.file) {
            return res.status(400).json({ erro: 'Nenhum arquivo enviado.' });
        }

        try {
            // Verifica se a submissão existe e pertence ao aluno
            const submissao = await pool.query(
                `SELECT s.id FROM submissions s
                 JOIN user_courses uc ON uc.id = s.user_course_id
                 WHERE s.id = $1 AND uc.user_id = $2`,
                [submission_id, req.usuario.id]
            );

            if (submissao.rows.length === 0) {
                return res.status(404).json({ erro: 'Submissão não encontrada.' });
            }

            const resultado = await pool.query(
                `INSERT INTO submission_files
                 (submission_id, original_filename, storage_path, file_type, mime_type, file_size_kb)
                 VALUES ($1, $2, $3, $4::file_type_enum, $5, $6)
                 RETURNING *`,
                [
                    submission_id,
                    req.file.originalname,
                    `/uploads/${req.file.filename}`,
                    getFileType(req.file.mimetype),
                    req.file.mimetype,
                    Math.round(req.file.size / 1024)
                ]
            );

            res.status(201).json({
                mensagem: 'Certificado enviado com sucesso!',
                arquivo: resultado.rows[0]
            });

        } catch (err) {
            res.status(500).json({ erro: err.message });
        }
    }
];

exports.getCertificado = async (req, res) => {
    const { submission_id } = req.params;

    try {
        const resultado = await pool.query(
            `SELECT * FROM submission_files
             WHERE submission_id = $1
             ORDER BY uploaded_at DESC`,
            [submission_id]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({ erro: 'Nenhum arquivo encontrado.' });
        }

        res.status(200).json(resultado.rows);

    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};

module.exports.upload = upload;