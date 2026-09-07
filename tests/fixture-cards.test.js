const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const routes = require(path.join(__dirname, "..", "extension", "src", "routes.js"));
const SalaryParser = require(path.join(__dirname, "..", "extension", "src", "salary-parser.js"));

const recommended = fs.readFileSync(
  path.join(__dirname, "..", "pages", "recommended.html"),
  "utf8"
);
const card = fs.readFileSync(path.join(__dirname, "..", "pages", "recommendedcard.html"), "utf8");
const search = fs.readFileSync(path.join(__dirname, "..", "pages", "search.html"), "utf8");

const MARKER = 'data-occludable-job-id="';

function occludableChunks(html) {
  const positions = [...html.matchAll(/data-occludable-job-id="/g)].map((m) => m.index);
  return positions.map((start, index) => {
    const idFrom = start + MARKER.length;
    const id = html.slice(idFrom, idFrom + html.slice(idFrom).indexOf('"'));
    const bodyEnd = index + 1 < positions.length ? positions[index + 1] : html.length;
    return { id, body: html.slice(idFrom, bodyEnd) };
  });
}

test("recommended.html: 24 virtualized slots, 7 hydrated Voyager cards, strict selector coverage", () => {
  const chunks = occludableChunks(recommended);
  assert.equal(chunks.length, 24, "virtualized slot count");

  const hydrated = chunks.filter(
    (chunk) =>
      chunk.body.includes("job-card-container") && chunk.body.includes(`data-job-id="${chunk.id}"`)
  );
  assert.equal(hydrated.length, 7, "hydrated card count");
  assert.equal(new Set(hydrated.map((c) => c.id)).size, 7, "job ids unique");

  for (const chunk of hydrated) {
    assert.ok(
      chunk.body.includes("job-card-list__title--link"),
      `title link missing for ${chunk.id}`
    );
    assert.ok(
      chunk.body.includes(`/jobs/view/${chunk.id}/`),
      `exact view link missing for ${chunk.id}`
    );
    assert.ok(
      chunk.body.includes("artdeco-entity-lockup__title"),
      `title wrapper missing for ${chunk.id}`
    );
    assert.ok(
      chunk.body.includes("artdeco-entity-lockup__caption"),
      `caption missing for ${chunk.id}`
    );
    assert.ok(
      !chunk.body.includes("lgs96-badge"),
      `stale badge serialized in fixture for ${chunk.id}`
    );
  }
});

test("recommendedcard.html: single job card contract", () => {
  assert.ok(card.includes('data-job-id="4446745120"'), "card root data-job-id");
  assert.ok(card.includes("job-card-container"), "card container class");
  assert.ok(card.includes("artdeco-entity-lockup__title"), "title wrapper present");
  assert.ok(card.includes("artdeco-entity-lockup__caption"), "caption present");
  assert.ok(card.includes("Torino, Piemonte, Italia (In sede)"), "location text");
  assert.ok(card.includes("24K&nbsp;€/anno - 28K&nbsp;€/anno"), "native salary text");

  const viewLinks = [...card.matchAll(/href="(\/jobs\/view\/\d+\/[^"]*)"/g)].map((m) => m[1]);
  assert.equal(viewLinks.length, 1, "exactly one view link");
  assert.equal(routes.extractJobIdFromHref(viewLinks[0], "https://www.linkedin.com/"), "4446745120");
});

test("recommendedcard.html: native salary parses and classifies narrow", () => {
  const parsed = SalaryParser.parseCardSalaryText("24K €/anno - 28K €/anno", {
    defaultCurrency: "EUR",
  });
  assert.equal(parsed.info.kind, "range");
  assert.equal(parsed.info.currency, "EUR");
  assert.deepEqual(
    [parsed.info.min, parsed.info.max],
    [24000, 28000]
  );
  const compact = SalaryParser.parseCardSalaryText("26 €/anno - 28 €/anno", {
    defaultCurrency: "EUR",
  });
  assert.deepEqual(
    [compact.info.min, compact.info.max],
    [26000, 28000]
  );
});

test("search.html: blended all-search renders three job cards plus a bare see-all link", () => {
  const allSearchHrefs = [...search.matchAll(/href="([^"]*\/jobs\/search-results\/[^"]*)"/g)].map(
    (m) => m[1]
  );
  assert.equal(
    allSearchHrefs.length,
    5,
    "search-results links: 3 cards + see-all + vertical switch"
  );

  const cardHrefs = allSearchHrefs.filter((href) => href.includes("currentJobId="));
  assert.equal(cardHrefs.length, 3, "exactly three blended job cards");
  const ids = cardHrefs.map((href) =>
    routes.extractJobIdFromHref(href.replace(/&amp;/g, "&"), "https://www.linkedin.com/")
  );
  assert.deepEqual(
    [...new Set(ids)].sort(),
    ["4404067785", "4435556057", "4450337951"],
    "card ids resolved from currentJobId"
  );

  const nonCardHrefs = allSearchHrefs.filter((href) => !href.includes("currentJobId="));
  assert.equal(nonCardHrefs.length, 2, "see-all and vertical switch carry no job id");
  assert.ok(
    nonCardHrefs.some((href) => /\/jobs\/search-results\/?$/.test(href)),
    "bare see-all link present"
  );

  assert.equal((search.match(/Pubblicata/g) || []).length, 3, "posted-time paragraph per card");
  for (const company of ["Prima", "Klarna", "BCG X"]) {
    assert.ok(search.includes(company), `company paragraph for ${company}`);
  }
  for (const title of [
    "Math, Physics &amp; Engineering Graduates",
    "Senior/Lead Data Scientist-Fraud",
    "Forward Deployed AI Scientist, Italy - BCG X",
  ]) {
    assert.ok(search.includes(title), `title paragraph: ${title}`);
  }

  const contentSource = fs.readFileSync(
    path.join(__dirname, "..", "extension", "src", "content.js"),
    "utf8"
  );
  assert.ok(
    contentSource.includes('a[href*="/jobs/search-results/"]'),
    "content script discovers blended search cards"
  );
});
