import { Router, getHashPath } from "./router.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function fmtDate(ts) {
  try {
    return new Date(ts).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return String(ts);
  }
}

function setText(id, text) {
  const el = typeof id === "string" ? $(id) : id;
  if (el) el.textContent = text;
}

function setActiveNav(path) {
  const links = $$("[data-route]");
  for (const a of links) a.classList.remove("is-active");
  const exact = links.find((a) => (a.getAttribute("href") || "") === `#${path}`);
  if (exact) exact.classList.add("is-active");
  else {
    const base =
      path.startsWith("/cursos") ? "#/cursos" :
      path.startsWith("/portafolio") ? "#/portafolio" :
      path.startsWith("/glosario") ? "#/glosario" :
      "#/";
    const hit = links.find((a) => (a.getAttribute("href") || "") === base);
    if (hit) hit.classList.add("is-active");
  }
}

// --- IndexedDB (offline-first) ---
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("aprenderPensandoDB", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("evidences")) {
        const s = db.createObjectStore("evidences", { keyPath: "id" });
        s.createIndex("by_createdAt", "createdAt");
        s.createIndex("by_type", "type");
      }
      if (!db.objectStoreNames.contains("glossaryAudio")) {
        db.createObjectStore("glossaryAudio", { keyPath: "termId" });
      }
      if (!db.objectStoreNames.contains("progress")) {
        db.createObjectStore("progress", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAll(storeName, indexName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const st = tx.objectStore(storeName);
    const req = indexName ? st.index(indexName).getAll() : st.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const st = tx.objectStore(storeName);
    const req = st.get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(storeName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const st = tx.objectStore(storeName);
    const req = st.put(value);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const st = tx.objectStore(storeName);
    const req = st.delete(key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// --- Data loading (JSON “base de datos”) ---
const CACHE_KEY = "aprenderPensando_cache_v1";
const state = {
  cursos: null,
  lecturas: null,
  actividades: null,
  glosario: null,
  lastLoadedAt: 0,
};

async function loadAllData({ force = false } = {}) {
  const cacheRaw = localStorage.getItem(CACHE_KEY);
  const cache = cacheRaw ? safeJson(cacheRaw) : null;

  if (!force && cache && cache.cursos && cache.lecturas && cache.actividades && cache.glosario) {
    state.cursos = cache.cursos;
    state.lecturas = cache.lecturas;
    state.actividades = cache.actividades;
    state.glosario = cache.glosario;
    state.lastLoadedAt = cache.lastLoadedAt || Date.now();
  }

  try {
    const bust = `?v=${Date.now()}`;
    const [cursos, lecturas, actividades, glosario] = await Promise.all([
      fetchJSON(`./data/cursos.json${bust}`),
      fetchJSON(`./data/lecturas.json${bust}`),
      fetchJSON(`./data/actividades.json${bust}`),
      fetchJSON(`./data/glosario.json${bust}`),
    ]);
    state.cursos = cursos;
    state.lecturas = lecturas;
    state.actividades = actividades;
    state.glosario = glosario;
    state.lastLoadedAt = Date.now();

    localStorage.setItem(CACHE_KEY, JSON.stringify({
      cursos, lecturas, actividades, glosario,
      lastLoadedAt: state.lastLoadedAt,
    }));
  } catch (e) {
    // si no hay red pero hay cache, seguimos
    if (!state.cursos) throw e;
  }
}

function safeJson(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo cargar ${url} (${res.status})`);
  return await res.json();
}

function findCourse(courseId) {
  return (state.cursos?.courses || []).find((c) => c.id === courseId) || null;
}
function findModule(courseId, moduleId) {
  const c = findCourse(courseId);
  return c?.modulos?.find((m) => m.id === moduleId) || null;
}
function findLesson(lessonId) {
  for (const c of (state.cursos?.courses || [])) {
    for (const m of (c.modulos || [])) {
      const l = (m.lecciones || []).find((x) => x.id === lessonId);
      if (l) return { course: c, module: m, lesson: l };
    }
  }
  return null;
}
function getReading(readingId) {
  return (state.lecturas?.lecturas || []).find((x) => x.id === readingId) || null;
}
function getActivity(activityId) {
  return (state.actividades?.actividades || []).find((x) => x.id === activityId) || null;
}
function getQuiz(quizId) {
  return (state.actividades?.quizzes || []).find((x) => x.id === quizId) || null;
}

// --- UI: Glosario flotante ---
function setupGlossaryUI() {
  const fab = $("#glosarioFab");
  const drawer = $("#glosarioDrawer");
  const backdrop = $("#drawerBackdrop");
  const btnClose = $("#glosarioCerrar");
  const input = $("#glosarioBuscar");

  function open() {
    drawer.classList.add("is-open");
    backdrop.hidden = false;
    input?.focus();
    renderGlossaryList(input?.value || "");
  }
  function close() {
    drawer.classList.remove("is-open");
    backdrop.hidden = true;
  }

  fab?.addEventListener("click", () => {
    drawer.classList.contains("is-open") ? close() : open();
  });
  btnClose?.addEventListener("click", close);
  backdrop?.addEventListener("click", () => {
    close();
    // también sirve para cerrar sidebar en móvil
    $("#sidebar")?.classList.remove("is-open");
  });
  input?.addEventListener("input", () => renderGlossaryList(input.value));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
}

async function renderGlossaryList(query) {
  const list = $("#glosarioLista");
  if (!list) return;
  const q = (query || "").trim().toLowerCase();
  const terms = (state.glosario?.terminos || []);
  const filtered = !q ? terms : terms.filter((t) => {
    const hay = `${t.espanol} ${t.indigena} ${t.lengua} ${t.descripcion} ${t.contexto}`.toLowerCase();
    return hay.includes(q);
  });

  if (!filtered.length) {
    list.innerHTML = `<div class="notice">No se encontraron términos con esa búsqueda.</div>`;
    return;
  }

  const html = await Promise.all(filtered.slice(0, 60).map(async (t) => {
    const audioStored = await idbGet("glossaryAudio", t.id);
    const audioSrc = audioStored?.dataUrl || t.audio || "";
    const audioBlock = audioSrc
      ? `<audio controls preload="none" src="${escapeHtml(audioSrc)}" style="width:100%"></audio>`
      : `<div class="notice">Audio: <b>sin archivo</b>. Puedes subir uno y quedará guardado offline.</div>`;

    return `
      <div class="term">
        <div class="term__row">
          <div class="term__es">${escapeHtml(t.espanol)}</div>
          <div class="term__ind">• ${escapeHtml(t.indigena)}</div>
          <div class="term__lang">(${escapeHtml(t.lengua)})</div>
        </div>
        <div class="term__desc">${escapeHtml(t.descripcion)}</div>
        <div class="term__ctx"><b>Contexto rural:</b> ${escapeHtml(t.contexto)}</div>
        <div class="term__actions">
          <button class="btn btn--soft" data-audio-upload="${escapeHtml(t.id)}" type="button">Subir/actualizar audio</button>
          <button class="btn btn--soft" data-audio-clear="${escapeHtml(t.id)}" type="button">Borrar audio local</button>
        </div>
        <div style="margin-top:10px">${audioBlock}</div>
      </div>
    `;
  }));

  list.innerHTML = html.join("");

  // wiring upload/clear
  $$("[data-audio-upload]", list).forEach((btn) => {
    btn.addEventListener("click", async () => {
      const termId = btn.getAttribute("data-audio-upload");
      if (!termId) return;
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "audio/*";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        const dataUrl = await fileToDataURL(file);
        await idbPut("glossaryAudio", { termId, mime: file.type || "audio/*", dataUrl, updatedAt: Date.now() });
        await renderGlossaryList($("#glosarioBuscar")?.value || "");
      };
      input.click();
    });
  });
  $$("[data-audio-clear]", list).forEach((btn) => {
    btn.addEventListener("click", async () => {
      const termId = btn.getAttribute("data-audio-clear");
      if (!termId) return;
      await idbDelete("glossaryAudio", termId);
      await renderGlossaryList($("#glosarioBuscar")?.value || "");
    });
  });
}

// --- Vistas ---
function viewHome() {
  setText("#routeKicker", "Inicio");
  setText("#routeTitle", "Bienvenida y misión educativa");

  const mission = `
    <div class="grid">
      <div class="card" style="grid-column: span 12;">
        <h2 class="card__title">Bienvenidas y bienvenidos a APRENDER PENSANDO</h2>
        <p class="card__subtitle">
          APRENDER PENSANDO es una plataforma educativa diseñada para acompañar procesos de lectura, escritura, pensamiento crítico y ciudadanía
          desde la realidad rural e intercultural. Está pensada para funcionar sin internet permanente: en escuelas de corregimientos, veredas,
          resguardos y comunidades donde la conectividad es intermitente o costosa.
        </p>
        <div class="card__meta">
          <span class="chip chip--brand">100% estático (HTML/CSS/JS/JSON)</span>
          <span class="chip chip--ok">Offline-first (portafolio + audios)</span>
          <span class="chip">Enfoque rural</span>
          <span class="chip">Enfoque intercultural</span>
          <span class="chip">Diseño responsive</span>
        </div>
      </div>

      <div class="card card--soft" style="grid-column: span 12;">
        <div class="prose">
          <h3>¿Por qué “Aprender pensando”?</h3>
          <p>
            En contextos rurales, aprender no ocurre solo en el cuaderno: ocurre en la huerta, en el camino al río, en la conversación con la abuela,
            en la asamblea comunitaria, en la ming(a) o la jornada de trabajo compartido. Esta plataforma parte de una idea central:
            <b>pensar es aprender</b> y <b>aprender es transformar</b>. Por eso, cada curso combina lecturas extensas, actividades significativas,
            autoevaluaciones simples y recursos descargables (simulados) que ayudan a consolidar lo aprendido.
          </p>
          <p>
            El enfoque no es memorístico. Proponemos prácticas de comprensión lectora conectadas con el territorio, escritura académica útil para la
            escuela y la comunidad, pensamiento crítico para tomar decisiones, convivencia para construir paz cotidiana e inteligencia artificial
            responsable para comprender el mundo digital sin perder el sentido ético.
          </p>
          <p>
            APRENDER PENSANDO reconoce que Colombia es diversa: pueblos indígenas, comunidades afrodescendientes, campesinas y urbanas comparten el país
            desde historias distintas. Aquí promovemos una educación intercultural: aprender sin borrar identidades, dialogar sin imponer, valorar la lengua
            y la memoria comunitaria como parte del currículo vivo.
          </p>
          <p>
            La plataforma está especialmente orientada a la Escuela del corregimiento Nápoles (Trujillo, Valle del Cauca) y a comunidades vulnerables.
            Sin embargo, su contenido puede adaptarse a otros territorios. Los cursos están organizados por módulos y lecciones; cada lección incluye
            actividades concretas (para hacer en casa o en el aula), y una autoevaluación que ayuda a monitorear el proceso.
          </p>
          <p>
            Además, encontrarás un <b>Glosario indígena</b> accesible desde el botón flotante (siempre visible). El glosario trae términos reales y
            su contexto de uso rural. Si más adelante subes archivos de audio, podrás guardar la pronunciación de cada palabra: esos audios quedarán
            almacenados en tu dispositivo y funcionarán offline.
          </p>
          <p>
            Por último, el <b>Portafolio digital</b> funciona sin servidor: puedes guardar textos, imágenes y audios (base64) como evidencias del
            aprendizaje. Esto permite que el estudiante construya memoria de su proceso: borradores, relatos, fotografías de trabajos, grabaciones
            de lectura en voz alta o entrevistas a mayores.
          </p>
          <p>
            Esta plataforma es un punto de partida. El propósito es que el contenido crezca con el territorio: que docentes y estudiantes creen más
            lecturas, glosarios, audios y evidencias. La tecnología aquí no reemplaza la pedagogía: la acompaña.
          </p>
        </div>
        <div class="divider"></div>
        <div class="row">
          <a class="btn btn--brand" href="#/cursos">Ir a la biblioteca de cursos</a>
          <a class="btn" href="#/portafolio">Abrir portafolio digital</a>
          <a class="btn btn--soft" href="#/glosario">Explorar glosario indígena</a>
          <span class="spacer"></span>
          <span class="muted">Contenido cargado: ${fmtDate(state.lastLoadedAt || Date.now())}</span>
        </div>
      </div>
    </div>
  `;

  $("#view").innerHTML = mission;
}

function viewCourses() {
  setText("#routeKicker", "Biblioteca");
  setText("#routeTitle", "Cursos disponibles");
  const courses = (state.cursos?.courses || []);

  const cards = courses.map((c) => `
    <div class="card" style="grid-column: span 12;">
      <h2 class="card__title">${escapeHtml(c.titulo)}</h2>
      <p class="card__subtitle">${escapeHtml(c.descripcionCorta)}</p>
      <div class="card__meta">
        <span class="chip chip--brand">${escapeHtml(c.nivel)}</span>
        <span class="chip">${escapeHtml(c.duracionSugerida)}</span>
        ${(c.enfoque || []).map((x) => `<span class="chip">${escapeHtml(x)}</span>`).join("")}
        <span class="chip chip--ok">${(c.modulos || []).length} módulos</span>
      </div>
      <div class="divider"></div>
      <div class="row">
        <a class="btn btn--brand" href="#/cursos/${encodeURIComponent(c.id)}">Abrir curso</a>
        <a class="btn btn--soft" href="#/cursos/${encodeURIComponent(c.id)}#info">Ver enfoque</a>
      </div>
    </div>
  `).join("");

  $("#view").innerHTML = `
    <div class="grid">
      <div class="card card--soft" style="grid-column: span 12;">
        <h2 class="card__title">Biblioteca de Cursos</h2>
        <p class="card__subtitle">
          Seis cursos completos con módulos, lecciones, lecturas extensas, actividades y autoevaluación. Diseñados para el aula y la casa,
          con énfasis rural e intercultural.
        </p>
      </div>
      ${cards}
    </div>
  `;
}

function viewCourseDetail(courseId) {
  const c = findCourse(courseId);
  if (!c) return viewNotFound("Curso no encontrado.");

  setText("#routeKicker", "Curso");
  setText("#routeTitle", c.titulo);

  const mods = (c.modulos || []).map((m) => `
    <div class="item">
      <div class="row">
        <div>
          <div class="item__title">${escapeHtml(m.titulo)}</div>
          <p class="item__sub">${escapeHtml(m.descripcion)}</p>
          <div class="card__meta" style="margin-top:8px">
            <span class="chip">${(m.lecciones || []).length} lecciones</span>
            <span class="chip">${escapeHtml(m.duracion)}</span>
          </div>
        </div>
        <span class="spacer"></span>
        <a class="btn btn--brand" href="#/cursos/${encodeURIComponent(c.id)}/modulo/${encodeURIComponent(m.id)}">Abrir módulo</a>
      </div>
    </div>
  `).join("");

  $("#view").innerHTML = `
    <div class="grid">
      <div class="card" style="grid-column: span 12;">
        <h2 class="card__title">${escapeHtml(c.titulo)}</h2>
        <p class="card__subtitle">${escapeHtml(c.descripcionLarga)}</p>
        <div class="card__meta">
          <span class="chip chip--brand">${escapeHtml(c.nivel)}</span>
          <span class="chip">${escapeHtml(c.duracionSugerida)}</span>
          ${(c.enfoque || []).map((x) => `<span class="chip">${escapeHtml(x)}</span>`).join("")}
        </div>
      </div>
      <div class="card card--soft" style="grid-column: span 12;">
        <h3 class="card__title" style="font-size:16px;">Módulos del curso</h3>
        <div class="list">${mods}</div>
      </div>
    </div>
  `;
}

function viewModule(courseId, moduleId) {
  const c = findCourse(courseId);
  const m = findModule(courseId, moduleId);
  if (!c || !m) return viewNotFound("Módulo no encontrado.");

  setText("#routeKicker", "Módulo");
  setText("#routeTitle", `${c.titulo} · ${m.titulo}`);

  const lessons = (m.lecciones || []).map((l) => `
    <div class="item">
      <div class="row">
        <div>
          <div class="item__title">${escapeHtml(l.titulo)}</div>
          <p class="item__sub">${escapeHtml(l.resumen)}</p>
          <div class="card__meta" style="margin-top:8px">
            <span class="chip">Lecturas: ${(l.lecturas || []).length}</span>
            <span class="chip">Actividades: ${(l.actividades || []).length}</span>
            <span class="chip chip--ok">Autoevaluación</span>
          </div>
        </div>
        <span class="spacer"></span>
        <a class="btn btn--brand" href="#/leccion/${encodeURIComponent(l.id)}">Abrir lección</a>
      </div>
    </div>
  `).join("");

  $("#view").innerHTML = `
    <div class="grid">
      <div class="card" style="grid-column: span 12;">
        <div class="row">
          <div>
            <div class="muted">Curso</div>
            <h2 class="card__title" style="margin-top:6px">${escapeHtml(c.titulo)}</h2>
          </div>
          <span class="spacer"></span>
          <a class="btn btn--soft" href="#/cursos/${encodeURIComponent(c.id)}">Volver al curso</a>
        </div>
        <div class="divider"></div>
        <h3 class="card__title" style="font-size:16px;">${escapeHtml(m.titulo)}</h3>
        <p class="card__subtitle">${escapeHtml(m.descripcion)}</p>
      </div>
      <div class="card card--soft" style="grid-column: span 12;">
        <h3 class="card__title" style="font-size:16px;">Lecciones</h3>
        <div class="list">${lessons}</div>
      </div>
    </div>
  `;
}

async function viewLesson(lessonId) {
  const hit = findLesson(lessonId);
  if (!hit) return viewNotFound("Lección no encontrada.");
  const { course: c, module: m, lesson: l } = hit;

  setText("#routeKicker", "Lección");
  setText("#routeTitle", l.titulo);

  const readings = (l.lecturas || [])
    .map((rid) => getReading(rid))
    .filter(Boolean);

  const readingBlocks = readings.map((r) => `
    <div class="item">
      <div class="item__title">${escapeHtml(r.titulo)}</div>
      <div class="muted" style="margin-top:6px">Lectura extensa (territorio, escuela y comunidad)</div>
      <div class="divider"></div>
      <div class="prose">
        ${(r.parrafos || []).map((p) => `<p>${escapeHtml(p)}</p>`).join("")}
      </div>
    </div>
  `).join("");

  const activities = (l.actividades || []).map((aid) => getActivity(aid)).filter(Boolean);
  const activityBlocks = activities.map((a) => `
    <div class="item">
      <div class="row">
        <div>
          <div class="item__title">${escapeHtml(a.titulo)}</div>
          <p class="item__sub">${escapeHtml(a.proposito)}</p>
        </div>
        <span class="spacer"></span>
        <a class="btn btn--soft" href="#/actividad/${encodeURIComponent(a.id)}">Ver actividad</a>
      </div>
      <div class="divider"></div>
      <div class="prose">
        <p><b>Producto:</b> ${escapeHtml(a.producto)}</p>
        <p><b>Tiempo sugerido:</b> ${escapeHtml(a.tiempo)}</p>
        <h3>Paso a paso</h3>
        <ul>
          ${(a.pasos || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("")}
        </ul>
        <h3>Criterios de calidad</h3>
        <ul>
          ${(a.criterios || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("")}
        </ul>
      </div>
    </div>
  `).join("");

  const quiz = getQuiz(l.autoevaluacion);
  const quizBlock = quiz ? renderQuiz(quiz, l.id) : `<div class="notice">Autoevaluación no disponible.</div>`;

  const resources = (l.recursos || []).map((r) => `
    <div class="item">
      <div class="row">
        <div>
          <div class="item__title">${escapeHtml(r.nombre)}</div>
          <p class="item__sub">${escapeHtml(r.descripcion || "Recurso descargable simulado para trabajo offline.")}</p>
        </div>
        <span class="spacer"></span>
        <a class="btn btn--brand" href="${escapeHtml(r.archivo)}" download>Descargar</a>
      </div>
    </div>
  `).join("");

  $("#view").innerHTML = `
    <div class="grid">
      <div class="card" style="grid-column: span 12;">
        <div class="row">
          <div>
            <div class="muted">${escapeHtml(c.titulo)} · ${escapeHtml(m.titulo)}</div>
            <h2 class="card__title" style="margin-top:6px">${escapeHtml(l.titulo)}</h2>
            <p class="card__subtitle">${escapeHtml(l.resumen)}</p>
          </div>
          <span class="spacer"></span>
          <a class="btn btn--soft" href="#/cursos/${encodeURIComponent(c.id)}/modulo/${encodeURIComponent(m.id)}">Volver al módulo</a>
        </div>
        <div class="divider"></div>
        <div class="card__meta">
          <span class="chip">Lecturas: ${readings.length}</span>
          <span class="chip">Actividades: ${activities.length}</span>
          <span class="chip chip--ok">Autoevaluación incluida</span>
        </div>
      </div>

      <div class="card card--soft" style="grid-column: span 12;">
        <h3 class="card__title" style="font-size:16px;">Lecturas</h3>
        <div class="list">${readingBlocks || `<div class="notice">Esta lección no tiene lecturas asignadas.</div>`}</div>
      </div>

      <div class="card card--soft" style="grid-column: span 12;">
        <h3 class="card__title" style="font-size:16px;">Actividades</h3>
        <div class="list">${activityBlocks || `<div class="notice">Esta lección no tiene actividades asignadas.</div>`}</div>
      </div>

      <div class="card card--soft" style="grid-column: span 12;">
        <h3 class="card__title" style="font-size:16px;">Autoevaluación</h3>
        ${quizBlock}
      </div>

      <div class="card card--soft" style="grid-column: span 12;">
        <h3 class="card__title" style="font-size:16px;">Recursos descargables (simulados)</h3>
        <div class="list">${resources || `<div class="notice">No hay recursos para descargar en esta lección.</div>`}</div>
      </div>
    </div>
  `;

  wireQuizHandlers(l.id);
}

function renderQuiz(quiz, lessonId) {
  const key = `quiz:${lessonId}:${quiz.id}`;
  const saved = safeJson(localStorage.getItem(key) || "");
  const savedScore = saved?.score ?? null;

  return `
    <div class="quiz" data-quiz="${escapeHtml(quiz.id)}" data-lesson="${escapeHtml(lessonId)}">
      <div class="muted">Responde y luego presiona <b>Calificar</b>. Tu resultado se guarda localmente.</div>
      ${savedScore !== null ? `<div class="notice notice--ok" style="margin-top:10px">Resultado guardado: <b>${savedScore}%</b></div>` : ""}
      ${(quiz.preguntas || []).map((q, idx) => `
        <div class="q">
          <div class="q__title">${idx + 1}. ${escapeHtml(q.enunciado)}</div>
          ${(q.opciones || []).map((opt, oi) => `
            <label class="q__opt">
              <input type="radio" name="q_${quiz.id}_${idx}" value="${oi}" />
              <span>${escapeHtml(opt)}</span>
            </label>
          `).join("")}
        </div>
      `).join("")}
      <div class="row" style="margin-top:10px">
        <button class="btn btn--brand" type="button" data-quiz-submit>Calificar</button>
        <button class="btn btn--soft" type="button" data-quiz-reset>Reiniciar</button>
        <span class="spacer"></span>
        <span class="muted">Preguntas: ${(quiz.preguntas || []).length}</span>
      </div>
      <div class="quiz__result" style="margin-top:10px"></div>
    </div>
  `;
}

function wireQuizHandlers(lessonId) {
  const box = $(`[data-lesson="${CSS.escape(lessonId)}"][data-quiz]`);
  if (!box) return;
  const quizId = box.getAttribute("data-quiz");
  const quiz = getQuiz(quizId);
  if (!quiz) return;

  const key = `quiz:${lessonId}:${quiz.id}`;
  const result = $(".quiz__result", box);

  $("[data-quiz-submit]", box)?.addEventListener("click", () => {
    let correct = 0;
    const total = (quiz.preguntas || []).length || 0;
    (quiz.preguntas || []).forEach((q, idx) => {
      const picked = box.querySelector(`input[name="q_${quiz.id}_${idx}"]:checked`);
      const val = picked ? Number(picked.value) : -1;
      if (val === q.correcta) correct++;
    });
    const pct = total ? Math.round((correct / total) * 100) : 0;
    localStorage.setItem(key, JSON.stringify({ score: pct, correct, total, at: Date.now() }));

    if (result) {
      const msg =
        pct >= 80 ? "Excelente. Tus respuestas muestran comprensión y criterio." :
        pct >= 60 ? "Vas bien. Revisa las lecturas y vuelve a intentarlo para mejorar." :
        "No pasa nada: vuelve a leer con calma y conversa tus dudas. Aprende pensando.";
      result.innerHTML = `<div class="notice ${pct>=80 ? "notice--ok": "notice--warn"}"><b>${pct}%</b> (${correct}/${total}). ${escapeHtml(msg)}</div>`;
    }
  });

  $("[data-quiz-reset]", box)?.addEventListener("click", () => {
    localStorage.removeItem(key);
    $$("input[type=radio]", box).forEach((x) => (x.checked = false));
    if (result) result.innerHTML = "";
  });
}

function viewActivity(activityId) {
  const a = getActivity(activityId);
  if (!a) return viewNotFound("Actividad no encontrada.");
  setText("#routeKicker", "Actividad");
  setText("#routeTitle", a.titulo);

  $("#view").innerHTML = `
    <div class="grid">
      <div class="card" style="grid-column: span 12;">
        <h2 class="card__title">${escapeHtml(a.titulo)}</h2>
        <p class="card__subtitle">${escapeHtml(a.proposito)}</p>
        <div class="card__meta">
          <span class="chip chip--brand">${escapeHtml(a.tipo)}</span>
          <span class="chip">${escapeHtml(a.tiempo)}</span>
          <span class="chip">${escapeHtml(a.modalidad)}</span>
        </div>
      </div>
      <div class="card card--soft" style="grid-column: span 12;">
        <div class="prose">
          <p><b>Producto esperado:</b> ${escapeHtml(a.producto)}</p>
          <h3>Paso a paso</h3>
          <ul>${(a.pasos || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
          <h3>Criterios de calidad</h3>
          <ul>${(a.criterios || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
          <h3>Consejo pedagógico</h3>
          <p>${escapeHtml(a.consejo)}</p>
        </div>
      </div>
      <div class="card card--soft" style="grid-column: span 12;">
        <h3 class="card__title" style="font-size:16px;">Guarda tu evidencia en el Portafolio</h3>
        <p class="card__subtitle">Puedes subir un texto, una foto o un audio como evidencia del trabajo. Todo queda guardado en tu dispositivo.</p>
        <a class="btn btn--brand" href="#/portafolio">Abrir portafolio</a>
      </div>
    </div>
  `;
}

async function viewPortfolio() {
  setText("#routeKicker", "Portafolio");
  setText("#routeTitle", "Evidencias offline (sin servidor)");

  const evidences = await idbGetAll("evidences", "by_createdAt");
  evidences.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const list = evidences.length ? evidences.map((e) => {
    const preview =
      e.type === "texto" ? `<div class="muted" style="margin-top:8px; line-height:1.5">${escapeHtml(String(e.content || "").slice(0, 180))}${String(e.content||"").length>180 ? "…":""}</div>` :
      e.type === "imagen" ? `<img alt="Evidencia" src="${escapeHtml(e.content)}" style="width:100%; max-height:220px; object-fit:cover; border-radius:14px; border:1px solid rgba(255,255,255,.10); margin-top:10px"/>` :
      e.type === "audio" ? `<audio controls preload="none" src="${escapeHtml(e.content)}" style="width:100%; margin-top:10px"></audio>` :
      "";

    return `
      <div class="item">
        <div class="row">
          <div>
            <div class="item__title">${escapeHtml(e.titulo || "(Sin título)")}</div>
            <p class="item__sub">${escapeHtml(e.descripcion || "")}</p>
            <div class="card__meta" style="margin-top:8px">
              <span class="chip chip--brand">${escapeHtml(e.type)}</span>
              <span class="chip">Creado: ${escapeHtml(fmtDate(e.createdAt))}</span>
              ${e.updatedAt ? `<span class="chip">Editado: ${escapeHtml(fmtDate(e.updatedAt))}</span>` : ""}
            </div>
          </div>
          <span class="spacer"></span>
          <button class="btn btn--soft" type="button" data-ev-edit="${escapeHtml(e.id)}">Editar</button>
          <button class="btn btn--danger" type="button" data-ev-del="${escapeHtml(e.id)}">Eliminar</button>
        </div>
        ${preview}
      </div>
    `;
  }).join("") : `<div class="notice">Aún no tienes evidencias guardadas. Crea la primera abajo.</div>`;

  $("#view").innerHTML = `
    <div class="grid">
      <div class="card card--soft" style="grid-column: span 12;">
        <h2 class="card__title">Portafolio digital (offline-first)</h2>
        <p class="card__subtitle">
          Este portafolio funciona sin internet y sin servidor. Guarda textos escritos por el estudiante, fotos (base64) y audios (base64),
          para conservar evidencia del aprendizaje: lecturas en voz alta, entrevistas, relatos, diarios de campo, etc.
        </p>
        <div class="card__meta">
          <span class="chip chip--ok">IndexedDB (más capacidad que LocalStorage)</span>
          <span class="chip">Edición y eliminación</span>
          <span class="chip">Privacidad: los datos quedan en tu dispositivo</span>
        </div>
      </div>

      <div class="card" style="grid-column: span 12;">
        <h3 class="card__title" style="font-size:16px;">Mis evidencias</h3>
        <div class="list" id="evList">${list}</div>
      </div>

      <div class="card card--soft" style="grid-column: span 12;">
        <h3 class="card__title" style="font-size:16px;">Crear / editar evidencia</h3>
        <div class="grid" style="gap:12px">
          <div style="grid-column: span 12;">
            <div class="row">
              <div class="chip chip--brand" id="evMode">Nueva evidencia</div>
              <span class="spacer"></span>
              <button class="btn btn--soft" id="evClear" type="button">Limpiar formulario</button>
            </div>
          </div>
          <div style="grid-column: span 12;">
            <label class="field">
              <span class="field__label">Tipo</span>
              <select id="evType">
                <option value="texto">Texto</option>
                <option value="imagen">Imagen</option>
                <option value="audio">Audio</option>
              </select>
            </label>
          </div>
          <div style="grid-column: span 12;">
            <label class="field">
              <span class="field__label">Título</span>
              <input class="input" id="evTitle" placeholder="Ej. Relato del camino a la escuela / Informe de lectura / Entrevista a un mayor..." />
            </label>
          </div>
          <div style="grid-column: span 12;">
            <label class="field">
              <span class="field__label">Descripción (opcional)</span>
              <input class="input" id="evDesc" placeholder="¿Qué aprendiste? ¿Qué te costó? ¿Qué harías diferente?" />
            </label>
          </div>
          <div style="grid-column: span 12;" id="evTextWrap">
            <label class="field">
              <span class="field__label">Contenido (texto)</span>
              <textarea class="textarea" id="evText" placeholder="Escribe aquí tu evidencia..."></textarea>
            </label>
          </div>
          <div style="grid-column: span 12; display:none" id="evFileWrap">
            <label class="field">
              <span class="field__label">Archivo (imagen o audio)</span>
              <input class="input" id="evFile" type="file" />
            </label>
            <div class="notice" style="margin-top:10px">
              Importante: el archivo se convierte a base64 y se guarda en tu dispositivo. Para audios largos, usa compresión o fragmenta.
            </div>
          </div>
          <div style="grid-column: span 12;">
            <button class="btn btn--brand" id="evSave" type="button">Guardar evidencia</button>
            <div id="evMsg" style="margin-top:10px"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  wirePortfolioHandlers();
}

function viewGlossaryPage() {
  setText("#routeKicker", "Glosario");
  setText("#routeTitle", "Glosario indígena (panel flotante)");
  $("#view").innerHTML = `
    <div class="grid">
      <div class="card card--soft" style="grid-column: span 12;">
        <h2 class="card__title">Glosario indígena</h2>
        <p class="card__subtitle">
          El glosario está disponible como panel lateral (botón flotante 🌿). Está pensado para apoyar el bilingüismo intercultural:
          palabras y expresiones con descripción amplia y contexto de uso rural real. Puedes subir audios de pronunciación por término y
          quedarán guardados offline.
        </p>
        <div class="divider"></div>
        <div class="row">
          <button class="btn btn--brand" type="button" id="openGlossaryFromPage">Abrir panel de glosario</button>
          <span class="muted">Términos disponibles: <b>${(state.glosario?.terminos || []).length}</b></span>
        </div>
      </div>
      <div class="card" style="grid-column: span 12;">
        <h3 class="card__title" style="font-size:16px;">¿Cómo usarlo en clase?</h3>
        <div class="prose">
          <p>
            Puedes abrir el panel durante una lectura y buscar palabras clave: territorio, convivencia, aprendizaje, comunidad.
            Si estás trabajando con estudiantes que hablan una lengua indígena (o la están aprendiendo), invita a quienes conozcan la palabra
            a explicar su uso en una situación real: en la chagra, en la reunión, en la caminata, en la minga.
          </p>
          <p>
            Para fortalecer la oralidad, graba audios de pronunciación: una voz joven y una voz mayor. Después, escuchen y comparen cómo suena,
            qué ritmo tiene y qué sentimientos evoca. La lengua no es solo “traducción”: es memoria y forma de mirar el mundo.
          </p>
          <p>
            El glosario no pretende reemplazar procesos comunitarios de revitalización lingüística. Es un apoyo escolar y una invitación a cuidar
            las palabras del territorio.
          </p>
        </div>
      </div>
    </div>
  `;

  $("#openGlossaryFromPage")?.addEventListener("click", () => $("#glosarioFab")?.click());
}

function viewNotFound(message) {
  setText("#routeKicker", "Ruta");
  setText("#routeTitle", "No encontrada");
  $("#view").innerHTML = `
    <div class="grid">
      <div class="card" style="grid-column: span 12;">
        <h2 class="card__title">No encontrado</h2>
        <p class="card__subtitle">${escapeHtml(message || "La ruta solicitada no existe.")}</p>
        <div class="row">
          <a class="btn btn--brand" href="#/">Volver al inicio</a>
          <a class="btn" href="#/cursos">Ir a cursos</a>
        </div>
      </div>
    </div>
  `;
}

// --- Portafolio wiring ---
function wirePortfolioHandlers() {
  const typeSel = $("#evType");
  const wrapText = $("#evTextWrap");
  const wrapFile = $("#evFileWrap");
  const fileInput = $("#evFile");
  const msg = $("#evMsg");
  const mode = $("#evMode");

  let editingId = null;
  let pendingDataUrl = "";

  function setModeText() {
    if (!mode) return;
    mode.textContent = editingId ? `Editando: ${editingId}` : "Nueva evidencia";
  }
  function setMsg(html) {
    if (msg) msg.innerHTML = html || "";
  }
  function setWraps() {
    const t = typeSel?.value || "texto";
    if (wrapText) wrapText.style.display = t === "texto" ? "block" : "none";
    if (wrapFile) wrapFile.style.display = t !== "texto" ? "block" : "none";
    if (fileInput) {
      fileInput.accept = t === "imagen" ? "image/*" : t === "audio" ? "audio/*" : "*/*";
      fileInput.value = "";
    }
    pendingDataUrl = "";
  }

  typeSel?.addEventListener("change", setWraps);
  setWraps();

  fileInput?.addEventListener("change", async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    try {
      pendingDataUrl = await fileToDataURL(f);
      setMsg(`<div class="notice notice--ok">Archivo cargado listo para guardar.</div>`);
    } catch {
      setMsg(`<div class="notice notice--warn">No se pudo leer el archivo. Intenta de nuevo.</div>`);
    }
  });

  $("#evClear")?.addEventListener("click", () => {
    editingId = null;
    setModeText();
    setMsg("");
    $("#evTitle").value = "";
    $("#evDesc").value = "";
    $("#evText").value = "";
    typeSel.value = "texto";
    setWraps();
  });

  $("#evSave")?.addEventListener("click", async () => {
    const type = typeSel?.value || "texto";
    const titulo = $("#evTitle")?.value?.trim() || "";
    const descripcion = $("#evDesc")?.value?.trim() || "";
    const contentText = $("#evText")?.value || "";

    let content = "";
    if (type === "texto") content = contentText.trim();
    else content = pendingDataUrl;

    if (!titulo || !content) {
      setMsg(`<div class="notice notice--warn">Falta información: agrega un título y el contenido (texto o archivo).</div>`);
      return;
    }

    const now = Date.now();
    const ev = {
      id: editingId || uid("ev"),
      type,
      titulo,
      descripcion,
      content,
      createdAt: editingId ? (await idbGet("evidences", editingId))?.createdAt || now : now,
      updatedAt: editingId ? now : null,
    };

    await idbPut("evidences", ev);
    setMsg(`<div class="notice notice--ok">Evidencia guardada. Se recargará la lista.</div>`);

    // recargar vista
    setTimeout(() => {
      location.hash = "#/portafolio";
    }, 350);
  });

  $("#evList")?.addEventListener("click", async (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const del = t.getAttribute("data-ev-del");
    const edit = t.getAttribute("data-ev-edit");

    if (del) {
      await idbDelete("evidences", del);
      setTimeout(() => (location.hash = "#/portafolio"), 50);
      return;
    }

    if (edit) {
      const ev = await idbGet("evidences", edit);
      if (!ev) return;
      editingId = ev.id;
      setModeText();
      typeSel.value = ev.type;
      setWraps();
      $("#evTitle").value = ev.titulo || "";
      $("#evDesc").value = ev.descripcion || "";
      if (ev.type === "texto") $("#evText").value = ev.content || "";
      else {
        pendingDataUrl = ev.content || "";
        setMsg(`<div class="notice notice--ok">Evidencia cargada. Si quieres cambiar el archivo, selecciona uno nuevo.</div>`);
      }
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    }
  });

  setModeText();
}

// --- Sidebar + offline status + SW ---
function setupShell() {
  const sidebar = $("#sidebar");
  const btnToggle = $("#btnToggleSidebar");
  const backdrop = $("#drawerBackdrop");

  btnToggle?.addEventListener("click", () => {
    sidebar?.classList.toggle("is-open");
    if (window.innerWidth <= 980 && backdrop) backdrop.hidden = !sidebar?.classList.contains("is-open");
  });
}

function updateOfflinePill() {
  const el = $("#offlineStatus");
  const dot = $(".pill__dot");
  const online = navigator.onLine;
  if (el) el.textContent = online ? "Conectado (cache disponible)" : "Sin conexión (offline)";
  if (dot) {
    dot.style.background = online ? "var(--good)" : "var(--warn)";
    dot.style.boxShadow = online ? "0 0 0 6px rgba(48,209,88,.12)" : "0 0 0 6px rgba(255,204,0,.12)";
  }
}

async function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch {
    // opcional: sin SW la app igual funciona
  }
}

// --- App init ---
const router = new Router();

async function boot() {
  setupShell();
  setupGlossaryUI();
  updateOfflinePill();
  window.addEventListener("online", updateOfflinePill);
  window.addEventListener("offline", updateOfflinePill);

  $("#btnRecargarDatos")?.addEventListener("click", async () => {
    localStorage.removeItem(CACHE_KEY);
    await loadAllData({ force: true });
    router.go(getHashPath());
  });

  await loadAllData();
  await registerSW();
  await renderGlossaryList("");

  router
    .add("/", () => viewHome())
    .add("/cursos", () => viewCourses())
    .add("/cursos/:courseId", ({ params }) => viewCourseDetail(params.courseId))
    .add("/cursos/:courseId/modulo/:moduleId", ({ params }) => viewModule(params.courseId, params.moduleId))
    .add("/leccion/:lessonId", async ({ params }) => await viewLesson(params.lessonId))
    .add("/actividad/:activityId", ({ params }) => viewActivity(params.activityId))
    .add("/portafolio", async () => await viewPortfolio())
    .add("/glosario", () => viewGlossaryPage())
    .start();
}

// marcar navegación activa en cada cambio
window.addEventListener("hashchange", () => setActiveNav(getHashPath()));
window.addEventListener("load", () => setActiveNav(getHashPath()));

boot().catch((e) => {
  console.error(e);
  viewNotFound("No se pudo iniciar la app. Revisa que los archivos JSON existan y que estés sirviendo el proyecto desde un hosting/servidor estático.");
});

