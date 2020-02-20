var API_HOST = "/api";

feather.replace();

var map = L.map('map', {
    inertia: true,
    dragging: true,
    tap: true,
    touchZoom: true
});

var geocodeService = L.esri.Geocoding.geocodeService();

L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoiYWhkZXYzNyIsImEiOiJjazZzOGE3bTMwY3hyM2dudmMzbXpwc2gzIn0.S6uikjvNkyCIxyW09cmobw', {
    attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
    maxZoom: 18,
    id: 'mapbox/streets-v11',
    tileSize: 512,
    zoomOffset: -1,
    accessToken: 'pk.eyJ1IjoiYWhkZXYzNyIsImEiOiJjazZzOGE3bTMwY3hyM2dudmMzbXpwc2gzIn0.S6uikjvNkyCIxyW09cmobw'
}).addTo(map);

map.setView([46, 2], 6);

fetch("http://ip-api.com/json")
    .then(data => data.json())
    .then(json => {
        map.setView([json.lat, json.lon], 6);
    });


 var current_position, current_accuracy, current_zip;
 
 function onLocationFound(e) {
    if (current_position) {
        map.removeLayer(current_position);
        map.removeLayer(current_accuracy);
    }

    var radius = e.accuracy / 2;

    geocodeService.reverse().latlng(e.latlng).run(function (error, result) {
        if (error) {
            return;
        }

        current_zip = result.address.Postal;
        document.getElementById("zip").value = current_zip;
        document.getElementById("submit-btn").focus();
        current_position = L.marker(e.latlng).addTo(map);
        current_accuracy = L.circle(e.latlng, radius).addTo(map);
        
    });
}

function onLocationError(e) {
    alert(e.message);
}

map.on('locationfound', onLocationFound);
map.on('locationerror', onLocationError);

function locate() {
    map.locate({setView: true, maxZoom: 14});
}

function showOverlay() {
    document.getElementById("overlay").style.visibility = "visible";
}

function hideOverlay() {
    document.getElementById("overlay").style.visibility = "hidden";
}

function setStatus(main, sub) {
    document.getElementById("status").innerHTML = main;
    document.getElementById("status-sub").innerHTML = sub;
}


var stores = [];
var age = 0;

function submit(nbPoints=-1) {

    var zip = document.getElementById("zip").value;

    if (current_position && current_accuracy && current_zip && zip !== current_zip) {
        map.removeLayer(current_position);
        map.removeLayer(current_accuracy);

        current_position = current_accuracy = current_zip = null;
    }

    if (!/^(?:[0-8]\d|9[0-8])\d{3}$/.test(zip)) {
        alert("incorrect zip format");
        return;
    }

    setStatus("fetching data" + (nbPoints > 0 ? ".".repeat(nbPoints) : ""), (nbPoints > 0 ? "(this may take few minutes)" : ""));
    
    var locale = navigator.language || navigator.userLanguage;
    
    showOverlay();

    fetch(`${API_HOST}/stores/${zip}?locale=${locale}`)
        .then(data => data.json())
        .then(json => {
            if (!json.success || json.data.status !== "finished") {
                if (nbPoints > 2) nbPoints = 0;
                setTimeout(() => submit(nbPoints+1), 2000);
                return;
            }

            stores = json.data.stores;

            if (!stores || !stores.length) {
                hideOverlay();
                alert("no nearby stores are open at the current time, please check again later");
                return;
            }

            age = json.data.age;
            console.log(stores);
            fetchLocations();
        });

}

var finished = [];

async function fetchLocations() {

    showOverlay();

    var missing = stores.filter(s => !s.location && !finished.includes(s.id));

    if (missing.length === 0) {
        hideOverlay();
        renderPoints();
        return;
    }

    for (var i = 0; i<missing.length; i++) {
        var store = missing[i];

        if (finished.includes(store.id)) continue;

        setStatus(`${i+1}/${missing.length}`, store.name);

        try {
            
            var json = await (await fetch(`${API_HOST}/locate/${store.id}`)).json();

            if (json.data.status === "finished") {
                finished.push(store.id);
                for (var k = 0 ; l < stores.length; k++) {
                    if (stores[k].id === store.id) stores[k].location = json.data.location;
                }
            }
        } catch(e) { continue; }
    }

    var ms = Math.min(10000, Math.max(2000, missing.length * 100));
    var sec = Math.ceil(ms/1000);

    setStatus("please wait...", `${Math.ceil(ms/1000)} seconds left`);

    var iid = setInterval(() => {
        sec -= 1;
        setStatus("please wait...", `${sec} second${sec > 1 ? "s" : ""} left`);
    }, 1000);

    
    setTimeout(() => {
        clearInterval(iid);
        submit();
    }, ms);
}

document.getElementById("zip").addEventListener("keyup", e => {
    if (e.keyCode === 13) {
        document.getElementById("submit-btn").focus();
        return;
    }    
});

var percentColors = [
    { pct: 0.0, color: { r: 0xff, g: 0x00, b: 0 } },
    { pct: 0.5, color: { r: 0xff, g: 0xff, b: 0 } },
    { pct: 1.0, color: { r: 0x00, g: 0xff, b: 0 } } ];

function getColorForPercentage (pct) {
    for (var i = 1; i < percentColors.length - 1; i++) {
        if (pct < percentColors[i].pct) {
            break;
        }
    }
    var lower = percentColors[i - 1];
    var upper = percentColors[i];
    var range = upper.pct - lower.pct;
    var rangePct = (pct - lower.pct) / range;
    var pctLower = 1 - rangePct;
    var pctUpper = rangePct;
    var color = {
        r: Math.floor(lower.color.r * pctLower + upper.color.r * pctUpper),
        g: Math.floor(lower.color.g * pctLower + upper.color.g * pctUpper),
        b: Math.floor(lower.color.b * pctLower + upper.color.b * pctUpper)
    };
    return "#" + rgbToHex(color.r)+ rgbToHex(color.g) + rgbToHex(color.b);
};

function rgbToHex(rgb) { 
    var hex = Number(rgb).toString(16);
    if (hex.length < 2) {
            hex = "0" + hex;
    }
    return hex;
};

function renderPoints() {

    stores = stores.sort((a, b) => {
        var scoreA = a.count + a.stars * 5;
        var scoreB = b.count + a.stars * 5;

        return scoreA - scoreB;
    });

    if (!current_position) {
        map.setView([stores[stores.length - 1].location.latitude, stores[stores.length - 1].location.longitude], 14);
    }

    for (var store of stores) {

        var score = Math.min(1, (store.count + store.stars * 5)/225);
        var color = store.open ? getColorForPercentage(score) : "#747474";

        if (!store.location) continue;

        var latlng = {lat: store.location.latitude, lng: store.location.longitude};

        var popupHtml = `<h5>${store.name}</h5><p>${store.location.address}</p><p>`

        for (var i = 0; i<store.categories.length; i++) {
            var cat = store.categories[i];
            popupHtml += cat + (i+1 < store.categories.length ? " - " : "");
        }

        popupHtml += `</p><span style="color:${color};"><b> ${store.stars} star${store.stars > 1 ? "s" : ""} (${store.count}${store.count === 200 ? "+" : ""} review${store.count > 1 ? "s" : ""})${store.open ? "" : " - " + store.nextOpen}</b>${store.promotion ? "<p>" + store.promotion + "</p>" : ""}</span><p style="font-size:10px">updated ${age} minute${age > 1 ? "s" : ""} ago</p>`;

        L.circle(latlng, 30, {
            color: color
        }).addTo(map).bindPopup(popupHtml);

    }

    
}
