import { JSDOM } from "jsdom";


const WORDS = "account add buy cart checkout contact deals email help home learn log menu more news offers order price product profile search settings shoes shop sign start store subscribe support up view".split(" ");
const TAGS = [ "a", "button", "input", "span", "div", "img", "li", "h3" ];
const INPUT_TYPES = [ "text", "email", "search", "submit" ];

// First version of a small shop page; data-xywh="x,y,w,h" carries the layout jsdom lacks.
export const V1 = `
<header data-xywh="0,0,1280,64">
  <a id="logo" href="/" data-xywh="16,12,120,40"><img alt="Acme shop" src="/logo.png" data-xywh="16,12,120,40"></a>
  <input id="q" name="q" type="search" placeholder="Search products" aria-label="Search" data-xywh="400,16,400,32">
  <a id="login-link" class="nav-link" href="/login" data-xywh="1000,20,80,24">Login</a>
  <a id="signup" class="btn btn-primary" href="/signup" data-xywh="1100,16,140,32">Sign up free</a>
</header>
<main data-xywh="0,64,1280,900">
  <h2 data-xywh="40,100,600,40">Running shoes</h2>
  <div class="card" data-xywh="40,160,360,300"><h3 data-xywh="60,180,300,30">Trail Runner 2</h3><p data-xywh="60,220,300,40">Grip for every terrain</p><a href="/p/trail" data-xywh="60,400,120,30">Learn more</a></div>
  <div class="card" data-xywh="440,160,360,300"><h3 data-xywh="460,180,300,30">Road Racer</h3><p data-xywh="460,220,300,40">Light and fast</p><a href="/p/road" data-xywh="460,400,120,30">Learn more</a></div>
  <div class="card" data-xywh="840,160,360,300"><h3 data-xywh="860,180,300,30">City Walker</h3><p data-xywh="860,220,300,40">All-day comfort</p><a href="/p/city" data-xywh="860,400,120,30">Learn more</a></div>
  <form data-xywh="40,520,500,200">
    <label for="email" data-xywh="40,520,200,20">Newsletter email</label>
    <input id="email" name="email" type="email" placeholder="you@example.com" data-xywh="40,545,320,36">
    <input type="submit" value="Subscribe" data-xywh="370,545,120,36">
  </form>
</main>`;

// Next version: generated ids/classes, renamed and moved items, new banner, tag change, a removed card.
export const V2 = `
<div class="promo-banner" data-xywh="0,0,1280,40"><span data-xywh="500,10,300,20">Free shipping over 50 euros</span></div>
<header class="css-1x2y3z" data-xywh="0,40,1280,72">
  <a id="ember1093" href="/" data-xywh="24,52,130,44"><img alt="Acme shop" src="/static/logo-v2.svg" data-xywh="24,52,130,44"></a>
  <input id="search-input-7781" name="q" type="search" placeholder="Search shoes and more" aria-label="Search" data-xywh="380,58,460,34">
  <button class="sc-AxjAm" data-xywh="1110,58,150,34">Sign up free</button>
  <a class="nav-link sc-bdVaJa" href="/account/login" data-xywh="990,62,90,26">Log in</a>
</header>
<main data-xywh="0,112,1280,900">
  <h2 data-xywh="40,150,600,40">Running shoes</h2>
  <div class="card" data-xywh="440,210,360,300"><h3 data-xywh="460,230,300,30">City Walker</h3><p data-xywh="460,270,300,40">All-day comfort</p><a href="/p/city" data-xywh="460,450,120,30">Learn more</a></div>
  <div class="card" data-xywh="40,210,360,300"><h3 data-xywh="60,230,300,30">Trail Runner 3</h3><p data-xywh="60,270,300,40">Grip for every terrain</p><a href="/p/trail-3" data-xywh="60,450,120,30">Learn more</a></div>
  <form data-xywh="40,560,500,200">
    <label for="nl-email" data-xywh="40,560,200,20">Newsletter email</label>
    <input id="nl-email" name="email" type="email" placeholder="you@example.com" data-xywh="40,585,320,36">
    <input type="submit" value="Subscribe now" data-xywh="370,585,140,36">
  </form>
</main>`;


function pick(random, items) {
    return items[Math.floor(random() * items.length)];
}

function phrase(random, wordCount) {
    return Array.from({ length: wordCount }, () => pick(random, WORDS)).join(" ");
}

function clone(features) {
    return JSON.parse(JSON.stringify(features));
}


// Build a jsdom page; elements carry data-xywh="x,y,w,h", which is moved into a layout map.
export function page(html) {
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
    const document = dom.window.document;
    const rects = new WeakMap();

    for(const element of Array.from(document.querySelectorAll("[data-xywh]"))) {
        const [ x, y, width, height ] = element.getAttribute("data-xywh").split(",").map(Number);

        rects.set(element, {
            x,
            y,
            width,
            height
        });
        element.removeAttribute("data-xywh");
    }

    return {
        document,
        options: {
            rectOf: element => rects.get(element) ?? null,
            pageWidth: 1280,
            viewportHeight: 800
        }
    };
}

// Small seeded PRNG (mulberry32) so synthetic data is reproducible.
export function seededRandom(seed) {
    let state = seed >>> 0;

    return () => {
        state = (state + 0x6d2b79f5) >>> 0;

        let value = state;

        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

export function element(random) {
    const tag = pick(random, TAGS);
    const type = (tag === "input") ? pick(random, INPUT_TYPES) : "";
    const id = (random() < 0.4) ? `${pick(random, WORDS)}-${pick(random, WORDS)}` : "";
    const href = (tag === "a") ? `/${pick(random, WORDS)}/${pick(random, WORDS)}` : "";
    const alt = (tag === "img") ? phrase(random, 2) : "";
    const classes = [ pick(random, WORDS), pick(random, WORDS) ];
    const depth = 3 + Math.floor(random() * 5);
    const steps = Array.from({ length: depth }, () => `div[${1 + Math.floor(random() * 4)}]`);
    const xpath = `/html/body/${steps.join("/")}/${tag}`;
    const attributes = {
        class: classes.join(" ")
    };

    if(id) attributes.id = id;
    if(href) attributes.href = href;
    if(alt) attributes.alt = alt;
    if(type) attributes.type = type;
    if(random() < 0.3) attributes["data-track"] = pick(random, WORDS);

    return {
        tag,
        classes,
        name: (random() < 0.3) ? pick(random, WORDS) : "",
        id,
        href,
        alt,
        xpath,
        idXpath: id ? `//*[@id="${id}"]` : xpath,
        isButton: tag === "button" || type === "submit",
        geom: {
            x: random(),
            y: random() * 4,
            area: 200 + random() * 20000,
            shape: 0.5 + random() * 6
        },
        text: phrase(random, 1 + Math.floor(random() * 3)),
        neighborText: phrase(random, 4),
        type,
        ariaLabel: (random() < 0.2) ? phrase(random, 2) : "",
        attributes
    };
}

// Simulate one release worth of change; severity ~ version gap.
export function mutate(random, features, severity) {
    const changed = clone(features);
    const chance = probability => random() < probability * severity;

    if(chance(0.5)) {
        changed.id = (random() < 0.5) ? "" : `ember${Math.floor(random() * 9999)}`;
        changed.idXpath = changed.id ? `//*[@id="${changed.id}"]` : changed.xpath;
    }
    if(chance(0.4)) changed.classes = [ pick(random, WORDS) ];
    if(chance(0.3)) changed.text = (random() < 0.5) ? `${changed.text} ${pick(random, WORDS)}` : phrase(random, 2);
    if(chance(0.3)) changed.neighborText = `${phrase(random, 2)} ${changed.neighborText.split(" ").slice(2).join(" ")}`;
    if(chance(0.2)) changed.tag = pick(random, TAGS);
    if(chance(0.3) && changed.href) changed.href = `${changed.href}/v2`;
    if(chance(0.4)) changed.xpath = changed.xpath.replace("/html/body/", "/html/body/div[1]/");
    if(chance(0.15)) changed.name = "";
    if(changed.geom && chance(0.6)) {
        changed.geom = {
            ...changed.geom,
            x: changed.geom.x + (random() - 0.5) * 0.2,
            y: changed.geom.y + (random() - 0.5) * 0.5
        };
    }

    changed.attributes = {
        ...changed.attributes,
        class: changed.classes.join(" ")
    };
    if(changed.id) {
        changed.attributes.id = changed.id;
    } else {
        delete changed.attributes.id;
    }
    if(changed.href) changed.attributes.href = changed.href;

    return changed;
}

// Pages of size elements; each sample targets one element across a mutation of the whole page.
export function samples(count, size, severity, seed = 1, removed = 0.1) {
    const random = seededRandom(seed);
    const output = [];

    for(let sampleIndex = 0; sampleIndex < count; sampleIndex++) {
        const before = Array.from({ length: size }, () => element(random));

        // Look-alikes, as on real pages (repeated "learn more" links).
        for(let index = 0; index < size / 5; index++) {
            before[Math.floor(random() * size)] = {
                ...clone(before[0]),
                neighborText: phrase(random, 4)
            };
        }

        const target = Math.floor(random() * size);
        const after = before.map(features => mutate(random, features, severity));
        const order = after
            .map((_, index) => index)
            .sort(() => random() - 0.5);
        let candidates = order.map(index => after[index]);
        let answer = order.indexOf(target);

        if(random() < removed) {
            const removedIndex = answer;

            candidates = candidates.filter((_, index) => index !== removedIndex);
            answer = -1;
        }

        output.push({
            target: before[target],
            candidates,
            answer
        });
    }

    return output;
}
