const fs = require("fs");
const path = require("path");

const dir = __dirname;
const cursos = JSON.parse(fs.readFileSync(path.join(dir, "data", "cursos.json"), "utf8"));
const glosario = JSON.parse(fs.readFileSync(path.join(dir, "data", "glosario.json"), "utf8"));
const lecturas = JSON.parse(fs.readFileSync(path.join(dir, "data", "lecturas.json"), "utf8"));

const evidenciasEjemplo = [
  { id: "ej_huerta", type: "imagen", titulo: "Foto de huerta escolar", descripcion: "Evidencia fotográfica del trabajo en la huerta o cultivo.", content: "" },
  { id: "ej_audio", type: "audio", titulo: "Audio de lectura en voz alta", descripcion: "Grabación de lectura para el portafolio.", content: "" },
  { id: "ej_convivencia", type: "texto", titulo: "Registro de convivencia", descripcion: "Acta o acuerdo del aula.", content: "Acuerdos: escuchar sin interrumpir, pedir la palabra, hacer seguimiento semanal." },
  { id: "ej_diario", type: "texto", titulo: "Diario de campo", descripcion: "Observación del territorio.", content: "Hoy observé el camino: el agua bajaba más turbia después de la lluvia." }
];

const APP_DATA = {
  cursos,
  glosario: glosario.terminos || [],
  lecturas: lecturas.lecturas || [],
  actividades: { actividades: [], quizzes: [] },
  evidenciasEjemplo
};

const out = "/* Datos estáticos — sin fetch. Generado para AprenderPensando. */\nwindow.APP_DATA = " + JSON.stringify(APP_DATA, null, 2) + ";\n";

const jsDir = path.join(dir, "js");
if (!fs.existsSync(jsDir)) fs.mkdirSync(jsDir, { recursive: true });
fs.writeFileSync(path.join(jsDir, "data-static.js"), out, "utf8");
console.log("js/data-static.js written OK");
