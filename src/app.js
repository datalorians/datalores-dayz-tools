const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const typesInput = $("#typesFile");
const splitButton = $("#splitButton");
const downloadZipButton = $("#downloadZipButton");
const clearButton = $("#clearButton");
const copyFileButton = $("#copyFileButton");
const downloadFileButton = $("#downloadFileButton");
const statusEl = $("#status");
const fileListEl = $("#fileList");
const fileCountEl = $("#fileCount");
const fileViewer = $("#fileViewer");
const viewerTitle = $("#viewerTitle");
const viewerMeta = $("#viewerMeta");
const buildTimer = $("#buildTimer");
const splitStats = $("#splitStats");
const viewStats = $("#viewStats");
const views = $$("[data-view]");
const routeLinks = $$("[data-route]");
const maxTypesFileBytes = 10 * 1024 * 1024;

const namedTypes = {
  basebuilding: new Set(["Fence", "Watchtower"]),
  containers: new Set(["FilteringBottle", "GlassBottle", "WaterBottle"]),
  clothes: new Set(["GhillieSuit_Tan", "GhillieAtt_Winter", "OMKJacket_Navy", "OMKPants_Navy"]),
  crafting: new Set(["BoneBait", "BoneHook", "ImprovisedFishingRod", "SmallStone", "WoodenHook", "Worm"]),
  fireplaces: new Set(["Fireplace", "FireplaceFireBarrel", "FireplaceIndoor", "OvenIndoor"]),
  food: new Set([
    "DeadFox",
    "FoxSteakMeat",
    "ReindeerSteakMeat",
    "SteelheadTrout",
    "SteelheadTroutFilletMeat",
    "WalleyePollock",
    "WalleyePollockFilletMeat",
    "CraterellusMushroom",
    "RedCaviar",
  ]),
  keys: new Set(["ScientificBriefcaseKeys", "ShippingContainerKeys_Blue", "ShippingContainerKeys_Orange", "ShippingContainerKeys_Yellow"]),
  pelts: new Set(["FoxPelt", "Foxpelt", "ReindeerPelt"]),
  staticObjs: new Set(["Land_Boat_Small9_DE", "Static_FrozenScientist_DE"]),
  storage: new Set(["BarrelHoles_Blue", "BarrelHoles_Green", "BarrelHoles_Red", "BarrelHoles_Yellow", "ScientificBriefcase", "UndergroundStashSnow"]),
};

const armorPrefixes = ["BallisticHelmet", "GorkaHelmet", "GreatHelm", "HighCapacityVest", "Mich2001Helmet", "MotoHelmet", "PlateCarrier", "PressVest", "UKAssVest"];
const contaminationPrefixes = ["Land_Container_", "Land_Train_", "ContaminatedArea_Dynamic"];
const seasonalPrefixes = ["ChristmasTree", "Bonfire", "EasterEgg", "Aniversary"];
const vehiclePrefixes = ["Offroad", "CivilianSedan", "Hatchback", "Sedan", "Truck_01", "Boat_"];
const wreckPrefixes = ["Land_Wreck_", "Land_wreck_", "Wreck_"];
const zombiePrefixes = ["ZmbM_", "ZmbF_", "Zmbm_"];

const categoryRules = [
  ["ammo", (item) => nameOf(item).startsWith("Ammo_")],
  ["ammo_boxes", (item) => nameOf(item).startsWith("AmmoBox_")],
  ["animals", (item) => nameOf(item).startsWith("Animal_")],
  ["armbands", (item) => nameOf(item).startsWith("Armband_")],
  ["armor", (item) => startsWithAny(nameOf(item), armorPrefixes)],
  ["basebuilding", (item) => namedTypes.basebuilding.has(nameOf(item))],
  ["contamination", (item) => startsWithAny(nameOf(item), contaminationPrefixes)],
  ["crafting", (item) => namedTypes.crafting.has(nameOf(item))],
  ["explosives", (item) => categoryName(item) === "explosives"],
  ["fireplaces", (item) => namedTypes.fireplaces.has(nameOf(item))],
  ["flags", (item) => nameOf(item).startsWith("Flag_")],
  ["food", (item) => categoryName(item) === "food" || namedTypes.food.has(nameOf(item))],
  ["keys", (item) => namedTypes.keys.has(nameOf(item))],
  ["pelts", (item) => namedTypes.pelts.has(nameOf(item))],
  ["seasonal", (item) => hasUsage(item, "SeasonalEvent") || startsWithAny(nameOf(item), seasonalPrefixes)],
  ["staticObjs", (item) => nameOf(item).startsWith("StaticObj_") || namedTypes.staticObjs.has(nameOf(item))],
  ["storage", (item) => namedTypes.storage.has(nameOf(item))],
  ["vehicles", (item) => startsWithAny(nameOf(item), vehiclePrefixes)],
  ["vehicleParts", (item) => categoryName(item) === "lootdispatch"],
  ["weapons", (item) => categoryName(item) === "weapons"],
  ["wrecks", (item) => startsWithAny(nameOf(item), wreckPrefixes)],
  ["zombies", (item) => startsWithAny(nameOf(item), zombiePrefixes)],
  ["containers", (item) => categoryName(item) === "containers" || namedTypes.containers.has(nameOf(item))],
  ["clothes", (item) => categoryName(item) === "clothes" || namedTypes.clothes.has(nameOf(item))],
  ["tools", (item) => categoryName(item) === "tools"],
  ["uncategorized", () => true],
];

let generatedFiles = [];
let selectedFileName = "";
let viewedTool = false;

typesInput.addEventListener("change", () => {
  const file = typesInput.files[0];
  const tooLarge = file?.size > maxTypesFileBytes;
  splitButton.disabled = !file || tooLarge;
  if (tooLarge) {
    setStatus("types.xml is too large. Keep files under 10 MB.", true);
  } else {
    setStatus(file ? "Ready to split." : "Choose a types.xml file to begin.");
  }
});

splitButton.addEventListener("click", splitSelectedFile);
downloadZipButton.addEventListener("click", downloadZip);
clearButton.addEventListener("click", clearOutput);
copyFileButton.addEventListener("click", copySelectedFile);
downloadFileButton.addEventListener("click", downloadSelectedFile);
window.addEventListener("popstate", renderRoute);

for (const link of routeLinks) {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const route = link.getAttribute("href");
    if (window.location.pathname !== route) {
      history.pushState({}, "", route);
    }
    renderRoute();
  });
}

renderRoute();
requestAnimationFrame(() => {
  buildTimer.textContent = `loaded in ${Math.round(performance.now())} ms`;
});
refreshStats();

function renderRoute() {
  const route = window.location.pathname.replace(/\/$/, "") === "/typesplitter" ? "/typesplitter" : "/";
  const activeView = route === "/typesplitter" ? "typesplitter" : "home";

  for (const view of views) {
    view.hidden = view.dataset.view !== activeView;
  }

  for (const link of routeLinks) {
    const isActive = link.dataset.route === route;
    link.classList.toggle("is-active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  }

  document.title = route === "/typesplitter" ? "Types Splitter - Datalore's DayZ Tools" : "Datalore's DayZ Tools";

  if (route === "/typesplitter" && !viewedTool) {
    viewedTool = true;
    recordEvent("/api/view", { tool: "typesplitter" });
  }
}

async function splitSelectedFile() {
  try {
    clearOutput(false);
    const file = typesInput.files[0];
    if (!file) {
      throw new Error("Choose a types.xml file to begin.");
    }
    if (file.size > maxTypesFileBytes) {
      throw new Error("types.xml is too large. Keep files under 10 MB.");
    }
    const text = await file.text();
    const doc = parseXml(text, "types.xml");
    const result = splitTypes(doc);
    const categoryFiles = buildFiles(result);
    const economyCore = buildEconomySection(categoryFiles.map((file) => file.name));

    generatedFiles = [{
      name: "cfgeconomycore.xml",
      count: null,
      text: economyCore,
    }, ...categoryFiles];

    selectedFileName = "cfgeconomycore.xml";
    downloadZipButton.disabled = false;
    renderFiles();
    showSelectedFile();
    setStatus(`Created ${generatedFiles.length - 1} category files.`);
    recordEvent("/api/split", {
      tool: "typesplitter",
      generatedFiles: categoryFiles.length,
      sourceName: file.name,
    });
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function refreshStats() {
  try {
    const response = await fetch("/api/stats");
    if (!response.ok) return;
    const stats = await response.json();
    splitStats.textContent = `types generated: ${stats.typesGenerated}`;
    viewStats.textContent = `visitors: ${stats.visitors}`;
  } catch {
  }
}

async function recordEvent(path, details) {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(details),
    });
    if (!response.ok) return;
    const stats = await response.json();
    splitStats.textContent = `types generated: ${stats.typesGenerated}`;
    viewStats.textContent = `visitors: ${stats.visitors}`;
  } catch {
  }
}

function splitTypes(doc) {
  const buckets = new Map(categoryRules.map(([category]) => [category, []]));
  for (const item of doc.querySelectorAll("type")) {
    const match = categoryRules.find(([, test]) => test(item));
    buckets.get(match[0]).push(item);
  }
  return buckets;
}

function buildFiles(buckets) {
  const serializer = new XMLSerializer();
  return [...buckets.entries()]
    .filter(([, items]) => items.length > 0)
    .map(([category, items]) => {
      const doc = document.implementation.createDocument("", "types");
      const root = doc.documentElement;
      for (const item of items) {
        root.appendChild(item.cloneNode(true));
      }
      return {
        name: `${category}.xml`,
        count: items.length,
        text: prettyXml(serializer.serializeToString(doc)),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildEconomySection(files) {
  const lines = ['<ce folder="types">'];
  for (const file of [...new Set(files)].sort()) {
    lines.push(`\t<file name="${file}" type="types" />`);
  }
  lines.push("</ce>");
  return `${lines.join("\n")}\n`;
}

function renderFiles() {
  fileListEl.replaceChildren();
  fileCountEl.textContent = `${generatedFiles.length} files`;

  for (const file of generatedFiles) {
    const row = document.createElement("button");
    row.className = "file-row";
    row.type = "button";
    row.dataset.fileName = file.name;
    row.setAttribute("aria-pressed", String(file.name === selectedFileName));
    row.addEventListener("click", () => {
      selectedFileName = file.name;
      renderFiles();
      showSelectedFile();
    });

    const name = document.createElement("strong");
    name.textContent = file.name;

    const count = document.createElement("span");
    count.textContent = file.count === null ? "section" : `${file.count} types`;

    row.append(name, count);
    fileListEl.append(row);
  }
}

function showSelectedFile() {
  const file = selectedFile();
  const hasFile = Boolean(file);

  viewerTitle.textContent = hasFile ? file.name : "File Preview";
  viewerMeta.textContent = hasFile && file.count !== null ? `${file.count} types` : hasFile ? "economycore section" : "No file selected";
  fileViewer.value = hasFile ? file.text : "";
  copyFileButton.disabled = !hasFile;
  downloadFileButton.disabled = !hasFile;
}

function parseXml(text, label) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const error = doc.querySelector("parsererror");
  if (error) {
    throw new Error(`${label} is not valid XML.`);
  }
  return doc;
}

function prettyXml(xml) {
  return xml
    .replace(/></g, ">\n<")
    .replace(/<type /g, "  <type ")
    .replace(/<\/type>/g, "  </type>")
    .replace(/<(nominal|lifetime|restock|min|quantmin|quantmax|cost|flags|category|tag|usage|value)([ >/])/g, "    <$1$2")
    .replace(/<\/types>/, "</types>\n");
}

function nameOf(item) {
  return item.getAttribute("name") || "";
}

function categoryName(item) {
  return item.querySelector("category")?.getAttribute("name")?.toLowerCase() || "";
}

function hasUsage(item, usageName) {
  return [...item.querySelectorAll("usage")].some((usage) => usage.getAttribute("name") === usageName);
}

function startsWithAny(value, prefixes) {
  return prefixes.some((prefix) => value.startsWith(prefix));
}

function downloadText(name, text) {
  const blob = new Blob([text], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

async function copySelectedFile() {
  const file = selectedFile();
  if (!file) return;
  await navigator.clipboard.writeText(file.text);
  setStatus(`Copied ${file.name}.`);
}

function downloadSelectedFile() {
  const file = selectedFile();
  if (!file) return;
  downloadText(file.name, file.text);
}

function selectedFile() {
  return generatedFiles.find((file) => file.name === selectedFileName);
}

function downloadZip() {
  if (!generatedFiles.length) return;
  const files = generatedFiles.map((file) => ({
    name: file.name === "cfgeconomycore.xml" ? file.name : `types/${file.name}`,
    text: file.text,
  }));
  const blob = createZip(files);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "datalore-types-split.zip";
  link.click();
  URL.revokeObjectURL(url);
  setStatus("Downloaded generated files zip.");
}

function createZip(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const centralDirectory = [];
  const dosDate = 33;
  const dosTime = 0;
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = encoder.encode(file.text);
    const crc = crc32(data);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(localHeader.buffer);

    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, dosTime, true);
    view.setUint16(12, dosDate, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);

    chunks.push(localHeader, data);
    centralDirectory.push({ file, nameBytes, data, crc, offset });
    offset += localHeader.length + data.length;
  }

  const centralStart = offset;
  for (const entry of centralDirectory) {
    const header = new Uint8Array(46 + entry.nameBytes.length);
    const view = new DataView(header.buffer);

    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, dosTime, true);
    view.setUint16(14, dosDate, true);
    view.setUint32(16, entry.crc, true);
    view.setUint32(20, entry.data.length, true);
    view.setUint32(24, entry.data.length, true);
    view.setUint16(28, entry.nameBytes.length, true);
    view.setUint32(42, entry.offset, true);
    header.set(entry.nameBytes, 46);

    chunks.push(header);
    offset += header.length;
  }

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, centralDirectory.length, true);
  endView.setUint16(10, centralDirectory.length, true);
  endView.setUint32(12, offset - centralStart, true);
  endView.setUint32(16, centralStart, true);
  chunks.push(end);

  return new Blob(chunks, { type: "application/zip" });
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function clearOutput(clearInputs = true) {
  generatedFiles = [];
  selectedFileName = "";
  fileListEl.replaceChildren();
  fileCountEl.textContent = "0 files";
  fileViewer.value = "";
  viewerTitle.textContent = "File Preview";
  viewerMeta.textContent = "No file selected";
  copyFileButton.disabled = true;
  downloadFileButton.disabled = true;
  downloadZipButton.disabled = true;
  statusEl.classList.remove("error");
  if (clearInputs) {
    typesInput.value = "";
    splitButton.disabled = true;
    setStatus("Choose a types.xml file to begin.");
  }
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();
