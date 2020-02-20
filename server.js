const CONFIG = require('./config.json');
const MongoClient  = require('mongodb').MongoClient;
const assert = require('assert');
const express = require('express');
const app = express();
const router = express.Router();
const helmet = require('helmet');
const client = new MongoClient(CONFIG.DB_URL, { useUnifiedTopology: true });
const moment = require('moment');
const api = require('./api');
const cors = require('cors')


const ENUM_PROCESS_STATUS = {
  NONE: 0,
  PROCESSING: 1
}

let process_stores = [{
  postal: "0",
  locale: "en-GB",
  status: ENUM_PROCESS_STATUS.PROCESSING
}];

let process_locations =  [{
  storeId: "0",
  status: ENUM_PROCESS_STATUS.PROCESSING
}];


router.get('/status', function (req, res) {
  res.json({
    success: true
  });
});

router.get(/^\/stores\/((?:[0-8]\d|9[0-8])\d{3})$/, async (req, res) => {

  let locale = CONFIG.DEFAULT_LOCALE;
  if (req.query.locale && /^[a-z]{2}\-[A-Z]{2}$/.test(req.query.locale))
    locale = req.query.locale;

  const postal = req.params[0];

  if (processStatus(postal, locale) === ENUM_PROCESS_STATUS.PROCESSING) {
    return res.json({
      success: true,
      data: { status: 'processing' }
    });
  }

  const collectionName = `${CONFIG.DB_STORES_COLLECTION_PREFIX}-${locale}`;

  try {
    await client.db().createCollection(collectionName);
  } catch(err) {
    return res.json({
      success: false,
      message: 'internal error',
      code: '1e3a'
    });
  }

  const collection = client.db().collection(collectionName);
  
  try {

    const docs = await collection.findOne({ postal });

    const lim = docs && docs.stores && docs.stores.length === 0 ? 5 : CONFIG.STORES_UPDATE_MIN;
    if (docs && moment().diff(moment(docs.lastUpdate, 'x'), 'minutes') < lim) {

      processAssertDestroyed(postal, locale);
      
      const stores = docs.stores;

      try {

        const locationCollection = client.db().collection(CONFIG.DB_LOCATIONS_COLLECTION);

        const storesIds = stores.map(s => s.id);

        const foundLocationsCursor = await locationCollection.find({ storeId: { $in: storesIds } });

        await foundLocationsCursor.forEach(doc => {
         
          if (!doc.location || moment().diff(moment(doc.lastUpdate, 'x'), 'days') > CONFIG.LOCATIONS_UPDATE_DAYS) return;
          
          for (let i=0; i<stores.length; i++) {
            if (stores[i].id === doc.storeId)
              stores[i].location = doc.location;
          }
        });

      } catch(lerr) {}

      return res.json({
        success: true,
        data: { status: "finished", stores: Array.from(new Set(stores)), age: moment().diff(moment(docs.lastUpdate, 'x'), 'minutes') }
      });
    }

  } catch(err) {
    processAssertDestroyed(postal, locale);

    return res.json({
      success: false,
      message: 'internal error',
      code: '9e7f'
    });
  }

  // No cached version
  process(locale, collectionName, postal);

  return res.json({
    success: true,
    data: { status: 'processing' }
  });

});


function processStatus(postal, locale) {
  const process = process_stores.find(x => x.postal === postal && x.locale === locale);

  if (!process) return ENUM_PROCESS_STATUS.NONE;

  return process.status;
}

function locationProcessStatus(storeId) {
  const process = process_stores.find(x => x.storeId === storeId);

  if (!process) return ENUM_PROCESS_STATUS.NONE;

  return process.status;
}

function processAssertDestroyed(postal, locale) {
  process_stores = process_stores.filter(x => x.postal !== postal && x.locale === locale);
}

function locationProcessAssertDestroyed(storeId) {
  process_locations = process_stores.filter(x => x.storeId !== storeId);
}

async function process(locale, collectionName, postal){
  
  const process = process_stores.find(x => x.postal === postal && x.locale === locale);
  if (process && process.status === ENUM_PROCESS_STATUS.PROCESSING) return;

  console.log(`> processing ${postal} (${locale})`);

  processAssertDestroyed(postal, locale);

  process_stores.push({
    postal,
    locale,
    status: ENUM_PROCESS_STATUS.PROCESSING
  });

  let stores;
  try {
    stores = await api.getStores(locale, postal);
  } catch (err) {
    console.error(`> catched api error @getStores(${locale}, ${postal})`);
    processAssertDestroyed(postal, locale);
    return;
  }

  try {
    stores = stores.map(s => {
      return {
        image: s.heroImageUrl,
        id: s.uuid,
        name: s.title,
        categories: s.categories,
        stars: s.feedback ? s.feedback.rating : 0,
        count: s.feedback ? parseInt(s.feedback.ratingCount.replace('+', '')) : 0,
        promotion: (s.promotion ? s.promotion.text : null),
        open: s.isOpen,
        nextOpen: s.closedMessage
      }
    });
  } catch(err) {
    console.error(`> catched mapping error @getStores(${locale}, ${postal})`);
    processAssertDestroyed(postal, locale);
    return;
  }

  /*if (stores.length === 0) {
    console.error(`> catched validation error @getStores(${locale}, ${postal})`);
    setTimeout(() => processAssertDestroyed(postal, locale), 30000);
    return;
  }*/
  
  try {
    const collection = client.db().collection(collectionName);

    const docs = await collection.findOne({postal});

    const lastUpdate = moment.now('x');

    if (!docs)
      await collection.insertOne({ postal, stores, lastUpdate });
    else
      await collection.findOneAndUpdate({ postal }, { $set: { stores, lastUpdate } });

  } catch(err) {
    console.error(`> catched db error @getStores(${locale}, ${postal})`);
    processAssertDestroyed(postal, locale);
    return;
  }

  console.log(`> processed ${postal} (${locale})`);
  processAssertDestroyed(postal, locale);
}

async function locationProcess(storeId){

  const process = process_locations.find(x => x.storeId === storeId);
  if (process && process.status === ENUM_PROCESS_STATUS.PROCESSING) return;

  const locale = CONFIG.DEFAULT_LOCALE;

  console.log(`> location ${storeId}`);
  
  locationProcessAssertDestroyed(storeId);

  process_locations.push({
    storeId,
    status: ENUM_PROCESS_STATUS.PROCESSING
  });

  let location;
  try {
    location = await api.getStoreAddress(locale, storeId);
  } catch (err) {
    console.error(`> catched api error @getStoreAddress(${storeId}})`);
    locationProcessAssertDestroyed(storeId);
    return;
  }

  try {
    location =  {
      address: location.address,
      latitude: location.latitude,
      longitude: location.longitude
    };
  } catch (err) {
    console.error(`> catched mapping error @getStoreAddress(${storeId}})`);
    locationProcessAssertDestroyed(storeId);
    return;
  }

  try {
    const collection = client.db().collection(CONFIG.DB_LOCATIONS_COLLECTION);

    const docs = await collection.findOne({storeId});

    const lastUpdate = moment.now('x');

    if (!docs)
      await collection.insertOne({ storeId, location, lastUpdate });
    else
      await collection.findOneAndUpdate({ storeId }, { $set: { location, lastUpdate } });

  } catch(err) {
    console.error(`> catched db error @getStoreAddress(${storeId})`);
    locationProcessAssertDestroyed(storeId);
    return;
  }

  console.log(`> located ${storeId}`);
  locationProcessAssertDestroyed(storeId);

}

router.get(/^\/locate\/([0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12})$/, async (req, res) => {
  
  const storeId = req.params[0];

  if (locationProcessStatus(storeId) === ENUM_PROCESS_STATUS.PROCESSING) {
    return res.json({
      success: true,
      data: { status: 'processing' }
    });
  }

  try {
    await client.db().createCollection(CONFIG.DB_LOCATIONS_COLLECTION);
  } catch(err) {
    return res.json({
      success: false,
      message: 'internal error',
      code: '55e2'
    });
  }
  

  const collection = client.db().collection(CONFIG.DB_LOCATIONS_COLLECTION);
  
  try {

    const docs = await collection.findOne({ storeId });

    if (docs && moment().diff(moment(docs.lastUpdate, 'x'), 'days') < CONFIG.LOCATIONS_UPDATE_DAYS) {

      locationProcessAssertDestroyed(storeId);

      return res.json({
        success: true,
        data: { status: "finished", location: docs.location, age: moment().diff(moment(docs.lastUpdate, 'x'), 'days') }
      });
    }

  } catch(err) {
    locationProcessAssertDestroyed(storeId);

    return res.json({
      success: false,
      message: 'internal error',
      code: '78ef'
    });
  }

  // No cached version
  locationProcess(storeId);

  return res.json({
    success: true,
    data: { status: 'processing' }
  });


});

app.use(helmet());
app.use(cors());
app.use(express.static('public'));
app.use('/api', router);

client.connect((err) => {
  assert.equal(null, err);

  console.log('> connected to database');

  app.listen(CONFIG.PORT, () => console.log(`> up and running on port ${CONFIG.PORT}`));
});



