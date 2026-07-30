var express = require("express");
var router = express.Router();
var jiraController = require("../controllers/jiraController");

router.get("/buscarChamadosJira", jiraController.buscarChamadosJira);
router.get("/verificar/:numeroSerie/:componente", jiraController.verificarChamado);
router.post("/criar", jiraController.criarChamado);

const emailJira = "zephyrus2g@gmail.com";
const tokenJira = process.env.TOKEN_JIRA;
const dominioJira = "zephyrus2g1.atlassian.net";
const auth = btoa(`${emailJira}:${tokenJira}`);

router.post("/processarAlertas", async (req, res) => {
  const alertas = req.body;

  if (!Array.isArray(alertas) || !alertas.every((alerta) =>
    alerta &&
    typeof alerta === "object" &&
    typeof alerta.numero_serie === "string" &&
    typeof alerta.componente === "string" &&
    typeof alerta.hospital === "string" &&
    typeof alerta.area === "string" &&
    typeof alerta.valor_lido === "number" &&
    typeof alerta.max_permitido === "number" &&
    typeof alerta.min_permitido === "number"
  )) {
    return res.status(400).json({ erro: "Formato inválido de alertas" });
  }

  try {
    const jiraResponse = await fetch(`https://${dominioJira}/rest/api/3/search/jql`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jql: `project = "Chamados zephyrus"`,
        maxResults: 1000,
        fields: ["customfield_10125", "customfield_10126"]
      })
    });

    const dados = await jiraResponse.json();

    const existentes = new Set();
    for (const issue of dados.issues) {
      const numero = issue.fields.customfield_10125;
      const comp = issue.fields.customfield_10126;
      existentes.add(`${numero}__${comp}`);
    }

    let criados = 0;
    let ignorados = 0;

    for (const alerta of alertas) {
      const key = `${alerta.numero_serie}__${alerta.componente}`;

      if (existentes.has(key)) {
        ignorados++;
        continue;
      }

      let prioridade = "High";
      if (alerta.valor_lido <= alerta.max_permitido * 1.1 && alerta.valor_lido >= alerta.min_permitido * 0.9) {
        prioridade = "Low";
      } else if (alerta.valor_lido <= alerta.max_permitido * 1.2 && alerta.valor_lido >= alerta.min_permitido * 0.8) {
        prioridade = "Medium";
      }

      const issue = {
        fields: {
          project: { key: "KAN" },
          issuetype: { name: "Request" },
          priority: { name: prioridade },
          summary: `Alerta de ${alerta.componente} para o equipamento ${alerta.numero_serie} no hospital ${alerta.hospital}`,
          customfield_10091: alerta.hospital,
          customfield_10092: alerta.area,
          customfield_10125: alerta.numero_serie,
          customfield_10126: alerta.componente,
          duedate: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString().split("T")[0]
        }
      };

      await fetch(`https://${dominioJira}/rest/api/3/issue`, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(issue)
      });

      criados++;

      await new Promise(r => setTimeout(r, 250));
    }

    return res.json({
      status: "ok",
      criados,
      ignorados,
      total: alertas.length
    });

  } catch (erro) {
    console.error("Erro ao processar alertas:", erro);
    return res.status(500).json({ erro: "Erro ao processar alertas" });
  }
});

module.exports = router;
