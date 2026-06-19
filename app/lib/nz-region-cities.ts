/** NZ regions and cities/towns for marketplace location filters */

export const NZ_REGIONS = [
  "Northland",
  "Auckland",
  "Waikato",
  "Bay of Plenty",
  "Gisborne",
  "Hawke's Bay",
  "Taranaki",
  "Manawatu",
  "Wellington",
  "Nelson",
  "Marlborough",
  "West Coast",
  "Canterbury",
  "Otago",
  "Southland",
] as const;

export type NzRegion = (typeof NZ_REGIONS)[number];

export const NZ_REGION_CITIES: Record<NzRegion, readonly string[]> = {
  Northland: [
    "Ahipara",
    "Coopers Beach",
    "Dargaville",
    "Hikurangi",
    "Kaeo",
    "Kaitaia",
    "Kaikohe",
    "Kawakawa",
    "Kerikeri",
    "Mangawhai",
    "Mangonui",
    "Maungaturoto",
    "Moerewa",
    "Omapere",
    "Opononi",
    "Opua",
    "Paihia",
    "Rawene",
    "Ruakaka",
    "Russell",
    "Taipa",
    "Waipapa",
    "Wellsford",
    "Whangārei",
  ],
  Auckland: [
    "Albany",
    "Auckland",
    "Avondale",
    "Beachlands",
    "Birkenhead",
    "Botany Downs",
    "Browns Bay",
    "Clevedon",
    "Devonport",
    "East Auckland",
    "Ellerslie",
    "Glen Eden",
    "Glenfield",
    "Greenhithe",
    "Grey Lynn",
    "Henderson",
    "Hibiscus Coast",
    "Hobsonville",
    "Howick",
    "Kumeū",
    "Mairangi Bay",
    "Mangere",
    "Manukau",
    "Manurewa",
    "Massey",
    "Milford",
    "Mission Bay",
    "Mount Albert",
    "Mount Eden",
    "Mount Roskill",
    "Mount Wellington",
    "New Lynn",
    "North Shore",
    "Onehunga",
    "Orewa",
    "Otahuhu",
    "Pakuranga",
    "Papakura",
    "Parnell",
    "Penrose",
    "Pokeno",
    "Ponsonby",
    "Pukekohe",
    "Remuera",
    "Snells Beach",
    "South Auckland",
    "Takapuna",
    "Te Atatū",
    "Titirangi",
    "Waiheke Island",
    "Waimauku",
    "Warkworth",
    "West Auckland",
    "Westgate",
    "Whangaparāoa",
  ],
  Waikato: [
    "Cambridge",
    "Coromandel",
    "Hamilton",
    "Huntly",
    "Matamata",
    "Morrinsville",
    "Ngāruawāhia",
    "Otorohanga",
    "Paeroa",
    "Piopio",
    "Putaruru",
    "Raglan",
    "Taumarunui",
    "Taupō",
    "Te Aroha",
    "Te Awamutu",
    "Te Kūiti",
    "Thames",
    "Tirau",
    "Tokoroa",
    "Tuakau",
    "Waihi",
  ],
  "Bay of Plenty": [
    "Edgecumbe",
    "Katikati",
    "Kawerau",
    "Maketū",
    "Mount Maunganui",
    "Murupara",
    "Opotiki",
    "Papamoa",
    "Rotorua",
    "Tauranga",
    "Te Puke",
    "Te Puna",
    "Whakatāne",
    "Ōhope",
  ],
  Gisborne: [
    "Gisborne",
    "Ruatoria",
    "Te Karaka",
    "Tolaga Bay",
    "Tokomaru Bay",
  ],
  "Hawke's Bay": [
    "Bay View",
    "Clive",
    "Flaxmere",
    "Hastings",
    "Havelock North",
    "Napier",
    "Otane",
    "Taradale",
    "Takapau",
    "Waipawa",
    "Waipukurau",
    "Wairoa",
  ],
  Taranaki: [
    "Eltham",
    "Hāwera",
    "Inglewood",
    "Kaponga",
    "New Plymouth",
    "Opunake",
    "Patea",
    "Stratford",
    "Waitara",
    "Ōākura",
  ],
  Manawatu: [
    "Bulls",
    "Dannevirke",
    "Feilding",
    "Foxton",
    "Hunterville",
    "Levin",
    "Marton",
    "Ohakune",
    "Palmerston North",
    "Shannon",
    "Taihape",
    "Waiouru",
    "Whanganui",
    "Woodville",
  ],
  Wellington: [
    "Brooklyn",
    "Carterton",
    "Eastbourne",
    "Featherston",
    "Greytown",
    "Hutt Valley",
    "Island Bay",
    "Johnsonville",
    "Karori",
    "Kapiti Coast",
    "Kilbirnie",
    "Lower Hutt",
    "Martinborough",
    "Masterton",
    "Miramar",
    "Newtown",
    "Otaki",
    "Paraparaumu",
    "Petone",
    "Porirua",
    "Raumati",
    "Tawa",
    "Upper Hutt",
    "Waikanae",
    "Wellington",
  ],
  Nelson: [
    "Brightwater",
    "Mapua",
    "Motueka",
    "Murchison",
    "Nelson",
    "Richmond",
    "St Arnaud",
    "Takaka",
    "Wakefield",
  ],
  Marlborough: [
    "Blenheim",
    "Havelock",
    "Kaikōura",
    "Picton",
    "Renwick",
    "Seddon",
    "Ward",
  ],
  "West Coast": [
    "Franz Josef",
    "Fox Glacier",
    "Greymouth",
    "Harihari",
    "Hokitika",
    "Kumara",
    "Punakaiki",
    "Reefton",
    "Runanga",
    "Westport",
  ],
  Canterbury: [
    "Akaroa",
    "Amberley",
    "Ashburton",
    "Burnham",
    "Christchurch",
    "Darfield",
    "Geraldine",
    "Hornby",
    "Kaiapoi",
    "Leeston",
    "Lincoln",
    "Lyttelton",
    "Methven",
    "New Brighton",
    "Oxford",
    "Pleasant Point",
    "Prebbleton",
    "Rangiora",
    "Riccarton",
    "Rolleston",
    "Selwyn",
    "South Christchurch",
    "Temuka",
    "Timaru",
    "Waimate",
    "Woodend",
  ],
  Otago: [
    "Alexandra",
    "Arrowtown",
    "Balclutha",
    "Brighton",
    "Clyde",
    "Cromwell",
    "Dunedin",
    "Lawrence",
    "Milton",
    "Mosgiel",
    "Oamaru",
    "Palmerston",
    "Port Chalmers",
    "Queenstown",
    "Ranfurly",
    "Roxburgh",
    "Wanaka",
  ],
  Southland: [
    "Bluff",
    "Edendale",
    "Gore",
    "Invercargill",
    "Lumsden",
    "Mataura",
    "Otautau",
    "Riverton",
    "Stewart Island",
    "Te Anau",
    "Tuatapere",
    "Winton",
  ],
};

function normLoc(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\bmt\b/g, "mount")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Drop cities that normalize to the same key (macrons, spelling variants). */
function dedupeCities(cities: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const city of cities) {
    const key = normLoc(city);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(city);
  }
  return out;
}

export function getCitiesForRegion(region: string): string[] {
  if (region === "All") return [];
  const cities = NZ_REGION_CITIES[region as NzRegion];
  return cities ? dedupeCities(cities) : [];
}

export function listingMatchesRegion(location: string | undefined, region: string): boolean {
  if (!location?.trim() || region === "All") return region === "All";
  const loc = normLoc(location);
  const r = normLoc(region);
  if (loc === r || loc.includes(r)) return true;
  const cities = getCitiesForRegion(region);
  return cities.some((city) => {
    const c = normLoc(city);
    return loc === c || loc.includes(c) || c.includes(loc);
  });
}

export function listingMatchesCity(location: string | undefined, city: string): boolean {
  if (!city || city === "All") return true;
  if (!location?.trim()) return false;
  const loc = normLoc(location);
  const c = normLoc(city);
  return loc === c || loc.includes(c) || c.includes(loc);
}

/** Predefined cities plus any locations from live listings in that region. */
export function citiesForRegionFromListings(
  region: string,
  listings: { location?: string }[]
): string[] {
  const predefined = getCitiesForRegion(region);
  const seen = new Set(predefined.map((c) => normLoc(c)));
  const extra: string[] = [];

  for (const item of listings) {
    const loc = item.location?.trim();
    if (!loc || !listingMatchesRegion(loc, region)) continue;

    const n = normLoc(loc);
    const known = predefined.some((c) => {
      const cn = normLoc(c);
      return n === cn || n.includes(cn) || cn.includes(n);
    });
    if (known) continue;

    if (!seen.has(n)) {
      seen.add(n);
      extra.push(loc);
    }
  }

  return dedupeCities([...predefined, ...extra.sort((a, b) => a.localeCompare(b, "en-NZ"))]);
}
