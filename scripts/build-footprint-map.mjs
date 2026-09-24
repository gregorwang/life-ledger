#!/usr/bin/env node
/**
 * Builds apps/web/src/geo/footprint-map.json, the offline data behind the
 * 足迹 「点亮地图」: simplified world + China outlines and the lookup tables
 * that turn a place's free-text country / city into a map region.
 *
 * Nothing here runs at request time and the page never calls a map service.
 *
 * Sources (download into one folder, then pass it as the first argument):
 *   Natural Earth (public domain), https://github.com/nvkelso/natural-earth-vector/tree/master/geojson
 *     ne_10m_admin_0_countries_chn.geojson   world, China point of view
 *     ne_10m_admin_0_countries.geojson        Taiwan / Hong Kong / Macao outlines
 *     ne_10m_admin_1_states_provinces.geojson Chinese provinces
 *     ne_10m_populated_places.geojson         cities with Chinese names
 *   china-division (MIT, 国家统计局 codes), npm package
 *
 * Usage:
 *   npm i --prefix <dir> mapshaper@0.6 d3-geo@3 china-division@2
 *   node scripts/build-footprint-map.mjs <dir>
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const sourceDir = resolve(process.argv[2] ?? ".");
const require = createRequire(join(sourceDir, "package.json"));
const { geoContains } = require("d3-geo");
const divisionCities = require("china-division/dist/cities.json");
const divisionAreas = require("china-division/dist/areas.json");
const divisionProvinces = require("china-division/dist/provinces.json");
const mapshaper = join(sourceDir, "node_modules/.bin/mapshaper");
const work = mkdtempSync(join(sourceDir, "work-"));
const src = (name) => join(sourceDir, name);
const tmp = (name) => join(work, name);
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

function run(...args) {
  execFileSync(mapshaper, [...args, "-quiet"], { stdio: "inherit" });
}

/** Natural Earth ISO 3166-2 → 国家统计局 province code. */
const PROVINCE_CODES = {
  "CN-BJ": "11", "CN-TJ": "12", "CN-HE": "13", "CN-SX": "14", "CN-NM": "15",
  "CN-LN": "21", "CN-JL": "22", "CN-HL": "23", "CN-SH": "31", "CN-JS": "32",
  "CN-ZJ": "33", "CN-AH": "34", "CN-FJ": "35", "CN-JX": "36", "CN-SD": "37",
  "CN-HA": "41", "CN-HB": "42", "CN-HN": "43", "CN-GD": "44", "CN-GX": "45",
  "CN-HI": "46", "CN-X01~": "46", "CN-CQ": "50", "CN-SC": "51", "CN-GZ": "52",
  "CN-YN": "53", "CN-XZ": "54", "CN-SN": "61", "CN-GS": "62", "CN-QH": "63",
  "CN-NX": "64", "CN-XJ": "65",
};
const SAR_CODES = { TWN: "71", HKG: "81", MAC: "82" };
const PROVINCE_NAMES = {
  ...Object.fromEntries(divisionProvinces.map((item) => [item.code, item.name])),
  71: "台湾省", 81: "香港特别行政区", 82: "澳门特别行政区",
};

/** 浙江省 → 浙江, 广西壮族自治区 → 广西, 香港特别行政区 → 香港. */
function shortProvince(name) {
  return name.replace(/(省|市|特别行政区|壮族自治区|回族自治区|维吾尔自治区|自治区)$/u, "");
}

/** 杭州市 → 杭州, 阳朔县 → 阳朔, 大理白族自治州 → 大理, 阿勒泰地区 → 阿勒泰. */
function shortPlace(name) {
  const stripped = name
    .replace(/(各族|蒙古族|藏族|回族|苗族|侗族|彝族|白族|哈尼族|傣族|壮族|土家族|布依族|朝鲜族|哈萨克|柯尔克孜|景颇族|傈僳族|羌族|黎族|瑶族|畲族|土族|撒拉族|达斡尔族|满族|仡佬族|水族|纳西族|怒族|独龙族|拉祜族|佤族|佤族拉祜族|东乡族|保安族|裕固族|锡伯)*(自治州|自治县|自治旗)$/u, "")
    .replace(/(市|县|地区|盟|区|旗|林区|特区)$/u, "");
  return stripped.length >= 2 ? stripped : name;
}

// World: China point of view (Taiwan inside China), no Antarctica.
run(
  src("ne_10m_admin_0_countries_chn.geojson"),
  "-filter", "ADM0_A3 !== 'ATA'",
  "-each", "id = ADM0_A3, n = ({CHN: '中国', KOR: '韩国', PRK: '朝鲜', HKG: '中国香港', MAC: '中国澳门'})[ADM0_A3] || NAME_ZH",
  "-filter-fields", "id,n",
  "-simplify", "3%", "keep-shapes",
  "-o", tmp("world.geojson"), "format=geojson", "precision=0.01",
);

// China: provinces (de facto), topped up to the China-POV national outline.
run(
  src("ne_10m_admin_1_states_provinces.geojson"),
  "-filter", "adm0_a3 === 'CHN'",
  "-each", `code = (${JSON.stringify(PROVINCE_CODES)})[iso_3166_2]`,
  "-filter-fields", "code",
  "-o", tmp("provinces.geojson"), "format=geojson",
);
run(
  src("ne_10m_admin_0_countries.geojson"),
  "-filter", "['TWN','HKG','MAC'].includes(ADM0_A3)",
  "-each", `code = (${JSON.stringify(SAR_CODES)})[ADM0_A3]`,
  "-filter-fields", "code",
  "-o", tmp("sar.geojson"), "format=geojson",
);
// Land China claims that the de facto provinces leave out (藏南 and a few
// slivers along the Xizang border) is folded into 西藏.
run(
  src("ne_10m_admin_0_countries_chn.geojson"),
  "-filter", "ADM0_A3 === 'CHN'",
  "-erase", tmp("provinces.geojson"),
  "-erase", tmp("sar.geojson"),
  "-explode",
  "-filter", "this.area > 2e8 && this.centroidX > 77 && this.centroidX < 97 && this.centroidY < 35",
  "-each", "code = '54'",
  "-filter-fields", "code",
  "-o", tmp("claimed.geojson"), "format=geojson",
);
run(
  "-i", tmp("provinces.geojson"), tmp("sar.geojson"), tmp("claimed.geojson"), "combine-files",
  "-merge-layers", "force",
  "-dissolve", "code",
  "-o", tmp("china-full.geojson"), "format=geojson",
);
run(
  tmp("china-full.geojson"),
  "-each", `id = code, n = (${JSON.stringify(Object.fromEntries(Object.entries(PROVINCE_NAMES).map(([code, name]) => [code, shortProvince(name)])))})[code]`,
  "-filter-fields", "id,n",
  "-simplify", "4%", "keep-shapes",
  "-o", tmp("china.geojson"), "format=geojson", "precision=0.01",
);

// One TopoJSON with both layers; shared borders are stored once.
run(
  "-i", tmp("world.geojson"), tmp("china.geojson"), "combine-files",
  "-rename-layers", "world,china",
  "-o", tmp("map.topojson"), "format=topojson", "quantization=20000", "target=*",
);
const topology = readJson(tmp("map.topojson"));

// Country aliases → world feature id.
const countries = {};
const addCountry = (alias, id) => {
  const key = String(alias ?? "").trim().toLowerCase();
  if (key && key !== "-99" && !(key in countries)) countries[key] = id;
};
for (const { properties: p } of readJson(src("ne_10m_admin_0_countries_chn.geojson")).features) {
  for (const field of ["NAME_ZH", "NAME_ZHT", "NAME", "NAME_LONG", "NAME_EN", "ADMIN", "FORMAL_EN", "GEOUNIT", "SUBUNIT", "BRK_NAME", "NAME_ALT", "ISO_A2", "ADM0_A3"]) {
    addCountry(p[field], p.ADM0_A3);
  }
}
const MANUAL_COUNTRIES = {
  CHN: ["中国", "中国大陆", "大陆", "内地", "国内", "中华人民共和国", "prc", "台湾", "臺灣", "中国台湾", "taiwan"],
  HKG: ["香港", "中国香港", "hk"], MAC: ["澳门", "澳門", "中国澳门", "macau"],
  KOR: ["韩国", "南韩", "korea"], PRK: ["朝鲜", "北韩"], USA: ["美国", "美利坚", "us", "usa"],
  GBR: ["英国", "英格兰", "苏格兰", "uk", "england", "scotland"], RUS: ["俄罗斯", "俄国"],
  JPN: ["日本", "japan"], VNM: ["越南"], THA: ["泰国"], SGP: ["新加坡"], MYS: ["马来西亚", "大马"],
  NLD: ["荷兰"], CZE: ["捷克"], NZL: ["新西兰"], AUS: ["澳大利亚", "澳洲"], ARE: ["阿联酋", "迪拜"],
};
for (const [id, aliases] of Object.entries(MANUAL_COUNTRIES)) {
  for (const alias of aliases) countries[alias.toLowerCase()] = id;
}

// Province aliases (full, short, English) → code.
const chinaFeatures = readJson(tmp("china-full.geojson")).features;
const provinces = {};
for (const [code, name] of Object.entries(PROVINCE_NAMES)) {
  provinces[name] = code;
  provinces[shortProvince(name)] = code;
}
for (const { properties: p } of readJson(src("ne_10m_admin_1_states_provinces.geojson")).features) {
  const code = p.adm0_a3 === "CHN" ? PROVINCE_CODES[p.iso_3166_2] : null;
  if (code && p.name) provinces[p.name.toLowerCase()] = code;
}
Object.assign(provinces, {
  内蒙: "15", 台灣: "71", 臺灣: "71", 澳門: "82", 中国台湾: "71", 中国香港: "81", 中国澳门: "82",
  hongkong: "81", "hong kong": "81", macau: "82", macao: "82", taiwan: "71",
});

function provinceAt(lon, lat) {
  return chinaFeatures.find((feature) => geoContains(feature, [lon, lat]))?.properties.code ?? "";
}

// Cities with coordinates: [name, lon, lat, countryId, provinceCode].
const WORLD_ID = { TWN: "CHN" };
const cities = [];
const seen = new Map();
const places = readJson(src("ne_10m_populated_places.geojson")).features
  .map(({ properties: p }) => p)
  .sort((a, b) => b.POP_MAX - a.POP_MAX);
for (const p of places) {
  const country = WORLD_ID[p.ADM0_A3] ?? p.ADM0_A3;
  const lon = Math.round(p.LONGITUDE * 100) / 100;
  const lat = Math.round(p.LATITUDE * 100) / 100;
  const province = ["CHN", "HKG", "MAC"].includes(country) ? provinceAt(p.LONGITUDE, p.LATITUDE) : "";
  // Every Chinese name; English only for well-known cities, to keep the file small.
  for (const raw of p.SCALERANK <= 4 ? [p.NAME_ZH, p.NAME] : [p.NAME_ZH]) {
    const name = String(raw ?? "").trim().replace(/市$/u, "");
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue; // Biggest city wins a shared name.
    seen.set(key, cities.length);
    cities.push([name, lon, lat, country, province]);
  }
}

// Chinese prefectures and counties without coordinates: name → province code.
// Districts (区) repeat across cities too often to mean anything alone.
const divisions = {};
const clashes = new Set();
const addDivision = (name, code) => {
  for (const key of new Set([name, shortPlace(name)])) {
    if (key in divisions && divisions[key] !== code) clashes.add(key);
    else divisions[key] = code;
  }
};
for (const city of divisionCities) {
  if (!/^(市辖区|县|省直辖县级行政区划|自治区直辖县级行政区划)$/u.test(city.name)) addDivision(city.name, city.provinceCode);
}
for (const area of divisionAreas) {
  if (!area.name.endsWith("区")) addDivision(area.name, area.provinceCode);
}
for (const key of clashes) delete divisions[key];

const out = resolve("apps/web/src/geo/footprint-map.json");
writeFileSync(out, JSON.stringify({ topology, countries, provinces, cities, divisions }));
console.log(`wrote ${out}: ${cities.length} cities, ${Object.keys(divisions).length} divisions, ${Object.keys(countries).length} country aliases`);
