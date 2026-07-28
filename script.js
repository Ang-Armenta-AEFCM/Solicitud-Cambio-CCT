"use strict";
const DATA_REQUESTS="datos/buffer_3km_visores_con_nombres.csv";
const DATA_SCHOOLS="datos/CoordenadasN.csv";
const DEFAULT_VIEW=[[19.16,-99.36],[19.59,-98.94]];
const state={records:[],schoolIndex:new Map(),currentIndex:-1,layers:{},showBuffers:true,showLine:true};

const osm=L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap"});
const satellite=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:19,attribution:"Tiles &copy; Esri"});
const carto=L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",{maxZoom:20,subdomains:"abcd",attribution:"&copy; OpenStreetMap &copy; CARTO"});
const map=L.map("map",{layers:[osm],zoomControl:true,preferCanvas:true,fullscreenControl:true,fullscreenControlOptions:{position:"topleft",title:"Pantalla completa",titleCancel:"Salir de pantalla completa"}});
map.fitBounds(DEFAULT_VIEW);
L.control.layers({"OpenStreetMap":osm,"Satélite":satellite,"Carto Light":carto},null,{position:"topright",collapsed:true}).addTo(map);
L.control.scale({imperial:false,position:"bottomright"}).addTo(map);

const legend=L.control({position:"bottomright"});
legend.onAdd=()=>{const d=L.DomUtil.create("div","legend");d.innerHTML=`<b>Leyenda</b><div class="legend-row"><i class="legend-dot" style="background:#1769aa"></i>Procedencia</div><div class="legend-row"><i class="legend-dot" style="background:#d32f2f"></i>Primera opción</div><div class="legend-row"><i class="legend-line" style="background:#168a4a"></i>Radio 2 km</div><div class="legend-row"><i class="legend-line" style="background:#ef8a17"></i>Radio 3 km</div>`;return d};legend.addTo(map);

function clean(v){return v==null?"":String(v).trim()}
function key(v){return clean(v).toUpperCase()}
function num(v){const n=Number(String(v??"").replace(",","."));return Number.isFinite(n)?n:null}
function val(obj,names){for(const n of names){if(obj[n]!==undefined&&clean(obj[n])!=="")return obj[n]}return ""}
function escapeHtml(s){return clean(s).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]))}
function parseCsv(url){return new Promise((resolve,reject)=>Papa.parse(url,{download:true,header:true,skipEmptyLines:"greedy",dynamicTyping:false,complete:r=>r.errors.length&&r.data.length===0?reject(new Error(r.errors[0].message)):resolve(r.data),error:reject}))}

function indexSchools(rows){rows.forEach(r=>{const cct=key(val(r,["CLAVECCT","CCT_CLAVE","cct"]));if(!cct)return;const item={cct,name:clean(val(r,["NOMBRE","nombre"])),alcaldia:clean(val(r,["ALCALDÍA","ALCALDIA","alcaldia"])),nivel:clean(val(r,["NIVEL","nivel"])),lat:num(val(r,["Coord y_DPE","Coord_y","latitud","LATITUD"])),lon:num(val(r,["Coord X_DPE","Coord_x","longitud","LONGITUD"]))};if(!state.schoolIndex.has(cct))state.schoolIndex.set(cct,item);else{const old=state.schoolIndex.get(cct);for(const p of ["name","alcaldia","nivel","lat","lon"])if((old[p]===""||old[p]==null)&&item[p]!==""&&item[p]!=null)old[p]=item[p]}})}
function normalizeRecord(r,i){const originCct=key(val(r,["CCT_PROCED","cct_procedencia","CCT_PROCEDENCIA"]));const destCct=key(val(r,["cct_primera_opcion","CCT_PRIMERA_OPCION"]));const o=state.schoolIndex.get(originCct)||{};const d=state.schoolIndex.get(destCct)||{};return{index:i,id:clean(val(r,["id","ID"]))||String(i+1),student:clean(val(r,["nombre_alumno","NOMBRE_ALUMNO","alumno","NOMBRE"])),origin:{cct:originCct,name:clean(val(r,["nombre_procedencia","NOMBRE_PROCEDENCIA"]))||o.name||"",alcaldia:o.alcaldia||"",nivel:o.nivel||"",lat:num(val(r,["Coord_y_procedencia","LAT_PROCEDENCIA"]))??o.lat??null,lon:num(val(r,["Coord_x_procedencia","LON_PROCEDENCIA"]))??o.lon??null},dest:{cct:destCct,name:clean(val(r,["nombre_primera_opcion","NOMBRE_PRIMERA_OPCION"]))||d.name||"",alcaldia:d.alcaldia||"",nivel:d.nivel||"",lat:num(val(r,["Coord_y_primera_opcion","LAT_PRIMERA_OPCION"]))??d.lat??null,lon:num(val(r,["Coord_x_primera_opcion","LON_PRIMERA_OPCION"]))??d.lon??null}}}
function haversine(a,b){const R=6371,toRad=x=>x*Math.PI/180;const dLat=toRad(b.lat-a.lat),dLon=toRad(b.lon-a.lon);const q=Math.sin(dLat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(q))}
function distanceLabel(km){return km<1?`${Math.round(km*1000)} m`:`${km.toFixed(2)} km`}
function category(km){if(km<=2)return{cls:"green",label:"🟢 Dentro de 2 km"};if(km<=3)return{cls:"yellow",label:"🟡 Entre 2 y 3 km"};return{cls:"red",label:"🔴 Mayor de 3 km"}}
function validPoint(p){return Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180}
function markerIcon(color){return L.divIcon({className:"",html:`<div class="school-marker" style="background:${color}"></div>`,iconSize:[24,24],iconAnchor:[12,12],popupAnchor:[0,-12]})}
function popup(p,type){return `<div class="popup"><h3>${escapeHtml(p.name||"Sin nombre")}</h3><p><b>CCT:</b> ${escapeHtml(p.cct||"No disponible")}</p><p><b>Tipo:</b> ${type}</p><p><b>Coordenadas:</b> ${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}</p><p><b>Alcaldía:</b> ${escapeHtml(p.alcaldia||"No disponible")}</p></div>`}
function clearLayers(){Object.values(state.layers).forEach(l=>{if(l&&map.hasLayer(l))map.removeLayer(l)});state.layers={}}
function setNotice(msg){const el=document.getElementById("notice");if(msg){el.textContent=msg;el.hidden=false}else el.hidden=true}
function addDetail(label,value){return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value||"No disponible")}</dd></div>`}

function renderRecord(index,{updateUrl=true}={}){
 if(index<0||index>=state.records.length){setNotice("No se encontró el alumno solicitado.");return}
 state.currentIndex=index;const r=state.records[index];clearLayers();setNotice("");
 document.getElementById("positionLabel").textContent=`Alumno ${index+1} de ${state.records.length}`;
 document.getElementById("prevBtn").disabled=index===0;document.getElementById("nextBtn").disabled=index===state.records.length-1;
 const hasO=validPoint(r.origin),hasD=validPoint(r.dest);let km=null;
 if(hasO&&hasD)km=haversine(r.origin,r.dest);
 const result=document.getElementById("resultCard"),classification=document.getElementById("classification"),distance=document.getElementById("distanceText");
 result.className="result-card neutral";
 if(km!=null){const cat=category(km);result.classList.add(cat.cls);classification.textContent=cat.label;distance.textContent=`Distancia: ${distanceLabel(km)}`}
 else{classification.textContent="Coordenadas no disponibles";distance.textContent="No fue posible calcular la distancia";setNotice("Esta solicitud no cuenta con todas las coordenadas necesarias para representarse en el mapa.")}
 const change=(r.origin.alcaldia&&r.dest.alcaldia)?(key(r.origin.alcaldia)===key(r.dest.alcaldia)?"No":"Sí"):"No disponible";
 const level=r.origin.nivel||r.dest.nivel||"No disponible";
 document.getElementById("details").innerHTML=[addDetail("ID",r.id),addDetail("Nombre del alumno",r.student||"No disponible en la base"),addDetail("CCT procedencia",r.origin.cct),addDetail("Nombre procedencia",r.origin.name),addDetail("Alcaldía procedencia",r.origin.alcaldia),addDetail("CCT destino",r.dest.cct),addDetail("Nombre destino",r.dest.name),addDetail("Alcaldía destino",r.dest.alcaldia),addDetail("Nivel educativo",level),addDetail("Distancia Haversine",km==null?"No disponible":distanceLabel(km)),addDetail("Clasificación",km==null?"No disponible":category(km).label.replace(/^[^ ]+ /,"")),addDetail("Cambio de alcaldía",change)].join("");
 const bounds=[];
 if(hasO){state.layers.origin=L.marker([r.origin.lat,r.origin.lon],{icon:markerIcon("#1769aa"),title:`Procedencia: ${r.origin.name}`}).bindPopup(popup(r.origin,"CCT de procedencia")).addTo(map);bounds.push([r.origin.lat,r.origin.lon]);state.layers.buffer2=L.circle([r.origin.lat,r.origin.lon],{radius:2000,color:"#168a4a",weight:2,fillColor:"#22a45b",fillOpacity:.08,dashArray:"7 5"});state.layers.buffer3=L.circle([r.origin.lat,r.origin.lon],{radius:3000,color:"#ef8a17",weight:2,fillColor:"#f29b38",fillOpacity:.055,dashArray:"9 6"});if(state.showBuffers){state.layers.buffer3.addTo(map);state.layers.buffer2.addTo(map)}bounds.push(...state.layers.buffer3.getBounds().getNorthWest? [state.layers.buffer3.getBounds().getNorthWest(),state.layers.buffer3.getBounds().getSouthEast()]:[])}
 if(hasD){state.layers.dest=L.marker([r.dest.lat,r.dest.lon],{icon:markerIcon("#d32f2f"),title:`Primera opción: ${r.dest.name}`}).bindPopup(popup(r.dest,"Primera opción solicitada")).addTo(map);bounds.push([r.dest.lat,r.dest.lon])}
 if(hasO&&hasD){state.layers.line=L.polyline([[r.origin.lat,r.origin.lon],[r.dest.lat,r.dest.lon]],{color:"#37474f",weight:3,opacity:.9,dashArray:"8 7"});const mid=[(r.origin.lat+r.dest.lat)/2,(r.origin.lon+r.dest.lon)/2];state.layers.label=L.marker(mid,{interactive:false,icon:L.divIcon({className:"",html:`<div class="distance-label">${distanceLabel(km)}</div>`,iconSize:[80,24],iconAnchor:[40,12]})});if(state.showLine){state.layers.line.addTo(map);state.layers.label.addTo(map)}}
 if(bounds.length)map.fitBounds(L.latLngBounds(bounds),{padding:[45,45],maxZoom:16});else map.fitBounds(DEFAULT_VIEW);
 document.getElementById("searchInput").value=`${r.id} · ${r.origin.cct} → ${r.dest.cct}`;
 if(updateUrl){const u=new URL(location.href);u.searchParams.set("id",r.id);history.replaceState({},"",u)}
}
function searchRecords(q){const s=key(q);if(!s)return[];return state.records.filter(r=>[r.id,r.origin.cct,r.dest.cct,r.origin.name,r.dest.name].some(v=>key(v).includes(s))).slice(0,30)}
function showSuggestions(q){const box=document.getElementById("suggestions"),hits=searchRecords(q);if(!q.trim()){box.classList.remove("open");return}box.innerHTML=hits.length?hits.map(r=>`<div class="suggestion" data-index="${r.index}"><strong>ID ${escapeHtml(r.id)} · ${escapeHtml(r.origin.cct)} → ${escapeHtml(r.dest.cct)}</strong><small>${escapeHtml(r.origin.name)} → ${escapeHtml(r.dest.name)}</small></div>`).join(""):`<div class="suggestion"><strong>Sin resultados</strong></div>`;box.classList.add("open")}
function exportImage(type){const target=document.getElementById("app");document.getElementById("loading").classList.remove("hidden");setTimeout(()=>html2canvas(target,{useCORS:true,allowTaint:false,scale:1.5,backgroundColor:"#ffffff"}).then(canvas=>{if(type==="png"){const a=document.createElement("a");a.download=`cambio_cct_${state.records[state.currentIndex]?.id||"visor"}.png`;a.href=canvas.toDataURL("image/png");a.click()}else{const{jsPDF}=window.jspdf;const landscape=canvas.width>canvas.height;const pdf=new jsPDF({orientation:landscape?"landscape":"portrait",unit:"mm",format:"a4"});const w=pdf.internal.pageSize.getWidth(),h=pdf.internal.pageSize.getHeight(),ratio=Math.min(w/canvas.width,h/canvas.height);pdf.addImage(canvas.toDataURL("image/jpeg",.92),"JPEG",(w-canvas.width*ratio)/2,(h-canvas.height*ratio)/2,canvas.width*ratio,canvas.height*ratio);pdf.save(`cambio_cct_${state.records[state.currentIndex]?.id||"visor"}.pdf`)}}).catch(()=>setNotice("No fue posible exportar la vista. Verifique la conexión a las capas de mapa." )).finally(()=>document.getElementById("loading").classList.add("hidden")),150)}

async function init(){try{const[schools,requests]=await Promise.all([parseCsv(DATA_SCHOOLS),parseCsv(DATA_REQUESTS)]);indexSchools(schools);state.records=requests.map(normalizeRecord).sort((a,b)=>Number(a.id)-Number(b.id));state.records.forEach((r,i)=>r.index=i);if(!state.records.length)throw new Error("La base de solicitudes está vacía");const requested=new URLSearchParams(location.search).get("id");let idx=requested==null?0:state.records.findIndex(r=>String(r.id)===String(requested));if(idx<0){idx=0;setTimeout(()=>setNotice("No se encontró el alumno solicitado. Se muestra el primer registro disponible."),150)}renderRecord(idx,{updateUrl:requested==null});}catch(e){console.error(e);setNotice("No fue posible cargar las bases de datos. Verifique que la carpeta datos esté publicada junto con el visor.");document.getElementById("classification").textContent="Error de carga"}finally{document.getElementById("loading").classList.add("hidden")}}

document.getElementById("searchInput").addEventListener("input",e=>showSuggestions(e.target.value));
document.getElementById("searchInput").addEventListener("focus",e=>showSuggestions(e.target.value));
document.getElementById("suggestions").addEventListener("click",e=>{const item=e.target.closest("[data-index]");if(item){renderRecord(Number(item.dataset.index));document.getElementById("suggestions").classList.remove("open")}});
document.addEventListener("click",e=>{if(!e.target.closest(".search-wrap"))document.getElementById("suggestions").classList.remove("open")});
document.getElementById("clearSearch").addEventListener("click",()=>{const i=document.getElementById("searchInput");i.value="";i.focus();showSuggestions("")});
document.getElementById("prevBtn").addEventListener("click",()=>renderRecord(state.currentIndex-1));document.getElementById("nextBtn").addEventListener("click",()=>renderRecord(state.currentIndex+1));
document.getElementById("toggleBuffers").addEventListener("change",e=>{state.showBuffers=e.target.checked;for(const k of ["buffer3","buffer2"]){const l=state.layers[k];if(l)e.target.checked?l.addTo(map):map.removeLayer(l)}});
document.getElementById("toggleLine").addEventListener("change",e=>{state.showLine=e.target.checked;for(const k of ["line","label"]){const l=state.layers[k];if(l)e.target.checked?l.addTo(map):map.removeLayer(l)}});
document.getElementById("homeBtn").addEventListener("click",()=>map.fitBounds(DEFAULT_VIEW));document.getElementById("centerBtn").addEventListener("click",()=>renderRecord(state.currentIndex,{updateUrl:false}));
document.getElementById("pngBtn").addEventListener("click",()=>exportImage("png"));document.getElementById("pdfBtn").addEventListener("click",()=>exportImage("pdf"));document.getElementById("printBtn").addEventListener("click",()=>window.print());
const side=document.getElementById("sidebar");document.getElementById("collapseBtn").addEventListener("click",()=>{side.classList.add("collapsed");setTimeout(()=>map.invalidateSize(),300)});document.getElementById("openPanelBtn").addEventListener("click",()=>{side.classList.remove("collapsed");setTimeout(()=>map.invalidateSize(),300)});
map.on("mousemove",e=>document.getElementById("cursorCoords").innerHTML=`Lat: ${e.latlng.lat.toFixed(6)} &nbsp; Lon: ${e.latlng.lng.toFixed(6)}`);
window.addEventListener("resize",()=>map.invalidateSize());init();
