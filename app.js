// js/app.js
//
// Test de Perfiles de Credibilidad — simulador sin autenticación.
// Lee preguntas de Firestore (solo lectura pública), no escribe nada
// en la base de datos. El resultado se calcula y se muestra solo en
// pantalla.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ─────────────────────────────────────────────────────────
// 1. Configuración de Firebase
//    IMPORTANTE: reemplaza esto con el firebaseConfig real,
//    copiado desde Firebase Console (no desde Google Cloud),
//    de TU proyecto. Cada proyecto nuevo requiere su propio
//    firebaseConfig — nada se hereda de un proyecto anterior.
// ─────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ─────────────────────────────────────────────────────────
// 2. Configuración de las 4 dimensiones (Los 4 Núcleos de la
//    Credibilidad). El texto de tendencia es descriptivo, no
//    evaluativo: no hay nota, ni "aprobado/reprobado".
// ─────────────────────────────────────────────────────────
const DIMENSIONES = {
  Integridad: {
    clave: "integridad",
    color: "var(--color-integridad)",
    colorHex: "#2563eb",
    descripcionCorta: "Honestidad, coherencia y firmeza en tus valores.",
    feedback: {
      baja:
        "En tu día a día, es frecuente que la coherencia entre lo que piensas, dices y haces se vea comprometida. Podría valer la pena identificar en qué situaciones concretas te cuesta más actuar según tus valores, y empezar por ahí.",
      media:
        "Muestras una coherencia razonable entre tus valores y tus acciones, aunque no siempre de forma constante. Reconocer los momentos en que te alejas de tus propios estándares puede ayudarte a fortalecer esta dimensión.",
      alta:
        "Tu conducta cotidiana muestra una fuerte coherencia entre lo que piensas, dices y haces, y una defensa clara de tus valores. Esta base sólida suele ser la que más rápido genera confianza en los demás.",
    },
  },
  Intención: {
    clave: "intencion",
    color: "var(--color-intencion)",
    colorHex: "#16a34a",
    descripcionCorta: "El motivo detrás de tus acciones y tu preocupación por los demás.",
    feedback: {
      baja:
        "En tus relaciones cotidianas, tiendes a priorizar tus propios intereses sin detenerte demasiado a pensar en el impacto sobre los demás. Explorar qué hay detrás de tus motivaciones en distintas situaciones puede abrir camino a relaciones más sólidas.",
      media:
        "Tienes cierta consciencia de tus motivos y del bienestar de los demás, aunque esto no siempre se traduce en buscar activamente soluciones de beneficio mutuo. Profundizar en el 'para qué' de tus acciones puede fortalecer esta dimensión.",
      alta:
        "Tu conducta cotidiana refleja una preocupación genuina por el bienestar de los demás y una búsqueda activa de soluciones que beneficien a todas las partes. Esta intención suele percibirse con claridad por quienes te rodean.",
    },
  },
  Capacidades: {
    clave: "capacidades",
    color: "var(--color-capacidades)",
    colorHex: "#d97706",
    descripcionCorta: "Talentos, conocimientos y aptitudes puestos al servicio de tu trabajo.",
    feedback: {
      baja:
        "Es posible que sientas que tus talentos no están del todo aprovechados, o que la actualización de tus conocimientos y aptitudes no sea una prioridad constante. Identificar una fortaleza concreta para desarrollar puede ser un buen punto de partida.",
      media:
        "Cuentas con conocimientos y aptitudes razonablemente alineados con tu trabajo, aunque el desarrollo continuo de tus capacidades no siempre es constante. Sistematizar espacios de aprendizaje podría fortalecer esta dimensión.",
      alta:
        "Tu conducta cotidiana muestra un buen aprovechamiento de tus talentos y una actualización constante de tus conocimientos y aptitudes. Esta dimensión suele traducirse en mayor efectividad percibida por los demás.",
    },
  },
  Resultados: {
    clave: "resultados",
    color: "var(--color-resultados)",
    colorHex: "#7c3aed",
    descripcionCorta: "Tu historial de logros y la forma en que obtienes resultados.",
    feedback: {
      baja:
        "Es posible que te cueste terminar lo que empiezas, o que la forma en que comunicas y logras tus resultados no siempre inspire confianza en los demás. Elegir un compromiso pequeño y llevarlo hasta el final puede ser un buen primer paso.",
      media:
        "Sueles obtener resultados razonables, aunque de forma no siempre constante o visible para los demás. Prestar atención tanto a lo que logras como a la forma en que lo logras puede fortalecer esta dimensión.",
      alta:
        "Tu conducta cotidiana muestra un historial sólido de resultados, obtenidos de manera constante y en formas que generan confianza en los demás. Esta dimensión suele ser la que más rápido se hace visible para quienes te rodean.",
    },
  },
};

const ORDEN_DIMENSIONES = ["Integridad", "Intención", "Capacidades", "Resultados"];

// ─────────────────────────────────────────────────────────
// 3. Estado de la aplicación
// ─────────────────────────────────────────────────────────
let preguntas = [];
let respuestas = {}; // { [preguntaId]: valor 1..5 }
let indiceActual = 0;

const appEl = document.getElementById("app");

// ─────────────────────────────────────────────────────────
// 4. Carga y validación defensiva de preguntas
// ─────────────────────────────────────────────────────────
async function iniciar() {
  mostrarCargando();
  try {
    const snap = await getDocs(collection(db, "preguntas"));
    const validas = [];

    snap.forEach((doc) => {
      const datos = doc.data();
      if (validarPregunta(datos, doc.id)) {
        validas.push({ id: doc.id, ...datos });
      }
    });

    // Orden en el cliente (no usar orderBy en la query: si algún
    // documento no tiene "orden", orderBy lo excluiría en silencio).
    validas.sort((a, b) => {
      const oa = typeof a.orden === "number" ? a.orden : Number.MAX_SAFE_INTEGER;
      const ob = typeof b.orden === "number" ? b.orden : Number.MAX_SAFE_INTEGER;
      return oa - ob;
    });

    preguntas = validas;

    if (preguntas.length === 0) {
      mostrarError(
        "No se encontraron preguntas válidas en la colección \"preguntas\" de Firestore. Revisa la consola del navegador para más detalles."
      );
      return;
    }

    mostrarBienvenida();
  } catch (err) {
    console.error("Error al cargar preguntas desde Firestore:", err);
    mostrarError(
      "No se pudo conectar con Firestore. Verifica el firebaseConfig, las reglas publicadas y la consola del navegador."
    );
  }
}

function validarPregunta(datos, id) {
  const camposTexto = ["título", "dimensión", "poloMínimo", "poloMáximo"];
  for (const campo of camposTexto) {
    if (typeof datos[campo] !== "string" || datos[campo].trim() === "") {
      console.warn(`Pregunta ${id}: falta o tiene tipo inválido el campo "${campo}". Se omitió.`);
      return false;
    }
  }
  if (!DIMENSIONES[datos["dimensión"]]) {
    console.warn(`Pregunta ${id}: dimensión "${datos["dimensión"]}" no reconocida. Se omitió.`);
    return false;
  }
  if (datos.orden !== undefined && typeof datos.orden !== "number") {
    console.warn(`Pregunta ${id}: el campo "orden" no es numérico; se ignorará para ordenar.`);
  }
  return true;
}

// ─────────────────────────────────────────────────────────
// 5. Pantallas
// ─────────────────────────────────────────────────────────
function mostrarCargando() {
  appEl.innerHTML = `<div class="estado-carga">Cargando simulador…</div>`;
}

function mostrarError(mensaje) {
  const div = document.createElement("div");
  div.className = "card";
  const aviso = document.createElement("div");
  aviso.className = "aviso aviso-error";
  aviso.textContent = mensaje;
  div.appendChild(aviso);
  appEl.innerHTML = "";
  appEl.appendChild(div);
}

function mostrarBienvenida() {
  respuestas = {};
  indiceActual = 0;

  const div = document.createElement("div");
  div.className = "card";

  const h2 = document.createElement("h2");
  h2.textContent = "Test de Perfiles de Credibilidad";
  div.appendChild(h2);

  const intro = document.createElement("p");
  intro.textContent =
    "Este instrumento se basa en el modelo de los cuatro núcleos de la credibilidad: integridad, intención, capacidades y resultados. Para cada situación verás dos descripciones de conducta — una y otra — y deberás indicar, en una escala del 1 al 5, cuál se acerca más a tu conducta habitual en la vida cotidiana.";
  div.appendChild(intro);

  const nota = document.createElement("p");
  nota.innerHTML =
    "<strong>No hay respuestas correctas ni incorrectas.</strong> El resultado no es una nota ni un puntaje de aprobado/reprobado: es una retroalimentación descriptiva sobre tu tendencia en cada dimensión.";
  div.appendChild(nota);

  const grid = document.createElement("div");
  grid.className = "dimensiones-grid";
  ORDEN_DIMENSIONES.forEach((nombre) => {
    const info = DIMENSIONES[nombre];
    const chip = document.createElement("div");
    chip.className = `dimension-chip ${info.clave}`;
    chip.innerHTML = `<strong>${nombre}</strong>${info.descripcionCorta}`;
    grid.appendChild(chip);
  });
  div.appendChild(grid);

  const acciones = document.createElement("div");
  acciones.className = "acciones";
  const btn = document.createElement("button");
  btn.className = "btn-primary acciones-derecha";
  btn.textContent = "Comenzar evaluación";
  btn.addEventListener("click", () => mostrarPregunta(0));
  acciones.appendChild(btn);
  div.appendChild(acciones);

  appEl.innerHTML = "";
  appEl.appendChild(div);
}

function mostrarPregunta(indice) {
  indiceActual = indice;
  const pregunta = preguntas[indice];
  const info = DIMENSIONES[pregunta["dimensión"]];
  const total = preguntas.length;
  const valorGuardado = respuestas[pregunta.id];

  const div = document.createElement("div");
  div.className = "card";

  // Progreso
  const progresoWrap = document.createElement("div");
  progresoWrap.className = "progreso-wrap";
  const progresoTexto = document.createElement("div");
  progresoTexto.className = "progreso-texto";
  progresoTexto.innerHTML = `<span>Pregunta ${indice + 1} de ${total}</span><span>${Math.round(((indice) / total) * 100)}% completado</span>`;
  progresoWrap.appendChild(progresoTexto);
  const barra = document.createElement("div");
  barra.className = "progreso-barra";
  const barraInterior = document.createElement("div");
  barraInterior.className = "progreso-barra-interior";
  barraInterior.style.width = `${(indice / total) * 100}%`;
  barra.appendChild(barraInterior);
  progresoWrap.appendChild(barra);
  div.appendChild(progresoWrap);

  // Etiqueta de dimensión
  const etiqueta = document.createElement("span");
  etiqueta.className = "etiqueta-dimension";
  etiqueta.style.background = info.color;
  etiqueta.textContent = pregunta["dimensión"];
  div.appendChild(etiqueta);

  const h2 = document.createElement("h2");
  h2.textContent = pregunta["título"];
  div.appendChild(h2);

  // Los dos polos
  const polos = document.createElement("div");
  polos.className = "polos";

  const poloMin = document.createElement("div");
  poloMin.className = "polo";
  poloMin.innerHTML = `<span class="num">1</span><p>${escaparTexto(pregunta["poloMínimo"])}</p>`;
  polos.appendChild(poloMin);

  const poloMax = document.createElement("div");
  poloMax.className = "polo";
  poloMax.innerHTML = `<span class="num">5</span><p>${escaparTexto(pregunta["poloMáximo"])}</p>`;
  polos.appendChild(poloMax);

  div.appendChild(polos);

  // Escala 1-5
  const leyenda = document.createElement("div");
  leyenda.className = "escala-leyenda";
  leyenda.innerHTML = `<span>Más cercano a la conducta 1</span><span>Más cercano a la conducta 5</span>`;
  div.appendChild(leyenda);

  const escala = document.createElement("div");
  escala.className = "escala";
  for (let v = 1; v <= 5; v++) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "escala";
    input.value = String(v);
    if (valorGuardado === v) input.checked = true;
    input.addEventListener("change", () => {
      respuestas[pregunta.id] = v;
      btnSiguiente.disabled = false;
    });
    label.appendChild(input);
    const span = document.createElement("span");
    span.textContent = String(v);
    label.appendChild(span);
    escala.appendChild(label);
  }
  div.appendChild(escala);

  // Acciones
  const acciones = document.createElement("div");
  acciones.className = "acciones";

  const btnAtras = document.createElement("button");
  btnAtras.className = "btn-secondary";
  btnAtras.textContent = "Atrás";
  btnAtras.disabled = indice === 0;
  btnAtras.addEventListener("click", () => mostrarPregunta(indice - 1));
  acciones.appendChild(btnAtras);

  const btnSiguiente = document.createElement("button");
  btnSiguiente.className = "btn-primary acciones-derecha";
  btnSiguiente.textContent = indice === total - 1 ? "Ver resultados" : "Siguiente";
  btnSiguiente.disabled = valorGuardado === undefined;
  btnSiguiente.addEventListener("click", () => {
    if (indice === total - 1) {
      mostrarResultados();
    } else {
      mostrarPregunta(indice + 1);
    }
  });
  acciones.appendChild(btnSiguiente);

  div.appendChild(acciones);

  appEl.innerHTML = "";
  appEl.appendChild(div);
}

function mostrarResultados() {
  const promedios = calcularPromedios();

  const div = document.createElement("div");
  div.className = "card";

  const h2 = document.createElement("h2");
  h2.textContent = "Tu perfil de credibilidad";
  div.appendChild(h2);

  const intro = document.createElement("p");
  intro.textContent =
    "Esta es una lectura de tendencias, no una calificación. Úsala como punto de partida para una reflexión personal sobre tu conducta habitual en cada dimensión.";
  div.appendChild(intro);

  ORDEN_DIMENSIONES.forEach((nombre) => {
    const info = DIMENSIONES[nombre];
    const promedio = promedios[nombre]; // 1..5 o null si no hubo preguntas de esa dimensión
    if (promedio === null) return;

    const porcentaje = ((promedio - 1) / 4) * 100;
    const nivel = obtenerNivel(promedio);

    const bloque = document.createElement("div");
    bloque.className = "resultado-dimension";

    const titulo = document.createElement("div");
    titulo.className = "resultado-titulo";
    titulo.innerHTML = `<strong>${nombre}</strong><span>${promedio.toFixed(1)} / 5</span>`;
    bloque.appendChild(titulo);

    const barra = document.createElement("div");
    barra.className = "barra-resultado";
    const barraInterior = document.createElement("div");
    barraInterior.className = "barra-resultado-interior";
    barraInterior.style.width = `${porcentaje}%`;
    barraInterior.style.background = info.color;
    barra.appendChild(barraInterior);
    bloque.appendChild(barra);

    const texto = document.createElement("p");
    texto.className = "resultado-texto";
    texto.textContent = info.feedback[nivel];
    bloque.appendChild(texto);

    div.appendChild(bloque);
  });

  const nota = document.createElement("div");
  nota.className = "nota-final";
  nota.textContent =
    "Tus respuestas no se guardan en ningún servidor: este resultado solo existe en esta pantalla. Si cierras o recargas la página, se perderá.";
  div.appendChild(nota);

  const acciones = document.createElement("div");
  acciones.className = "acciones";

  const btnReiniciar = document.createElement("button");
  btnReiniciar.className = "btn-secondary";
  btnReiniciar.textContent = "Volver a empezar";
  btnReiniciar.addEventListener("click", () => mostrarBienvenida());
  acciones.appendChild(btnReiniciar);

  const btnPDF = document.createElement("button");
  btnPDF.className = "btn-primary acciones-derecha";
  btnPDF.textContent = "Descargar PDF";
  btnPDF.addEventListener("click", () => exportarPDF(promedios));
  acciones.appendChild(btnPDF);

  div.appendChild(acciones);

  appEl.innerHTML = "";
  appEl.appendChild(div);
}

// ─────────────────────────────────────────────────────────
// 6. Utilidades
// ─────────────────────────────────────────────────────────
function calcularPromedios() {
  const sumas = {};
  const conteos = {};
  ORDEN_DIMENSIONES.forEach((n) => {
    sumas[n] = 0;
    conteos[n] = 0;
  });

  preguntas.forEach((pregunta) => {
    const valor = respuestas[pregunta.id];
    if (typeof valor === "number") {
      const dim = pregunta["dimensión"];
      sumas[dim] += valor;
      conteos[dim] += 1;
    }
  });

  const promedios = {};
  ORDEN_DIMENSIONES.forEach((n) => {
    promedios[n] = conteos[n] > 0 ? sumas[n] / conteos[n] : null;
  });
  return promedios;
}

function obtenerNivel(promedio) {
  if (promedio < 2.5) return "baja";
  if (promedio < 3.75) return "media";
  return "alta";
}

function escaparTexto(texto) {
  const d = document.createElement("div");
  d.textContent = texto;
  return d.innerHTML;
}

function hexARgb(hex) {
  const limpio = hex.replace("#", "");
  return {
    r: parseInt(limpio.substring(0, 2), 16),
    g: parseInt(limpio.substring(2, 4), 16),
    b: parseInt(limpio.substring(4, 6), 16),
  };
}

function exportarPDF(promedios) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    console.error("jsPDF no está disponible. Verifica que el script de jsPDF esté cargado en index.html.");
    alert("No se pudo generar el PDF. Intenta recargar la página.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const margenIzq = 48;
  const anchoContenido = doc.internal.pageSize.getWidth() - margenIzq * 2;
  let y = 60;

  // Encabezado
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(30, 58, 95); // #1E3A5F
  doc.text("Test de Perfiles de Credibilidad", margenIzq, y);

  y += 22;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  const fecha = new Date().toLocaleDateString("es-PE", { year: "numeric", month: "long", day: "numeric" });
  doc.text(`Resultado generado el ${fecha}`, margenIzq, y);

  y += 14;
  doc.text("Curso: Gestión de las Relaciones en las Organizaciones", margenIzq, y);

  y += 26;
  doc.setFontSize(10);
  doc.setTextColor(55, 65, 81);
  const notaLineas = doc.splitTextToSize(
    "Esta es una lectura de tendencias, no una calificación. No hay respuestas correctas ni incorrectas, ni un puntaje de aprobado/reprobado.",
    anchoContenido
  );
  doc.text(notaLineas, margenIzq, y);
  y += notaLineas.length * 13 + 16;

  // Una sección por dimensión
  ORDEN_DIMENSIONES.forEach((nombre) => {
    const info = DIMENSIONES[nombre];
    const promedio = promedios[nombre];
    if (promedio === null) return;

    // Salto de página si no queda espacio suficiente
    if (y > doc.internal.pageSize.getHeight() - 140) {
      doc.addPage();
      y = 60;
    }

    const nivel = obtenerNivel(promedio);
    const porcentaje = (promedio - 1) / 4;
    const { r, g, b } = hexARgb(info.colorHex);

    // Título + puntaje
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(17, 24, 39);
    doc.text(nombre, margenIzq, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(107, 114, 128);
    doc.text(`${promedio.toFixed(1)} / 5`, margenIzq + anchoContenido - 40, y);

    y += 10;

    // Barra de progreso
    const alturaBarra = 8;
    doc.setFillColor(229, 231, 235);
    doc.roundedRect(margenIzq, y, anchoContenido, alturaBarra, 4, 4, "F");
    doc.setFillColor(r, g, b);
    doc.roundedRect(margenIzq, y, anchoContenido * porcentaje, alturaBarra, 4, 4, "F");

    y += alturaBarra + 14;

    // Texto de retroalimentación
    doc.setFontSize(10.5);
    doc.setTextColor(55, 65, 81);
    const lineas = doc.splitTextToSize(info.feedback[nivel], anchoContenido);
    doc.text(lineas, margenIzq, y);
    y += lineas.length * 13 + 22;
  });

  // Pie de página
  if (y > doc.internal.pageSize.getHeight() - 60) {
    doc.addPage();
    y = 60;
  }
  doc.setFontSize(9);
  doc.setTextColor(156, 163, 175);
  const piePagina = doc.splitTextToSize(
    "Este documento fue generado localmente en tu navegador; las respuestas no se almacenaron en ningún servidor.",
    anchoContenido
  );
  doc.text(piePagina, margenIzq, doc.internal.pageSize.getHeight() - 40);

  doc.save("perfil-de-credibilidad.pdf");
}

// ─────────────────────────────────────────────────────────
// 7. Arranque
// ─────────────────────────────────────────────────────────
iniciar();
