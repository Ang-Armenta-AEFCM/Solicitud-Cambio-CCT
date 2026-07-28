const map=L.map('map').setView([19.43,-99.13],11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'OSM'}).addTo(map);
fetch('datos/buffer_3km_visores_con_nombres.csv').then(r=>r.text()).then(t=>console.log('CSV cargado',t.split('\n').length));