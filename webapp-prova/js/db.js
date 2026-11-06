'use strict';

const DossierDB = (() => {
  const DB_NAME = 'dossierSanitarioLocaleV5RC5';
  const DB_VERSION = 13;
  const PROFILE_INDEXED = new Set([
    'documents','doctors','therapies','diagnoses','exemptions','measurements',
    'weightJourneys','documentVersions','calendarEvents','calendarSuggestions','vaccinations','interventions','symptoms','therapyAdherence','carePlans','dicomStudies','mediaAttachments','trash','auditLog','syncQueue'
  ]);
  const AUDITED = new Set([
    'profiles','documents','doctors','therapies','diagnoses','exemptions',
    'measurements','weightJourneys','documentVersions','calendarEvents','calendarSuggestions','vaccinations','interventions','symptoms','therapyAdherence','carePlans','dicomStudies','mediaAttachments','trash','users','devices','cloudSettings'
  ]);
  let dbPromise;
  let auditContextProvider = () => ({userId:'system', userName:'Sistema', deviceId:'local', deviceName:'Dispositivo locale'});
  let syncContextProvider = () => ({enabled:false, deviceId:'local'});
  let auditBusy = false;
  let syncBusy = false;

  function ensureStore(db, name, keyPath) {
    if (db.objectStoreNames.contains(name)) return;
    const store = db.createObjectStore(name, { keyPath });
    if (PROFILE_INDEXED.has(name)) store.createIndex('profileId', 'profileId', { unique: false });
    if (name === 'auditLog') {
      store.createIndex('createdAt', 'createdAt', { unique: false });
      store.createIndex('userId', 'userId', { unique: false });
      store.createIndex('entityId', 'entityId', { unique: false });
    }
    if (name === 'syncQueue') {
      store.createIndex('status', 'status', { unique: false });
      store.createIndex('createdAt', 'createdAt', { unique: false });
    }
    if (name === 'users') store.createIndex('usernameKey', 'usernameKey', { unique: true });
  }

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        const stores = [
          ['profiles', 'id'], ['documents', 'id'], ['doctors', 'id'],
          ['therapies', 'id'], ['diagnoses', 'id'], ['exemptions', 'id'],
          ['measurements', 'id'], ['weightJourneys', 'id'], ['documentVersions', 'id'],
          ['calendarEvents', 'id'], ['calendarSuggestions', 'id'],
          ['vaccinations', 'id'], ['interventions', 'id'], ['symptoms', 'id'],
          ['therapyAdherence', 'id'], ['carePlans', 'id'], ['dicomStudies', 'id'], ['mediaAttachments', 'id'],
          ['settings', 'key'], ['handles', 'key'], ['users', 'id'], ['devices', 'id'],
          ['auditLog', 'id'], ['trash', 'id'], ['cloudSettings', 'key'],
          ['syncQueue', 'id']
        ];
        for (const [name, keyPath] of stores) ensureStore(db, name, keyPath);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Il database è aperto in un’altra scheda. Chiudi le altre finestre del Dossier e riprova.'));
    });
    return dbPromise;
  }

  async function tx(storeName, mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      let result;
      try { result = action(store); } catch (error) { reject(error); return; }
      transaction.oncomplete = () => resolve(result?.result ?? result);
      transaction.onerror = () => reject(new Error(`Database ${storeName}: ${transaction.error?.message||'operazione non riuscita'}`));
      transaction.onabort = () => reject(new Error(`Database ${storeName}: ${transaction.error?.message||'transazione annullata'}`));
    });
  }

  const getAll = (store) => tx(store, 'readonly', s => s.getAll());
  const get = (store, key) => tx(store, 'readonly', s => s.get(key));
  const clear = (store) => tx(store, 'readwrite', s => s.clear());

  function makeId(prefix='id') {
    const bytes=new Uint8Array(12);
    globalThis.crypto?.getRandomValues?.(bytes);
    const random=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('')||Math.random().toString(36).slice(2);
    return `${prefix}_${Date.now().toString(36)}_${random}`;
  }


  function syncComparable(value) {
    if (value instanceof Blob) return {__blob:true,size:Number(value.size||0),type:String(value.type||''),name:String(value.name||''),lastModified:Number(value.lastModified||0)};
    if (Array.isArray(value)) return value.map(syncComparable);
    if (value && typeof value === 'object') {
      const out={};
      for (const key of Object.keys(value).sort()) {
        if (key === '_syncMeta') continue;
        out[key]=syncComparable(value[key]);
      }
      return out;
    }
    if (typeof value === 'undefined') return {__undefined:true};
    return value;
  }

  function syncValueEqual(a,b) {
    try { return JSON.stringify(syncComparable(a)) === JSON.stringify(syncComparable(b)); }
    catch (_) { return a === b; }
  }

  function syncRecordStamp(record) {
    return String(record?._syncMeta?.updatedAt || record?.updatedAt || record?.createdAt || '1970-01-01T00:00:00.000Z');
  }

  function syncDataKeys(record) {
    return Object.keys(record||{}).filter(key=>key !== '_syncMeta' && key !== 'updatedAt');
  }

  function primaryKeyField(store) {
    return ['settings','handles','cloudSettings'].includes(store) ? 'key' : 'id';
  }

  function validKey(value) {
    if (typeof value === 'string') return value.length > 0;
    if (typeof value === 'number') return Number.isFinite(value);
    if (value instanceof Date) return Number.isFinite(value.getTime());
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return true;
    if (Array.isArray(value)) return value.length > 0 && value.every(validKey);
    return false;
  }

  function ensurePrimaryKey(store, value) {
    if (!value || typeof value !== 'object') throw new Error(`Salvataggio ${store}: record non valido`);
    const field=primaryKeyField(store);
    if (!validKey(value[field])) {
      if (field === 'id') value.id=makeId(store.replace(/s$/,'')||'item');
      else throw new Error(`Salvataggio ${store}: campo “${field}” mancante o non valido`);
    }
    return value;
  }

  async function addAudit(action, store, entityId, profileId='', details={}) {
    if (auditBusy || store === 'auditLog' || !AUDITED.has(store)) return;
    auditBusy = true;
    try {
      const context = auditContextProvider?.() || {};
      const row = {
        id: makeId('audit'),
        profileId: profileId || '',
        action,
        store,
        entityId: String(entityId ?? ''),
        userId: context.userId || 'system',
        userName: context.userName || 'Sistema',
        deviceId: context.deviceId || 'local',
        deviceName: context.deviceName || 'Dispositivo locale',
        createdAt: new Date().toISOString(),
        details: details && typeof details === 'object' ? details : {}
      };
      const syncContext = syncContextProvider?.() || {};
      if (syncContext.enabled) {
        const eventId=makeId('change');
        row._syncMeta={revision:1,baseRevision:0,eventId,deviceId:syncContext.deviceId||'local',updatedAt:row.createdAt,fields:{action:{at:row.createdAt,deviceId:syncContext.deviceId||'local',eventId},store:{at:row.createdAt,deviceId:syncContext.deviceId||'local',eventId},entityId:{at:row.createdAt,deviceId:syncContext.deviceId||'local',eventId},profileId:{at:row.createdAt,deviceId:syncContext.deviceId||'local',eventId},details:{at:row.createdAt,deviceId:syncContext.deviceId||'local',eventId}}};
      }
      await tx('auditLog', 'readwrite', s => s.put(row));
      if (syncContext.enabled) {
        await enqueueSyncEvent({id:row._syncMeta.eventId,profileId:row.profileId||'',status:'pending',operation:'put',store:'auditLog',entityId:row.id,baseRevision:0,revision:1,deviceId:syncContext.deviceId||'local',createdAt:row.createdAt,entity:row});
      }
    } catch (error) {
      console.warn('Registro attività non aggiornato:', error);
    } finally { auditBusy = false; }
  }

  function notifySyncPending(event) {
    try {
      globalThis.dispatchEvent?.(new CustomEvent('dossier-sync-pending',{detail:{store:String(event?.store||''),profileId:String(event?.profileId||''),entityId:String(event?.entityId||'')}}));
    } catch (_) {}
  }

  async function enqueueSyncEvent(event) {
    if (syncBusy) return;
    syncBusy = true;
    try { await tx('syncQueue','readwrite',s=>s.put(event)); notifySyncPending(event); }
    finally { syncBusy = false; }
  }

  async function put(store, value, options={}) {
    value=ensurePrimaryKey(store,value);
    const syncContext = syncContextProvider?.() || {};
    const shouldSync = options.sync !== false && syncContext.enabled && AUDITED.has(store) && !['cloudSettings','dicomStudies','mediaAttachments'].includes(store);
    let previous = null;
    if (shouldSync && value) previous = await get(store, value.id ?? value.key).catch(()=>null);
    if (shouldSync && value && typeof value === 'object') {
      const baseRevision = Number(previous?._syncMeta?.revision || 0);
      const eventId = makeId('change');
      const now = new Date().toISOString();
      const deviceId = syncContext.deviceId || 'local';
      const previousFields = previous?._syncMeta?.fields && typeof previous._syncMeta.fields === 'object' ? previous._syncMeta.fields : {};
      const fields = {...previousFields};
      const keys = new Set([...(previous ? syncDataKeys(previous) : []), ...syncDataKeys(value)]);
      const legacyStamp = syncRecordStamp(previous);
      const legacyDevice = String(previous?._syncMeta?.deviceId || 'legacy');
      const legacyEvent = String(previous?._syncMeta?.eventId || '');
      for (const key of keys) {
        const hadPrevious = !!previous && Object.prototype.hasOwnProperty.call(previous,key);
        const hasCurrent = Object.prototype.hasOwnProperty.call(value,key);
        const changed = !hadPrevious || !hasCurrent || !syncValueEqual(previous?.[key],value[key]);
        if (changed) {
          fields[key] = {at:now,deviceId,eventId};
        } else if (!fields[key]) {
          fields[key] = {at:legacyStamp,deviceId:legacyDevice,eventId:legacyEvent};
        }
      }
      value._syncMeta = {revision:baseRevision+1,baseRevision,eventId,deviceId,updatedAt:now,fields};
    }
    const result = await tx(store, 'readwrite', s => s.put(value));
    if (options.audit !== false) await addAudit('put', store, value?.id ?? value?.key ?? result, value?.profileId || '', options.details || {});
    if (shouldSync) {
      const meta=value?._syncMeta||{};
      await enqueueSyncEvent({id:meta.eventId||makeId('change'),profileId:value?.profileId||'',status:'pending',operation:'put',store,entityId:String(value?.id??value?.key??result),baseRevision:Number(meta.baseRevision||0),revision:Number(meta.revision||1),deviceId:syncContext.deviceId||'local',createdAt:meta.updatedAt||new Date().toISOString(),entity:value});
    }
    return result;
  }

  async function del(store, key, options={}) {
    const syncContext = syncContextProvider?.() || {};
    const shouldSync = options.sync !== false && syncContext.enabled && AUDITED.has(store) && !['cloudSettings','dicomStudies','mediaAttachments'].includes(store);
    const previous = options.previous || (AUDITED.has(store) ? await get(store, key).catch(()=>null) : null);
    const result = await tx(store, 'readwrite', s => s.delete(key));
    if (options.audit !== false) await addAudit('delete', store, key, previous?.profileId || options.profileId || '', options.details || {});
    if (shouldSync) {
      const baseRevision=Number(previous?._syncMeta?.revision||0);const eventId=makeId('change');
      await enqueueSyncEvent({id:eventId,profileId:previous?.profileId||options.profileId||'',status:'pending',operation:'delete',store,entityId:String(key),baseRevision,revision:baseRevision+1,deviceId:syncContext.deviceId||'local',createdAt:new Date().toISOString(),previous});
    }
    return result;
  }

  async function byProfile(storeName, profileId) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      if (!store.indexNames.contains('profileId')) { resolve([]); return; }
      const request = store.index('profileId').getAll(profileId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async function bulkPut(storeName, values=[], options={}) {
    if (!values.length) return 0;
    const db = await open();
    await new Promise((resolve,reject)=>{
      const tr=db.transaction(storeName,'readwrite');
      const store=tr.objectStore(storeName);
      values.forEach(value=>store.put(value));
      tr.oncomplete=resolve; tr.onerror=()=>reject(tr.error); tr.onabort=()=>reject(tr.error||new Error('Operazione annullata'));
    });
    if(options.audit!==false) await addAudit('bulk-put',storeName,`${values.length}-items`,options.profileId||'',{count:values.length});
    return values.length;
  }

  function setAuditContext(provider) {
    auditContextProvider = typeof provider === 'function' ? provider : auditContextProvider;
  }
  function setSyncContext(provider) {
    syncContextProvider = typeof provider === 'function' ? provider : syncContextProvider;
  }

  return { open, getAll, get, put, del, clear, byProfile, bulkPut, addAudit, setAuditContext, setSyncContext, DB_NAME, DB_VERSION };
})();
