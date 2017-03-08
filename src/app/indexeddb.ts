export function startsWith(index, prefix): Promise<any[]> {
  return new Promise((resolve, reject) => {
    let keyRange = IDBKeyRange.bound(prefix, prefix + 'uffff', false, false);
    let request = index.openCursor(keyRange)
    let results = [];
    request.onsuccess = (evt) => {
      let cursor = evt.target.result;
      if (cursor) {
        results.push(cursor.value);
        cursor.continue();

      } else {
        resolve(results);

      }
    };
    request.onerror = (evt) => reject(evt.target.error);
  });
}
