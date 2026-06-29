# Architektur-Design: Mehrere Algsets

Status: **Vorschlag / Diskussionsgrundlage** (noch nicht umgesetzt)

Ziel dieses Dokuments: eine tragfähige Basis schaffen, damit neben **LTCT**
weitere Algsets (z. B. 3-Twists, Kommutatoren) hinzugefügt werden können –
ohne die UI oder die Kernlogik jedes Mal umzubauen. „Neuer Algset" soll am
Ende heißen: **eine Datendatei + ein Registry-Eintrag**.

---

## 1. Ist-Zustand

Heute ist die App fest auf das LTCT-Datenmodell verdrahtet.

**Daten:** `src/assets/ltct_map.json` – 252 Cases, eager beim Start geladen
(436 KB / 94 KB gzip ≈ der gesamte Entry-Chunk). Eintragsform:

```json
"UU UFL LUB": { "key": "UU UFL LUB", "algs": ["..."], "scrambles": ["..."] }
```

**Der Key ist ein positionsbasierter String** `"<group> <target> <twist>"`,
der an vielen Stellen per `split(' ')[i]` zerlegt wird. Die wichtigsten
Kopplungspunkte:

| Datei | Kopplung an LTCT |
|---|---|
| `stores/SelectedStore.js` | `Object.keys(ltct_map)`, `compareKeys` mit fixem `GROUP_ORDER = {UU,UD,DU,DD}` + `SPEFFZ_ORDER` |
| `helpers/helpers.js` | `parseLtctKey` nimmt genau 3 Speffz-Teile an |
| `helpers/scramble_utils.js` | `makeScramble` liest fix `ltct_map[caseKey]` |
| `components/timer/SetupAndAlgs.vue` | `ltct_map[caseKey].algs` |
| `components/select_view/MainCaseGrid.vue` | Gruppen aus `key.split(' ')[0]` |
| `components/select_view/GroupCard.vue` | Subgroups aus `split[1]` |
| `components/select_view/SubgroupCard.vue` | Cases aus `split[2]` |
| `stores/SessionStore.js`, `helpers/srs.js` | Session/SRS über rohe Case-Keys |

**Persistenz** (localStorage) speichert rohe Case-Keys **ohne Algset-Bezug**:

| Key | Inhalt |
|---|---|
| `currentLtctArray` | Array ausgewählter Case-Keys |
| `ltctTrainerNotes` | `{ caseKey: note }` |
| `ltct_presets_arrays` | `{ presetName: [caseKeys] }` |
| (SRS-Daten) | pro Case-Key |

**Folge:** Ein zweiter Algset würde (a) `ltct_map.json` und damit den
Kaltstart aufblähen, (b) an *jedem* `split(' ')`-Punkt Sonderfälle brauchen
und (c) seine Auswahl/Notes/Presets mit LTCT vermischen.

> Hinweis: Die kürzlich erfolgte Umbenennung **ZBLL→Case / COLL→Subgroup /
> OLL→Group** hat begrifflich schon vorgearbeitet. Was fehlt, ist die
> *Entkopplung* von Datenquelle, Key-Format und Persistenz.

---

## 2. Zielarchitektur – Überblick

Drei neue Bausteine, der Rest liest nur noch über sie:

```
            ┌────────────────────────┐
            │   Algset-Registry      │   statische Liste aller Sets
            │  (ltct, twists3, …)    │   (id, name, levels, load())
            └───────────┬────────────┘
                        │ wählt aktiven Set
            ┌───────────▼────────────┐
            │   AlgsetStore (neu)    │   lädt Daten LAZY, baut Index + Baum,
            │  cases / tree / parse  │   liefert parse()/compare()/levels
            └───────────┬────────────┘
                        │ liest
   ┌────────────────────┼─────────────────────┐
   │                    │                      │
SelectedStore     MainCaseGrid/…          SessionStore / SRS
(Auswahl,         (rendert Hierarchie     (Scrambles/Algs über den
 namespaced)       aus levels+tree)         aktiven Set auflösen)
```

Kernidee: **Die UI und die Stores kennen keine LTCT-Spezifika mehr.** Sie
fragen den aktiven Algset nach „welche Ebenen gibt es, welche Knoten, wie
heißt ein Knoten, wie sortiere ich" – und der Algset antwortet datengetrieben.

---

## 3. Das Datenschema

Statt positionsbasierter Strings bekommt jeder Case **explizite Metadaten**.
(TypeScript-Notation; siehe Abschnitt 11 zur schrittweisen TS-Einführung.)

```ts
// Ein einzelner trainierbarer Fall
interface AlgCase {
  id: string          // stabil & eindeutig im Set, z. B. "UU UFL LUB"
  path: string[]      // Hierarchiewerte top→tief, z. B. ["UU", "UFL", "LUB"]
  algs: string[]
  scrambles?: string[]
}

// Eine Ebene der Hierarchie (z. B. Group, Subgroup, Case)
interface AlgsetLevel {
  id: string                              // "group" | "subgroup" | "case"
  // Anzeige eines Knotenwerts: Hauptlabel + optionales Sticker-Kürzel
  display(value: string, ctx: DisplayCtx): { primary: string; secondary?: string }
  order?: string[]                        // optionale explizite Sortierreihenfolge
}

// Ein Algset
interface Algset {
  id: string                 // "ltct" | "twists3" | "comms3"
  name: string               // lokalisierter Anzeigename (i18n-Key)
  levels: AlgsetLevel[]      // top..tief; das letzte Level IST der Case
  usesLetterScheme: boolean  // nutzt der Set das Speffz-Letter-Scheme?
  load(): Promise<AlgCase[]> // LAZY: import('…json') beim Aktivieren
}
```

Das Entscheidende ist **`path`**: die Hierarchie steht explizit im Datum,
nicht implizit in der String-Position. Damit kann ein Set 3 Ebenen haben
(LTCT) oder 2 oder 4 – die UI rendert generisch so viele Collapsibles wie
`levels` lang ist.

**Beispiel LTCT** (heutiges Verhalten, nur anders ausgedrückt):

```ts
const ltct: Algset = {
  id: "ltct",
  name: "algset.ltct",
  usesLetterScheme: true,
  levels: [
    { id: "group",    display: v => ({ primary: v }),                       order: ["UU","UD","DU","DD"] },
    { id: "subgroup", display: (v,c) => ({ primary: c.toLetter(v), secondary: v }) },
    { id: "case",     display: (v,c) => ({ primary: c.toLetter(v), secondary: v }) },
  ],
  load: () => import("@/assets/algsets/ltct.json").then(m => normalize(m.default)),
}
```

`normalize()` macht aus dem heutigen `{ "UU UFL LUB": {...} }` einmalig
`AlgCase[]` mit `id` und `path = id.split(' ')`. (Langfristig wird die
Generierung – siehe Abschnitt 8 – direkt das `AlgCase[]`-Schema erzeugen.)

---

## 4. Registry & AlgsetStore

**Registry** – eine statische Liste; mehr braucht ein neuer Set nicht:

```ts
// stores/algsets/registry.js
export const ALGSETS = [ ltct /*, twists3, comms3, … */ ]
export const DEFAULT_ALGSET_ID = "ltct"
```

**AlgsetStore** – kapselt den *aktiven* Set, lädt seine Daten lazy und
ersetzt die heutigen direkten `ltct_map`-Zugriffe:

```ts
export const useAlgsetStore = defineStore('algset', () => {
  const activeId = ref(loadActiveIdFromStorage())   // persistiert
  const cases = ref([])                              // AlgCase[] des aktiven Sets
  const byId  = computed(() => index(cases.value))   // id -> AlgCase
  const tree  = computed(() => buildTree(cases.value, active.value.levels))
  const active = computed(() => ALGSETS.find(a => a.id === activeId.value))

  async function activate(id) {
    activeId.value = id
    cases.value = await ALGSETS.find(a => a.id === id).load()   // LAZY
    persistActiveId(id)
  }
  return { activeId, active, cases, byId, tree, activate }
})
```

`buildTree` erzeugt aus den `path`-Arrays die geschachtelte Struktur, die
die UI rendert (statt `split(' ')` in drei Komponenten).

---

## 5. Wie Stores/UI davon lesen

**`SelectedStore`** behält seine öffentliche API weitgehend (add/remove auf
Ebenen, `numCasesIn…Selected`, `totalCasesSelected`), arbeitet aber gegen
`AlgsetStore.byId`/`tree` statt gegen `ltct_map`. Statt `key.startsWith(
"${group} ${subgroup} ")` werden Knoten über den Baum/`path` aggregiert –
also unabhängig vom String-Format.

**`MainCaseGrid` / `GroupCard` / `SubgroupCard` / `CaseCard`** werden
*generisch* über `levels` + `tree`:

- `MainCaseGrid` rendert die Knoten der ersten Ebene.
- Ein generischer `<HierarchyNode :level="i">` rendert pro Ebene den
  Header (Label via `levels[i].display`), den Dropdown-Pfeil und – solange
  es eine tiefere Ebene gibt – rekursiv die Kindknoten; auf der letzten
  Ebene die Case-Karten.
- Die bestehende Optik (Wells, Leisten, Header-Tönungen, Auswahlfarben)
  bleibt; nur die Datenherkunft ändert sich.

> Pragmatischer Zwischenschritt: Wir können die *heutigen* drei Komponenten
> zunächst nur parametrisieren (Werte/Labels aus `levels` statt `split`),
> ohne sofort auf volle N-Ebenen-Rekursion zu gehen. Das hält Phase 1 klein.

**`scramble_utils` / `SetupAndAlgs` / `SessionStore` / `srs`** lösen Algs und
Scrambles über `AlgsetStore.byId[caseId]` auf statt über `ltct_map[key]`.

---

## 6. Persistenz pro Algset (Namespacing)

Alles, was heute unter rohen Case-Keys liegt, wird pro Set getrennt – sonst
kollidieren Sets und lassen sich nicht unabhängig (de)aktivieren.

```jsonc
// ltct_selection  (ersetzt currentLtctArray)
{ "ltct": ["UU UFL LUB", …], "twists3": ["…"] }

// ltctTrainerNotes
{ "ltct": { "UU UFL LUB": "odd regrip" }, "twists3": { … } }

// ltct_presets_arrays
{ "ltct": { "to learn": ["…"] }, "twists3": { … } }

// SRS-Daten analog je Set
```

**Migration (einmalig, abwärtskompatibel):** beim ersten Start die alten
flachen Werte unter den `"ltct"`-Namespace heben – genau das Muster, das
wir schon mit `migrateLocalStorageKey` (siehe `helpers/helpers.js`) nutzen.
Bestehende Nutzer verlieren also nichts.

---

## 7. Daten-Pipeline

Heute liegt eine Riesendatei `ltct_map.json` im `src/assets`. Künftig:

```
src/assets/algsets/
  ltct.json
  twists3.json
  comms3.json
```

- Jede Datei wird **dynamisch importiert** (`import('@/assets/algsets/ltct.json')`)
  → Vite code-splittet sie automatisch, sie lädt erst beim Aktivieren des
  Sets. Der Kaltstart bleibt konstant, egal wie viele Sets dazukommen.
- Die Generierungs-Skripte unter `scripts/` (`generate_scrambles.mjs`,
  `fetch_blddb_algs.mjs`, …) erzeugen pro Set eine Datei **direkt im
  `AlgCase[]`-Schema** (mit `id` + `path`), statt der heutigen Map.

---

## 8. Migrationsplan (jede Phase einzeln testbar)

1. **Schema + Registry einführen, LTCT einhängen.** `Algset`/`AlgCase`,
   Registry mit *einem* Eintrag (LTCT), `normalize()` über die bestehende
   `ltct_map.json`. **Verhaltensneutral** – die App tut exakt dasselbe.
2. **Stores/UI auf die Abstraktion umstellen.** `SelectedStore`,
   `scramble_utils`, `SetupAndAlgs`, `SessionStore`, die Card-Komponenten
   lesen über `AlgsetStore`. Weiterhin nur LTCT, weiterhin verhaltensneutral.
3. **Persistenz namespacen + migrieren** (Abschnitt 6).
4. **Daten splitten + lazy laden** (Abschnitt 7); `ltct.json` aus dem
   Entry-Chunk holen.
5. **Zweiten Set hinzufügen** (z. B. 3-Twists) – validiert die Abstraktion
   end-to-end. Ab hier: neuer Set = Datendatei + Registry-Eintrag.
6. **Algset-Picker im UI** (Navbar/Select-Ansicht), inkl. Persistenz des
   aktiven Sets.

Die Phasen 1–4 ändern **kein** sichtbares Verhalten – sie sind reines
Fundament und lassen sich mit Tests (Abschnitt 9) absichern, bevor der
zweite Set dazukommt.

---

## 9. TypeScript & Tests (begleitend)

- **TypeScript** zuerst genau für dieses Datenmodell (`AlgCase`, `Algset`,
  `AlgsetLevel`) und die Stores. Genau hier zahlt es sich aus: ein neuer Set,
  der von der Form abweicht, fällt beim Kompilieren auf (denselben latenten
  Fehler wie früher bei `toggleSelected` – Zugriff auf nie existierende
  Felder – hätte der Compiler verhindert). Inkrementell via `allowJs`.
- **Tests (Vitest)** um die Kernlogik: Auswahl-Aggregation
  (`numCasesIn…Selected`, add/remove pro Ebene), `buildTree`, Sortierung,
  SRS-Auswahl. So bricht das Hinzufügen von Sets nichts Bestehendes.

---

## 10. Was es konkret bringt

- **Kaltstart bleibt schnell**, egal wie viele Sets: Daten laden lazy pro Set.
- **Neuer Set ohne UI-Umbau:** Datendatei + Registry-Eintrag; die generische
  Hierarchie-UI rendert ihn.
- **Keine `split(' ')`-Sonderfälle mehr** – Sets dürfen andere Tiefe oder
  Parametrisierung haben (Kommutatoren ≠ LTCT).
- **Saubere Trennung der Nutzerdaten** (Auswahl/Notes/Presets/SRS pro Set).
- **Typ- und testgestützt**, also sicher erweiterbar.

---

## 11. Offene Entscheidungen (für die Umsetzung)

- **Volle N-Ebenen-Rekursion** in der UI sofort, oder erst die heutigen drei
  Komponenten parametrisieren? (Empfehlung: parametrisieren in Phase 2,
  Rekursion erst wenn ein Set ≠ 3 Ebenen kommt.)
- **Ein aktiver Set zur Zeit** oder mehrere gleichzeitig mischbar?
  (Empfehlung: zunächst genau einer – einfachere Persistenz/Session.)
- **Letter-Scheme pro Set** (`usesLetterScheme`) – LTCT/Comms nutzen Speffz;
  3-Twists evtl. anders. Schema sieht es vor, Default = Speffz.
- **i18n der Set-/Ebenen-Namen** – Registry referenziert i18n-Keys.
