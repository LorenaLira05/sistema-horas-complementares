const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const { fromPath } = require('pdf2pic');
const path = require('path');
const fs = require('fs');
const Groq = require('groq-sdk');

const groq = new Groq();

// Função que envia o texto para a IA da Groq estruturar
const extrairDadosComIA = async (textoBruto) => {
    if (!textoBruto) {
        return { titulo: null, instituicao: null, ano: null, duracao: null };
    }

    const prompt = `Analise o texto extraído de um certificado via OCR e retorne obrigatoriamente um objeto JSON com as chaves exatas: "titulo", "instituicao", "ano" e "duracao".

Texto do certificado:
${textoBruto}`;
        
    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: 'Você é um assistente focado em extrair dados de certificados. Retorne APENAS um objeto JSON válido contendo as chaves: "titulo", "instituicao", "ano", "duracao". Não adicione explicações ou markdown.',
                },
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            model: 'llama-3.1-8b-instant',
            response_format: { type: "json_object" } 
        });

        const respostaIA = JSON.parse(chatCompletion.choices[0].message.content);

        return {
            titulo: respostaIA.titulo || respostaIA.curso || null,
            instituicao: respostaIA.instituicao || respostaIA.empresa || null,
            ano: respostaIA.ano || respostaIA.data || null,
            duracao: respostaIA.duracao || respostaIA.carga_horaria || null
        };
    } catch (erro) {
        console.error("Erro ao estruturar dados com a IA da Groq:", erro.message);
        return { titulo: null, instituicao: null, ano: null, duracao: null };
    }
};

const processarImagem = async (caminhoArquivo) => {
    const dir = path.dirname(caminhoArquivo);
    const nomeTemporario = `ocr_temp_${Date.now()}.png`;
    const caminhoProcessado = path.join(dir, nomeTemporario);

    await sharp(caminhoArquivo)
        .grayscale()
        .normalize()
        .toFile(caminhoProcessado);

    const { data } = await Tesseract.recognize(
        caminhoProcessado,
        'por+eng'
    );

    if (fs.existsSync(caminhoProcessado)) {
        fs.unlinkSync(caminhoProcessado);
    }

    return {
        texto: data.text.trim(),
        confianca: parseFloat(data.confidence.toFixed(2))
    };
};

const processarPdf = async (caminhoArquivo) => {
    const tmpDir = path.join(__dirname, '../../uploads/tmp');

    if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
    }

    const convert = fromPath(caminhoArquivo, {
        density: 300,
        saveFilename: `ocr_${Date.now()}`,
        savePath: tmpDir,
        format: 'png',
    });

    const pagina = await convert(1);

    console.log("Imagem gerada:", pagina.path);
    console.log("Existe?", fs.existsSync(pagina.path));

    const resultado = await processarImagem(pagina.path);

    if (fs.existsSync(pagina.path)) {
        fs.unlinkSync(pagina.path);
    }

    return resultado;
};

exports.executarOCR = async (caminhoArquivo, mimetype) => {
    try {
        const ehPdf =
            mimetype === 'application/pdf' ||
            caminhoArquivo.toLowerCase().endsWith('.pdf');

        let resultadoOCR;

        if (ehPdf) {
            resultadoOCR = await processarPdf(caminhoArquivo);
        } else {
            resultadoOCR = await processarImagem(caminhoArquivo);
        }

        // Passa o texto extraído pelo Tesseract para a Groq estruturar
        const dadosExtraidos = await extrairDadosComIA(resultadoOCR.texto);

        return {
            confianca: resultadoOCR.confianca,
            textoBruto: resultadoOCR.texto, 
            dados: dadosExtraidos 
        };

    } catch (err) {
        console.error('Erro no OCR:', err.message);
        return { confianca: null, textoBruto: null, dados: null };
    }
};