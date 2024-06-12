import express from "express";

const server = express()
import db from "./db.cjs";

const PORT = process.env.PORT || 4567;

let DNS;
let backlinks = {};
let forwardlinks = {};
let titles = {};

let lastUpdate = 0;

server.use(express.static("./static"))
server.set("view engine", "ejs")
server.get("/", (req, res) => {
  res.redirect("/index.html");
})

server.get("//index.html", (req, res) => {
  res.redirect("/index.html")
})

server.get("/healthcheck", (req, res) => {
  res.send("Healthy!");
})

server.get("/index.html", async (req, res) => {
  let time = Date.now();
  let context = {
    pages: []
  };
  for (let page of DNS) {
    let analyzed = page.ip.startsWith("https://github.com/");
    context.pages.push({
      "url": page.url,
      "ip": page.ip,
      "analyzed": analyzed,
      "backlinks": backlinks[page.url] || 0,
      "forwardlinks": forwardlinks[page.url] || [],
      "title": titles[page.url] || page.url + " (no other title found)",
    })
  }

  context.pages.sort((a, b) => b.backlinks - a.backlinks);
  context.pages = context.pages.slice(0, 100)

  res.render("index", context);
  console.log("Request took " + (Date.now() - time) + "ms to process.")
})

server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
})

async function updateDNS() {
  let pages = 1;
  let currentpage = 0;
  DNS = []
  while (currentpage <= pages) {
    try {
      let res = await fetch("https://api.buss.lol/domains" + (currentpage > 0 ? "?page="+currentpage : ""));
      console.log(`Fetched page ${currentpage}!`)
      let newDNS = await res.json();
      currentpage = newDNS.page;
      pages = newDNS.limit;
      currentpage++;
      for (let page of newDNS.domains) {
        page.url = page.name + "." + page.tld;
        DNS.push(page);
      }
      lastUpdate = Date.now();
    } catch (e) {
      console.error("Error occured updating DNS: ", e);
    }
  }
  console.log(`Loaded ${DNS.length} pages`);
}

async function fetchContent(url) {
  if (!url.startsWith("https://github.com/")) {
    return "Custom domain names are not supported yet due to security concerns.";
  }

  let parts = url.split("/")
  let ghUrl = `https://raw.githubusercontent.com/${parts[3]}/${parts[4]}/main/index.html`

  return await db.getContentOf(ghUrl);

}

async function analyzeLinks() {
  backlinks = {}
  forwardlinks = {}
  let time = Date.now();
  for (let page of DNS) {
    if (page.url === "explore.it") continue; // Don't count the links from this site!
    let content = await fetchContent(page.ip);
    let links = []
    for (let matches of content.matchAll(`<a\\s+(?:[^>]*?\\s+)?href=(["'])(.*?)\\1`)) {
      for (let match of matches) {
        if (match.startsWith("buss://")) {
          let url = match.substring(7);
          let domain = url.split("/")[0];
          if (!(domain in links)) links.push(domain)
        }
      }
    }

    for (let link of links) {
      if (!(link in backlinks)) backlinks[link] = 0;
      backlinks[link]++;
      if (!(page.url in forwardlinks)) forwardlinks[page.url] = [];
      forwardlinks[page.url].push(link);
    }

    let titleMatch = content.match("<title>(.*)</title>");
    if (titleMatch && titleMatch.length > 1) {
      titles[page.url] = titleMatch[1].substring(0, 100);
    }
  }
  console.log("Analyzing links took " + (Date.now() - time) + "ms.");
}

await updateDNS();
await analyzeLinks();

setInterval(async () => {
  await updateDNS();
  await analyzeLinks();
}, 1000 * 60 * 5); // Update DNS and links every 5 minutes for now
