const request = require('request');

jsonedCookie = {};

function parseSetCookie(setCookie) {

    for (let cookie of setCookie) {
        const e0 = cookie.split(';')[0];

        const ss = e0.split['='];
        const matches = e0.match(/^(.+)\=(.+)/);

        const key = matches[1];
        const val = matches[2];

        jsonedCookie[key] = val;
    }

}

function getCookie() {

    let cookie = "";

    Object.keys(jsonedCookie).forEach(key => {

        if (cookie !== "") cookie += '; ';

        cookie += `${key}=${jsonedCookie[key]}`;

    });

    return cookie;
}

function getLocationAutocompleteV1(locale, address) {

    console.log('https://www.ubereats.com/api/getLocationAutocompleteV1?localeCode=' + locale);

    const options = {
        url: 'https://www.ubereats.com/api/getLocationAutocompleteV1?localeCode=' + locale,
        method: 'POST',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.106 Safari/537.36',
            'x-csrf-token': 'x',
            'Cookie': getCookie()
        },
        json: {"query": address}
    }

    return new Promise((resolve, reject) => {
    
        request(options,(err, resp, body) => {
            if (err || body.status !== 'success') {
                reject(err);
                return;
            }
            parseSetCookie(resp.headers['set-cookie']);
        
            resolve(body.data[0]);
        });

    });
}


function getLocationDetailsV1(locale, location) {

    console.log('https://www.ubereats.com/api/getLocationDetailsV1?localeCode=' + locale);

    const options = {
        url: 'https://www.ubereats.com/api/getLocationDetailsV1?localeCode=' + locale,
        method: 'POST',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.106 Safari/537.36',
            'x-csrf-token': 'x',
            'Cookie': getCookie()
        },
        json: location
    }

    return new Promise((resolve, reject) => {
    
        request(options,(err, resp, body) => {
            if (err || body.status !== 'success') {
                reject(err);
                return;
            }
            parseSetCookie(resp.headers['set-cookie']);
            
            resolve(body.data);
        });

    });
}

function setTargetLocationV1(locale) {

    console.log('https://www.ubereats.com/api/setTargetLocationV1?localeCode=' + locale);

    const options = {
        url: 'https://www.ubereats.com/api/setTargetLocationV1?localeCode=' + locale,
        method: 'POST',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.106 Safari/537.36',
            'x-csrf-token': 'x',
            'Cookie': getCookie()
        },
        json: {}
    }

    return new Promise((resolve, reject) => {
    
        request(options,(err, resp, body) => {
            if (err || body.status !== 'success') {
                reject(err);
                return;
            }
            parseSetCookie(resp.headers['set-cookie']);

            resolve();
        });

    });
}


function getFeedV1(locale, offset=0) {
    
    console.log('https://www.ubereats.com/api/getFeedV1?localeCode=' + locale);

    const options = {
        url: 'https://www.ubereats.com/api/getFeedV1?localeCode=' + locale,
        method: 'POST',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.106 Safari/537.36',
            'x-csrf-token': 'x',
            'Cookie': getCookie()
        },
        json: {
            "cacheKey": "",
            "feedSessionCount": {
                "announcementCount": 0,
                "announcementLabel": ""
            },
            "userQuery": "",
            "date": "",
            "startTime": 0,
            "endTime": 0,
            "carouselId": "",
            "sortAndFilters": [],
            "pageInfo": {
                offset,
                "pageSize": 80
            }
        }
    }

    return new Promise((resolve, reject) => {
    
        request(options,(err, resp, body) => {
            if (err || body.status !== 'success') {
                reject(err);
                return;
            }
            parseSetCookie(resp.headers['set-cookie']);

            resolve(body.data);
        });

    });
}

function getStoreV1(locale, uuid) {
    
    console.log('https://www.ubereats.com/api/getStoreV1?localeCode=' + locale);

    const options = {
        url: 'https://www.ubereats.com/api/getStoreV1?localeCode=' + locale,
        method: 'POST',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.106 Safari/537.36',
            'x-csrf-token': 'x',
            'Cookie': getCookie()
        },
        json: {"storeUuid": uuid,"sfNuggetCount":0}
    }

    return new Promise((resolve, reject) => {
    
        request(options,(err, resp, body) => {
            if (err || body.status !== 'success') {
                reject(err);
                return;
            }
            parseSetCookie(resp.headers['set-cookie']);

            resolve(body.data);
        });

    });
}


function parseStores(feed) {

    const stores = feed.storesMap;

    const list = [];
    
    for (let key in stores) {
        const store = stores[key];

        list.push(store);
    }

    return list;
}

function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(() =>  resolve(), ms);
    });
}

async function getStores(locale, location_str, delay=0) {
    const completed =  await getLocationAutocompleteV1(locale, location_str);
    const location = await getLocationDetailsV1(locale, completed);
    jsonedCookie['uev2.loc'] = JSON.stringify(location);
    await setTargetLocationV1(locale);
    
    let meta = { hasMore: true, offset: 0 };
    let stores = [];

    do {
        const feed = await getFeedV1(locale, meta.offset);
        meta = feed.meta;
        stores = stores.concat( parseStores(feed) );

        await sleep(delay);
    } while(meta.hasMore);

    return Array.from(new Set(stores));
}

async function getStoreAddress(locale, storeUuid) {
    return (await getStoreV1(locale, storeUuid)).location;
}

module.exports = {
    getStores,
    getStoreAddress
}