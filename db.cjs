const sqlite3 = require('sqlite3').verbose();

let db = new sqlite3.Database('./content.db');

const TTL = 1000 * 60 * 60; // One hour

db.exec(`CREATE TABLE IF NOT EXISTS content (
  url VARCHAR(1000) PRIMARY KEY,
  content VARCHAR(100000) NOT NULL,
  last_fetched INT
);`)

function getContentOf(url) {
  return new Promise((resolve, reject) => {
    db.get("SELECT url, content, last_fetched FROM content WHERE url = ?;", [url], async function (err, row) {
      if (err) {
        reject(err);
      } else if (row && (Date.now() - row.last_fetched) < TTL) {
        // todo: fetch expired things again
        resolve(row.content);
      } else {
        console.log("Must fetch", url)
        // must fetch
        let content = await fetchContent(url, resolve, reject);
        insertContent(url, content);
        resolve(content);
      }
    })
  })
}

async function fetchContent(url) {
  const res = await fetch(url);
  if (res.status == 404) {
    return "Error 404 - Not found";
  } else if (res.status == 429) {
    console.log("Ratelimited - shit!"); // todo - actually handle rate limits
    process.exit(-1);
  }
  return await res.text();
}

function insertContent(url, content) {
  let stmt = db.prepare("INSERT INTO content (url, content, last_fetched) VALUES (?, ?, ?) ON CONFLICT(url) DO UPDATE SET content = ?, last_fetched = ?;");
  stmt.run([url, content, Date.now(), content, Date.now()], (err) => {
    if (err) {
      console.error("Error inserting data", err);
    }
  });
}


module.exports = {
  getContentOf,
  TTL
}
