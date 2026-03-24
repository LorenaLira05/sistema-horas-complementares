const express = require('express');
const cors = require('cors'); 
require('dotenv').config();

const app = express();

app.use(express.json());
app.use(cors());


app.get('/status', (req, res) => {
    res.json({ mensagem: "API Online" });
});

app.listen(3000, () => {
    console.log("Servidor pronto!");
});