"use strict";
// Point d'entrée unique de l'API sur Vercel (une seule fonction serverless pour toutes les routes).
const { handle } = require("../lib/router");

module.exports = (req, res) => handle(req, res);
