/**
 * Control de pagos — Casa de Campo
 * Estado en memoria sincronizado con Supabase (tablas "personas" y "pagos").
 * Flujo: cada acción escribe primero en Supabase; si responde bien, se
 * actualiza el estado local y se vuelve a pintar la pantalla.
 */

// La "publishable key" es pública por diseño (pensada para el navegador);
// la protección real de los datos está en las políticas RLS del proyecto.
const SUPABASE_URL = "https://sykuuyfvxllrgkmluwng.supabase.co";
const SUPABASE_KEY = "sb_publishable_-pL3dg7etGrYnvza5NWh7Q_cEp3W1X3";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ---------- Íconos (SVG inline, sin emojis) ---------- */

const ICONOS = {
  chevron: '<path d="M9 6l6 6-6 6"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  papelera: '<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6.5 7 7.3 19a1 1 0 0 0 1 .9h7.4a1 1 0 0 0 1-.9L18.5 7"/><path d="M10 11v6M14 11v6"/>',
  equis: '<path d="M6 6l12 12M18 6 6 18"/>',
  persona: '<circle cx="12" cy="8" r="3.2"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/>',
  yape: '<rect x="7.5" y="3" width="9" height="18" rx="2"/><path d="M11 18h2"/>',
  efectivo: '<rect x="2.5" y="6.5" width="19" height="11" rx="2"/><circle cx="12" cy="12" r="2.25"/><path d="M6 9.5h.01M18 14.5h.01"/>',
  plin: '<path d="M3.5 8h13l-3-3"/><path d="M20.5 16h-13l3 3"/>',
};

function svg(trazo, clase) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="${clase}">${trazo}</svg>`;
}

const ICONO_METODO_SVG = {
  Yape: svg(ICONOS.yape, "w-3.5 h-3.5"),
  Efectivo: svg(ICONOS.efectivo, "w-3.5 h-3.5"),
  Plin: svg(ICONOS.plin, "w-3.5 h-3.5"),
};

/* ---------- Estado ----------
 * estado.personas: [{ id, nombre, cuota, pagado, pagos: [{ id, monto, metodo }] }]
 */

let estado = { personas: [] };

async function cargarDesdeSupabase() {
  const { data: personas, error: errorPersonas } = await db
    .from("personas")
    .select("*")
    .order("creado_en");

  if (errorPersonas) {
    alert("No se pudo conectar con la base de datos: " + errorPersonas.message);
    return;
  }

  const { data: pagos, error: errorPagos } = await db
    .from("pagos")
    .select("*")
    .order("creado_en");

  if (errorPagos) {
    alert("No se pudieron cargar los abonos: " + errorPagos.message);
    return;
  }

  // Supabase devuelve las columnas "numeric" como texto (para no perder
  // precisión), así que hay que convertirlas a Number acá.
  estado.personas = personas.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    cuota: Number(p.cuota),
    pagado: p.pagado,
    pagos: pagos
      .filter((pg) => pg.persona_id === p.id)
      .map((pg) => ({ id: pg.id, monto: Number(pg.monto), metodo: pg.metodo })),
  }));

  pintar();
}

/* ---------- Utilidades ---------- */

function soles(numero) {
  const valor = Number(numero) || 0;
  return "S/ " + valor.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function totalPagos(pagos) {
  return pagos.reduce((acumulado, pago) => acumulado + pago.monto, 0);
}

// Escapa texto antes de insertarlo en innerHTML (nombre y método vienen
// de inputs del usuario).
function escapar(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// Si "pagado" está marcado a mano, se cuenta la cuota completa aunque no
// haya abonos registrados uno por uno.
function montoPagado(persona) {
  return persona.pagado ? persona.cuota : totalPagos(persona.pagos);
}

/* ---------- Pintado ---------- */

function pintar() {
  const totalMeta = estado.personas.reduce((acc, p) => acc + p.cuota, 0);
  const totalRecaudado = estado.personas.reduce((acc, p) => acc + montoPagado(p), 0);

  document.getElementById("txt-meta").textContent = soles(totalMeta);
  document.getElementById("txt-recaudado").textContent = soles(totalRecaudado);
  document.getElementById("txt-falta").textContent = soles(Math.max(totalMeta - totalRecaudado, 0));

  const contenedorLista = document.getElementById("lista");
  contenedorLista.innerHTML = "";
  contenedorLista.className = "";

  if (estado.personas.length === 0) {
    contenedorLista.innerHTML = `
      <div class="rounded-2xl border border-dashed border-gray-200 py-12 text-center">
        <div class="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-gray-50 text-gray-300">
          ${svg(ICONOS.persona, "w-4 h-4")}
        </div>
        <p class="text-gray-500 text-sm">Agrega a los primeros invitados con su monto a pagar.</p>
      </div>`;
    return;
  }

  contenedorLista.className = "rounded-2xl border border-gray-100 divide-y divide-gray-100 overflow-hidden";

  // Pendiente primero, luego Parcial, Completo al final.
  const ORDEN_ESTADO = { Pendiente: 0, Parcial: 1, Completo: 2 };

  const filas = estado.personas.map((persona) => {
    const pagado = montoPagado(persona);
    const restante = Math.max(persona.cuota - pagado, 0);

    let estadoTxt = "Pendiente";
    let dot = "bg-rose-500";

    if (restante <= 0) {
      estadoTxt = "Completo";
      dot = "bg-emerald-500";
    } else if (pagado > 0) {
      estadoTxt = "Parcial";
      dot = "bg-amber-500";
    }

    return { persona, pagado, restante, estadoTxt, dot };
  });

  filas.sort((a, b) =>
    ORDEN_ESTADO[a.estadoTxt] - ORDEN_ESTADO[b.estadoTxt] ||
    a.persona.nombre.localeCompare(b.persona.nombre)
  );

  filas.forEach(({ persona, pagado, restante, estadoTxt, dot }) => {
    // <details> colapsado: una fila por persona, se expande al tocarla.
    const fila = document.createElement("details");
    fila.className = "px-1 py-3.5 first:pt-1";

    fila.innerHTML = `
      <summary class="flex justify-between items-center gap-3 cursor-pointer select-none">
        <div class="flex items-center gap-2.5 min-w-0">
          <input type="checkbox" data-marcar-pagado="${persona.id}" ${persona.pagado ? "checked" : ""}
            title="Marcar como pagado completo" onclick="event.stopPropagation()" />
          <p class="font-medium text-gray-900 truncate">${escapar(persona.nombre)}</p>
          <span class="inline-flex items-center gap-1.5 text-xs text-gray-500 shrink-0">
            <span class="w-1.5 h-1.5 rounded-full ${dot}"></span>
            ${estadoTxt}
          </span>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          <p class="text-xs whitespace-nowrap tabular-nums">
            <span class="text-emerald-600 font-medium">${soles(pagado)}</span>
            <span class="text-gray-300">/</span>
            <span class="${restante > 0 ? "text-rose-600" : "text-emerald-600"} font-medium">${soles(restante)}</span>
          </p>
          ${svg(ICONOS.chevron, "chevron w-4 h-4 text-gray-300")}
        </div>
      </summary>

      <div class="mt-4 pt-4 border-t border-gray-100">
        <div class="flex items-center gap-2 text-xs text-gray-500 mb-4">
          Debe pagar
          <input type="number" step="0.01" min="0" value="${persona.cuota}"
            data-editar-cuota="${persona.id}"
            class="rounded-lg border border-gray-200 px-2 py-1 w-24 text-xs outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
          <button class="ml-auto text-gray-300 hover:text-rose-500 transition" data-eliminar-persona="${persona.id}"
            title="Eliminar persona" aria-label="Eliminar persona">
            ${svg(ICONOS.papelera, "w-4 h-4")}
          </button>
        </div>

        <form class="space-y-2.5" data-form-pago="${persona.id}">
          <div class="flex gap-2">
            <input type="number" step="0.01" min="0" placeholder="Monto del abono" required
              class="flex-1 min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
            <button type="submit"
              class="shrink-0 flex items-center justify-center h-9 w-9 rounded-lg bg-brand-600 text-white transition hover:bg-brand-700 active:scale-95"
              aria-label="Agregar abono" title="Agregar abono">
              ${svg(ICONOS.mas, "w-4 h-4")}
            </button>
          </div>
          <div class="flex gap-1.5">
            ${["Yape", "Efectivo", "Plin"].map((m, i) => `
              <label class="flex-1">
                <input type="radio" name="metodo" value="${m}" class="peer sr-only" ${i === 0 ? "checked" : ""} />
                <span class="flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-1.5 text-xs text-gray-500 transition peer-checked:border-brand-300 peer-checked:bg-brand-50 peer-checked:text-brand-700">
                  ${ICONO_METODO_SVG[m]}
                  ${m}
                </span>
              </label>`).join("")}
          </div>
        </form>

        ${persona.pagos.length ? `
          <div class="border-t border-gray-100 mt-4 pt-3">
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Abonos registrados</p>
            <ul class="text-xs text-gray-500 space-y-1.5">
              ${persona.pagos.map(p => `
                <li class="flex justify-between items-center">
                  <span class="flex items-center gap-1.5 text-gray-400">
                    ${ICONO_METODO_SVG[p.metodo] || ""}
                    <span class="text-gray-500">${escapar(p.metodo)}</span>
                  </span>
                  <span class="flex gap-2.5 items-center tabular-nums">
                    ${soles(p.monto)}
                    <button data-eliminar-pago="${persona.id}|${p.id}" class="text-gray-300 hover:text-rose-500 transition" title="Quitar este abono" aria-label="Quitar este abono">
                      ${svg(ICONOS.equis, "w-3.5 h-3.5")}
                    </button>
                  </span>
                </li>`).join("")}
            </ul>
          </div>` : ""}
      </div>
    `;

    contenedorLista.appendChild(fila);
  });
}

/* ---------- Eventos ---------- */

document.getElementById("form-agregar").addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const inputNombre = document.getElementById("input-nombre");
  const inputCuota = document.getElementById("input-cuota");
  if (!inputNombre.value.trim() || !inputCuota.value) return;

  const nombre = inputNombre.value.trim();
  const cuota = parseFloat(inputCuota.value) || 0;

  const { data, error } = await db.from("personas").insert({ nombre, cuota }).select().single();
  if (error) {
    alert("No se pudo agregar: " + error.message);
    return;
  }

  estado.personas.push({ id: data.id, nombre: data.nombre, cuota: Number(data.cuota), pagado: data.pagado, pagos: [] });
  inputNombre.value = "";
  inputCuota.value = "";
  pintar();
});

// Cada persona tiene su propio <form> de abono, recreado en cada pintar();
// por eso se delega el evento en #lista en vez de engancharlo por tarjeta.
document.getElementById("lista").addEventListener("submit", async (evento) => {
  const formulario = evento.target.closest("[data-form-pago]");
  if (!formulario) return;
  evento.preventDefault();

  const personaId = formulario.getAttribute("data-form-pago");
  const monto = parseFloat(formulario.querySelector('input[type="number"]').value) || 0;
  const metodo = formulario.querySelector('input[name="metodo"]:checked').value;
  if (monto <= 0) return;

  const { data, error } = await db.from("pagos").insert({ persona_id: personaId, monto, metodo }).select().single();
  if (error) {
    alert("No se pudo registrar el abono: " + error.message);
    return;
  }

  const persona = estado.personas.find(p => p.id === personaId);
  persona.pagos.push({ id: data.id, monto: Number(data.monto), metodo: data.metodo });
  pintar();
});

document.getElementById("lista").addEventListener("change", async (evento) => {
  const input = evento.target.closest("[data-editar-cuota]");
  if (!input) return;

  const personaId = input.getAttribute("data-editar-cuota");
  const nuevaCuota = parseFloat(input.value) || 0;

  const { error } = await db.from("personas").update({ cuota: nuevaCuota }).eq("id", personaId);
  if (error) {
    alert("No se pudo actualizar la cuota: " + error.message);
    return;
  }

  estado.personas.find(p => p.id === personaId).cuota = nuevaCuota;
  pintar();
});

document.getElementById("lista").addEventListener("change", async (evento) => {
  const checkbox = evento.target.closest("[data-marcar-pagado]");
  if (!checkbox) return;

  const personaId = checkbox.getAttribute("data-marcar-pagado");
  const nuevoValor = checkbox.checked;

  const { error } = await db.from("personas").update({ pagado: nuevoValor }).eq("id", personaId);
  if (error) {
    alert("No se pudo actualizar: " + error.message);
    checkbox.checked = !nuevoValor;
    return;
  }

  estado.personas.find(p => p.id === personaId).pagado = nuevoValor;
  pintar();
});

document.getElementById("lista").addEventListener("click", async (evento) => {
  const botonPersona = evento.target.closest("[data-eliminar-persona]");
  if (botonPersona) {
    const idAEliminar = botonPersona.getAttribute("data-eliminar-persona");

    // Los abonos de la persona se borran solos (FK "on delete cascade").
    const { error } = await db.from("personas").delete().eq("id", idAEliminar);
    if (error) {
      alert("No se pudo eliminar: " + error.message);
      return;
    }

    estado.personas = estado.personas.filter(p => p.id !== idAEliminar);
    pintar();
    return;
  }

  const botonPago = evento.target.closest("[data-eliminar-pago]");
  if (botonPago) {
    const [personaId, pagoId] = botonPago.getAttribute("data-eliminar-pago").split("|");

    const { error } = await db.from("pagos").delete().eq("id", pagoId);
    if (error) {
      alert("No se pudo quitar el abono: " + error.message);
      return;
    }

    const persona = estado.personas.find(p => p.id === personaId);
    persona.pagos = persona.pagos.filter(p => p.id !== pagoId);
    pintar();
  }
});

document.getElementById("btn-reset").addEventListener("click", async () => {
  const confirmado = confirm("¿Borrar TODOS los datos? Esto los borra de la base de datos para siempre.");
  if (!confirmado) return;

  // No existe un "delete all" directo: se usa un filtro siempre-verdadero.
  const { error } = await db.from("personas").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) {
    alert("No se pudo borrar: " + error.message);
    return;
  }

  estado = { personas: [] };
  pintar();
});

/* ---------- Exportar resumen como imagen (JPG) ---------- */

function truncarTexto(ctx, texto, anchoMaximo) {
  if (ctx.measureText(texto).width <= anchoMaximo) return texto;
  let corto = texto;
  while (corto.length > 1 && ctx.measureText(corto + "…").width > anchoMaximo) {
    corto = corto.slice(0, -1);
  }
  return corto + "…";
}

function dibujarIconoCasa(ctx, x, y, tamano, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x, y + tamano * 0.55);
  ctx.lineTo(x + tamano * 0.5, y);
  ctx.lineTo(x + tamano, y + tamano * 0.55);
  ctx.stroke();
  ctx.strokeRect(x + tamano * 0.16, y + tamano * 0.5, tamano * 0.68, tamano * 0.5);
  ctx.restore();
}

function rectRedondeado(ctx, x, y, ancho, alto, radio) {
  ctx.beginPath();
  ctx.moveTo(x + radio, y);
  ctx.arcTo(x + ancho, y, x + ancho, y + alto, radio);
  ctx.arcTo(x + ancho, y + alto, x, y + alto, radio);
  ctx.arcTo(x, y + alto, x, y, radio);
  ctx.arcTo(x, y, x + ancho, y, radio);
  ctx.closePath();
}

// Dibuja el resumen completo en un <canvas>, en el mismo orden que la
// pantalla (Pendiente / Parcial / Completo), listo para exportar a JPG.
function dibujarResumen() {
  const ESCALA = 2; // resolución x2 para que la imagen salga nítida
  const ancho = 680;
  const padX = 28;
  const altoHeader = 84;
  const altoStats = 78;
  const altoFila = 56;
  const altoFooter = 34;
  const alto = altoHeader + altoStats + Math.max(estado.personas.length, 1) * altoFila + altoFooter;

  const canvas = document.createElement("canvas");
  canvas.width = ancho * ESCALA;
  canvas.height = alto * ESCALA;
  const ctx = canvas.getContext("2d");
  ctx.scale(ESCALA, ESCALA);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, ancho, alto);

  dibujarIconoCasa(ctx, padX, 12, 20, "#5b45ea");
  ctx.fillStyle = "#111827";
  ctx.font = "700 22px Inter, sans-serif";
  ctx.fillText("Casa de Campo", padX + 30, 32);

  ctx.fillStyle = "#6b7280";
  ctx.font = "400 13px Inter, sans-serif";
  const fecha = new Date().toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" });
  ctx.fillText("Control de pagos · actualizado el " + fecha, padX, 58);

  ctx.strokeStyle = "#e5e7eb";
  ctx.beginPath();
  ctx.moveTo(padX, altoHeader - 6);
  ctx.lineTo(ancho - padX, altoHeader - 6);
  ctx.stroke();

  const totalMeta = estado.personas.reduce((acc, p) => acc + p.cuota, 0);
  const totalRecaudado = estado.personas.reduce((acc, p) => acc + montoPagado(p), 0);
  const totalFalta = Math.max(totalMeta - totalRecaudado, 0);

  const statsY = altoHeader + 4;
  const boxAncho = (ancho - padX * 2 - 16) / 3;
  const cajas = [
    { etiqueta: "TOTAL", valor: soles(totalMeta), color: "#111827" },
    { etiqueta: "RECAUDADO", valor: soles(totalRecaudado), color: "#059669" },
    { etiqueta: "FALTA", valor: soles(totalFalta), color: "#e11d48" },
  ];
  cajas.forEach((caja, i) => {
    const x = padX + i * (boxAncho + 8);
    ctx.fillStyle = "#f9fafb";
    rectRedondeado(ctx, x, statsY, boxAncho, altoStats - 14, 10);
    ctx.fill();

    ctx.fillStyle = "#9ca3af";
    ctx.font = "700 10px Inter, sans-serif";
    ctx.fillText(caja.etiqueta, x + 12, statsY + 20);

    ctx.fillStyle = caja.color;
    ctx.font = "700 17px Inter, sans-serif";
    ctx.fillText(caja.valor, x + 12, statsY + 42);
  });

  const ORDEN_ESTADO = { Pendiente: 0, Parcial: 1, Completo: 2 };
  const filas = estado.personas.map((persona) => {
    const pagado = montoPagado(persona);
    const restante = Math.max(persona.cuota - pagado, 0);
    let estadoTxt = "Pendiente", color = "#e11d48", fondo = "#fff1f2";
    if (restante <= 0) { estadoTxt = "Completo"; color = "#059669"; fondo = "#ecfdf5"; }
    else if (pagado > 0) { estadoTxt = "Parcial"; color = "#d97706"; fondo = "#fffbeb"; }
    return { persona, pagado, restante, estadoTxt, color, fondo };
  });
  filas.sort((a, b) =>
    ORDEN_ESTADO[a.estadoTxt] - ORDEN_ESTADO[b.estadoTxt] ||
    a.persona.nombre.localeCompare(b.persona.nombre)
  );

  let y = altoHeader + altoStats + 8;

  if (filas.length === 0) {
    ctx.fillStyle = "#9ca3af";
    ctx.font = "400 13px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Todavía no hay invitados registrados", ancho / 2, y + altoFila / 2);
    ctx.textAlign = "left";
  }

  filas.forEach(({ persona, pagado, restante, estadoTxt, color, fondo }, i) => {
    if (i % 2 === 1) {
      ctx.fillStyle = "#fafafa";
      ctx.fillRect(padX - 8, y, ancho - (padX - 8) * 2, altoFila);
    }

    ctx.fillStyle = "#111827";
    ctx.font = "600 15px Inter, sans-serif";
    ctx.fillText(truncarTexto(ctx, persona.nombre, 160), padX, y + altoFila / 2 + 5);

    ctx.font = "700 11px Inter, sans-serif";
    const badgeAncho = ctx.measureText(estadoTxt).width + 22;
    const badgeX = padX + 196;
    const badgeY = y + altoFila / 2 - 11;
    ctx.fillStyle = fondo;
    rectRedondeado(ctx, badgeX, badgeY, badgeAncho, 22, 11);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(estadoTxt, badgeX + 11, badgeY + 15);

    ctx.textAlign = "right";
    ctx.font = "700 14px Inter, sans-serif";
    ctx.fillStyle = "#059669";
    ctx.fillText("Pagó " + soles(pagado), ancho - padX, y + altoFila / 2 - 3);

    ctx.font = "400 12px Inter, sans-serif";
    ctx.fillStyle = restante > 0 ? "#e11d48" : "#059669";
    ctx.fillText(restante > 0 ? "Falta " + soles(restante) : "Completo", ancho - padX, y + altoFila / 2 + 14);
    ctx.textAlign = "left";

    y += altoFila;
    ctx.strokeStyle = "#f3f4f6";
    ctx.beginPath();
    ctx.moveTo(padX - 8, y);
    ctx.lineTo(ancho - padX + 8, y);
    ctx.stroke();
  });

  ctx.fillStyle = "#9ca3af";
  ctx.font = "400 11px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Generado desde la app de Casa de Campo", ancho / 2, alto - 13);
  ctx.textAlign = "left";

  return canvas;
}

document.getElementById("btn-exportar").addEventListener("click", async () => {
  // Sin esto, el canvas puede dibujar antes de que cargue la fuente Inter.
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  const canvas = dibujarResumen();
  canvas.toBlob((blob) => {
    if (!blob) {
      alert("No se pudo generar la imagen.");
      return;
    }
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = "pagos-casa-de-campo-" + new Date().toISOString().slice(0, 10) + ".jpg";
    enlace.click();
    URL.revokeObjectURL(url);
  }, "image/jpeg", 0.92);
});

cargarDesdeSupabase();
