# Fallstudie 01 — Großartige Assets ≠ fertige Spiele

### Der Erwartungs-Gap, gemessen: 240 Tiles aus den meistgeladenen Gratis-Tilemap-Packs auf itch.io – wie groß ist das „Asset-Chaos“ in der Realität, und was kostet es auf dem Weg von der Grafik zum Gameplay? (Nein, die Packs sind nicht das Problem. Readiness ≠ Qualität – ein „Reject“-Tile kann wunderschöne Kunst sein, die einfach noch nicht enginefertig ist. Und diesmal steht das Instrument selbst vor Gericht: Die halbe Studie handelt davon, wo naive QC an *guter* Kunst scheitert.)

> **DATA STATUS: STRUCTURAL — v1.1. Erste öffentliche Version (2026-09-07).** 🇩🇪 Deutsche Übersetzung der [englischen Originalstudie](CASE_STUDY_01.md) (inhaltsgleich; Daten-, Quell- und Skriptdateien bleiben englisch).
> Wenig Zeit? Starte bei der [5-Minuten-Übersicht](../case-studies/01/README.md) (englisch) – die Studie darunter liest sich in 3 Sitzungen.
> Echte Packs, echtes Inventar, echter Audit, echte 240-Tile-Pilotscores – aber bewertet mit der **öffentlichen Pixel-Baseline** (`pixel-baseline@1`), einer transparenten Heuristik, *nicht* dem gepinnten TileFix-Core. Diese Version bezieht alle Befunde auf den Nordstern des Projekts – **Zeit von der Grafik zum Gameplay** – und misst die Hürde in zählbaren Arbeitseinheiten (zu schneidende Sheets, zu findende Raster, zu reimplementierende Blob-Regeln, zu schreibende Tags/Exporte). Ein zeitgesteuerter Manuell-vs.-Tool-Vergleich ist als Folgestudie vorgesehen (§4.6); ein Zeitersparnis-Faktor wird vorher nicht behauptet.
> `STRUCTURAL → VERIFIED` kippt erst nach einem `--scorer core --require-core`-Rerun plus einem Doctor-Fix-Durchgang (nachbarschafts-bewusst). Siehe [Datenherkunft](#9-grenzen--datenherkunft).
>
> **Lizenz:** CC BY 4.0 (Text und aggregierte Daten). Rohbilder werden in diesem Repository niemals gespiegelt; Abbildungen sind abstrakte SVGs.

---

## 1. Kurzfassung

- **Framing:** Wir beurteilen niemals Creator oder Packs. Expertengefertigte Assets kodieren Jahre an Handwerk – sie herunterzuladen lädt den Workflow nicht mit herunter. Diese Studie misst, was Assets von *Usern* (und von QC-Tooling) *verlangen*, nicht wie gut sie sind.
- **Vorab registriert** ([§3.1](#31-vorab-registrierte-hypothesen)): Sagt Popularität voraus, wie viel nutzerseitige Arbeit ein Pack verlangt? Hypothesen vor dem Batch-Run committet; getestet auf n = 8 nach zwei dokumentierten Substitutionen ([SUBSTITUTIONS.md](../case-studies/01/SUBSTITUTIONS.md)).
- Wir nahmen **10 top Gratis-Tilemap-Packs von itch.io** (**682 mitgelieferte Bilder**, 8 exakte Treffer des vorab registrierten Pools + 2 Gleich-Creator-Substitutionen) und bewerteten **240 gesampelte Tiles** (24/Pack, geseedet, aus einem handverifizierten Sheet-Katalog) durch das Sechs-Metriken-Gate-System des Benchmarks (Production ≥ 92, Review 78–<92, Reject < 78).
- **Gap 0 („Asset-Chaos“) ist real und riesig:** 45 tile-tragende Sheets halten **14.182 adressierbare Zellen**; exakt ein Pack liefert vorgeschnittene Tiles (101 lose isometrische Blöcke). **99,3 % des Tile-Contents kommen in Sheets eingeschlossen an** – Schneiden, Benennen und Autotile-Kombinatorik landen bei *dir*. Nur 1 Pack liefert maschinenlesbare Metadaten; nur 1 liefert das Raster ohne Reverse-Engineering. [§4.4](#44-audit-des-lieferformats--gap-0-atomisierung)
- **Die Hürde, gezählt in Arbeitseinheiten, nicht (noch) in Stunden:** Dieser Pilot quantifiziert alles, was eine „Übersetzungsmaschine“ pro Pack tun muss – das Raster finden (9 von 10 brauchen Reverse-Engineering), bis zu 4.096 Zellen pro Sheet schneiden, als *Bilder* gelieferte Blob-Logik reimplementieren (2 Packs) oder gar keine (7 Packs), Tags/Exporte aus null schreiben (9 Packs). Stunden kommen aus dem zeitgesteuerten Follow-up-Trial (§4.6) – der Multiplikator unten ist schon bei *jedem* Einheiten-Satz enorm.
- **Der Scorer maß größtenteils sich selbst:** Die Pixel-Baseline verwarf 85,4 % – aber Forensik zeigt: Die schlimmsten „Ausfälle“ sind *korrekte Kunst, falsch getestet* (eine nahtlose Backsteinwand mit Score 44; eine Plattformkante mit Score 49). Fragmente (Assemblierungs-Stücke) gingen 0-zu-119. Die ehrliche Headline ist stratifiziert, nicht gepoolt. [§4.1–4.2](#41-gate-verteilung--vor-vs-nach-dem-fix-pass)
- **Fixen ohne Kontext schlägt zurück:** Der offengelegte heuristische Fix-Pass (nur Border + Despeckle) gewann +3,8 im Schnitt, ließ aber **6 Tiles ein Gate fallen** und regredierte ein ganzes Pack – eine Live-Demo, warum Pipeline-Optimierung Degradations-Strafen braucht. [§4.1](#41-gate-verteilung--vor-vs-nach-dem-fix-pass)
- **Popularität vs. Ausfall: null.** ρ = −0,62, p = 0,12 (n = 8) – nicht signifikant, und range-restringiert obendrein (jedes Pack fällt 92–100 % durch). Ein Null-Ergebnis ist auch ein Befund. [§4.5](#45-sagt-popularität-den-readiness-bedarf-voraus-vorab-registriertes-h1)
- Auch wenn du TileSmith nie benutzt: Die [Defekt-Taxonomie mit Störgrößen-Analyse](#42-die-defekt-taxonomie--und-wo-das-instrument-danebenliegt), die [forensischen Vignetten](#5-drei-tiles-drei-geschichten) und die [7-Punkte-Checkliste](#6-die-7-punkte-checkliste-vor-dem-veröffentlichen-eines-gratis-packs) funktionieren mit beliebigem Tooling.

## 2. Warum diese Studie wichtig ist (auch ohne TileSmith)

Gratis-Asset-Packs sind das Rückgrat der Indie-Spieleentwicklung. Sie tragen massive Download-Zahlen, sie verschiffen tausende Spiele – und sie brechen leise Renders: 1-Pixel-Nähte, die flackern, wenn die Kamera scrollt, Halos um Bäume, die auf jedem Hintergrund außer dem Preview komposited sind, Wasserzeichen aus einem KI-Generierungsschritt, den niemand weggekehrt hat.

Download-Zahlen messen *Popularität auf der Store-Seite*. Engines messen *Pixel zur Laufzeit* – und Engines sehen überhaupt keine Bilder, nur Mathe und Raster. Dazwischen sitzt das **Asset-Chaos**: ein Riesenbild, wo der Einsteiger fertige Quadrate erwartete, pixelsauberes Schneiden im Bildeditor, Spacing-Arithmetik und handprogrammierte Kantenlogik (ein 47-Tile-Blob-Set, nur um zwei Bodentypen zu blenden [1][2]). Diese Hürde frustriert Hobby-Entwickler bis zum Aufgeben – während für Profis und GPUs das große Sheet das *richtige* Format ist (weniger Draw Calls, klarer zu zeichnen). Dazwischen misst nichts **technische Readiness fürs Tiling** – das ist die Lücke, die diese Studie (und der Benchmark dahinter) adressiert: eine reproduzierbare Definition von „produktionsfertig“, die du in deiner eigenen CI laufen lassen kannst, gratis, bei jedem Pull Request, plus eine Vermessung des Chaos selbst am Nordstern des Projekts: **Zeit von der Grafik zum Gameplay**.

Der Erwartungs-Gap ist die Geschichte: Leute greifen Assets von Creatorn, die jahrelang studiert haben, und erwarten, sich zum fertigen Spiel zu viben. Die Kunst herunterzuladen lädt den Workflow nicht mit herunter – Schneiden, Rastern, Blob-Mappen, Taggen – und weder die Store-Seite noch die Engine sagt das. Readiness ≠ Qualität: Ein Reject-Tile kann großartige Kunst sein, die nur noch nicht enginefertig ist. Wir messen, was Assets von *Usern verlangen*, niemals wie gut sie sind.

Dieser Pilot fügt eine unbequeme zweite Lücke hinzu: **Naive Automatisierung scheitert an guter Kunst.** Richte einen vernünftigen Satz Pixel-Heuristiken auf echte Autotile-Sheets, und sie verwerfen 85 % – inklusive Tiles, deren 3×3-Assembly pixelperfekt ist. Wenn deine Pipeline auf Einzelzell-Scores gatet, wirst du gegen deine eigenen Assets kämpfen. Die *Geschmacks*-Hälfte der Creator-Expertise muss verdient werden; die mechanische Hälfte (Schneiden, Benennen, Gaten, Formatieren) ist auf Tooling übertragbar – aber nur auf Tooling, das *Assemblierung* versteht, nicht nur Zellen. Diese Arbeitsteilung macht die Studie sichtbar, mit Zahlen und Forensik.

Diese Studie erweitert die synthetischen Fixtures des Benchmarks (die *bereits präparierte* Assets bewerten) um die Frage, vor der echte Projekte stehen: **In welchem Zustand (und welcher *Verpackung*) kommen populäre Roh-Packs wirklich an – und wie sieht die Reise von roh zu produktionsfertig aus, in Zahlen?**

## 3. Methode

| Schritt | Detail |
|---|---|
| **Auswahl** | Top-Pool: itch.io-Browser – gratis · 2D · Tilemap, nach Popularität sortiert. Pilot = Kandidaten, die das Lizenz-Gate bestehen (explizite Lizenzerklärung), max. 2 Packs pro Creator. *8 von 10 Downloads trafen den vorab registrierten Pool exakt; 2 substituiert (gleiche Creator), protokolliert in [`SUBSTITUTIONS.md`](../case-studies/01/SUBSTITUTIONS.md), niemals wegredigiert.* |
| **Inventar** | 682 mitgelieferte Bilder in 10 Packs (Zahlen pro Pack in `case-studies/01/SOURCES.md`). Extraktion in git-ignorierte `_extracted/`-Verzeichnisse; Archive gehasht (Duplikat- + Platzhalter-Forensik in `SUBSTITUTIONS.md`). |
| **Atomisierung** | Kurierter Sheet-Katalog (`scripts/atomize-cs01.mjs`, committed): 45 tile-tragende Sheets, Tile-Größen aus Tiled-`.tsx` / Dateinamen / Autoren-Konvention, **jede Größe per Hand auf Raster-Overlay-Renders verifiziert** (`scripts/contact-sheet.mjs`). Charaktere, UI, Props, Hintergründe, Docs und Mockups aus dem *Sampling* ausgeschlossen (es sind keine Tiles), aber im *Liefer-Audit* enthalten (sie sind mitgelieferte Realität). |
| **Stichprobe** | 240 Tiles: 24 pro Pack, geseedeter Shuffle (Seed 20260907) über nicht-leere Zellen (transparente Sheets: ≥ 2 % opak; opake Sheets: Luma-StdAbw ≥ 1,0). Pack J aus 101 losen Dateien gesampelt (kein Schneiden). Provenienz pro Tile (Sheet + Zellkoordinaten) in `case-studies/01/data/registry.json`. |
| **Bewertung** | Öffentliche Pixel-Baseline (`pixel-baseline@1`, transparente Heuristiken in `scripts/case-study-batch.ts`): sechs Metriken – Seam, Border, Artifact, Pattern, Fidelity, Textile – aggregiert 0–100, Gates **Production ≥ 92**, **Review 78–<92**, **Reject < 78** (Single Source of Truth: `runners/runner-a-scoring/loss-functions.ts`). ⚠️ Einzelzell-Heuristiken – der Kernbefund der Studie sind ihre Grenzen (§4.2). |
| **Fix-Pass** | Offengelegter heuristischer Pass (`scripts/fix-pass-baseline.mjs`): 1px-Border-Normalisierung + Impuls-Despeckle, angewendet **nur wo die zugehörige Metrik < 7 geflaggt hatte** (saubere Tiles unangetastet: 53/240). Seam-/Pattern-/Fidelity-Fixes bewusst nicht versucht (brauchen Nachbarschafts-Kontext = Doctor/Core). |
| **Format-Audit** | Vorab registrierte Heuristik (`scripts/audit-delivery-format.ts`, unverändert ausgeführt) **plus** kurierte Korrektur aus dem verifizierten Katalog – die Fehlermodi der Heuristik an echten Packs werden berichtet, nicht versteckt (§4.4). |
| **Arbeitseinheiten-Modell** | Die Hürde wird gezählt, nicht gestoppt (der Pilot hat keinen zeitgesteuerten Trial): pro Pack – zu erkennende Sheet-Raster, zu schneidende/benennende adressierbare Zellen, gelieferte Form der Blob-Regeln (maschinenlesbar / Bild / keine), gelieferte Metadaten-Dateien, doppelte Dateien. Datensatz: `case-studies/01/data/gap0-steps.json`. Stunden = Einheiten × Satz; die Studie publiziert Einheiten und überlässt Sätze dem zeitgesteuerten Follow-up (§4.6). |
| **Maßstab** | Jedes Gap-0-Ergebnis wird an den drei TileSmith-Schritten gelesen – (1) grafisches Reverse-Engineering (Raster → pixelsaubere Schnitte), (2) automatisierte Logik (Blob-/Autotile-Regeln für Einsteiger), (3) Massen-Tagging + Code-Export (Drudgery-Entfernung für Profis). Der Audit fragt pro Pack: Was müsste die Maschine tun? |
| **Korrelation** | Vorab registrierte H1–H3 (§3.1); `scripts/analyze-correlation.ts` – Spearman-ρ, geseedete Permutations-p, exploratives partielles ρ mit Atlas-Anteil als Kontrolle. Läuft auf **n = 8** (B, E haben nach Substitution keinen Rang – vom Skript erzwungen). |
| **Verifikation** | Jedes „Nachher“-Tile wird kalt von derselben Baseline neu bewertet. Gates werden zwischen den Phasen nie nachjustiert. Forensische Stichproben (3×3-Sheet-Assemblies) für die schlechtesten und besten Tiles. |
| **Aggregation** | Mittlerer Score pro Tile → Gate-Zählungen pro Pack → gepoolte Verteilung. Ein Tile kann mehrere Defektklassen tragen (Prozente summieren sich > 100 %). Stratifizierungsregel (vollflächig vs. Fragment) in `scripts/stratify-cs01.mjs`. |

Pack-Identitäten heißen durchgehend A–J; echte Namen, Creator, Lizenzen und URLs stehen in [`case-studies/01/SOURCES.md`](../case-studies/01/SOURCES.md) (alle 10 Packs tragen explizite Lizenzerklärungen, die Analyse erlauben; die Studie publiziert nur Aggregate).

### 3.1 Vorab registrierte Hypothesen

Registriert vor dem Batch-Run (siehe Git-Historie); Analyse-Skript: `scripts/analyze-correlation.ts` (`npm run case-correlate`).

- **H1** — Je populärer das Pack, desto höher sein *nutzerseitiger Readiness-Bedarf* (Anteil Tiles unterhalb des Production-Gates vor dem Fixen).
- **H2** — Ein H1-Zusammenhang ist **mediiert durchs Lieferformat** (Atlas-Orientierung), nicht durch Handwerkskunst.
- **H3** — Es gibt Ausnahmen: populäre Packs, die einsteigerfertig liefern – Beweis, dass die Atomisierungs-Barriere eine *Entscheidung* ist, kein Gesetz.

Berichtsregeln: ρ und p immer gemeinsam; n = 8 ist Pilot-Niveau (10 vorab registriert, 2 durch Substitution verloren); ein Null-Ergebnis wird als Null berichtet. Interpretationsrichtung: Readiness-Bedarf – niemals Creator-Schuld.

## 4. Ergebnisse

### 4.1 Gate-Verteilung – vor vs. nach dem Fix-Pass

| Gate | Schwelle | Vorher | | Nachher | |
|---|---|---:|---:|---:|---:|
| | | Tiles | % | Tiles | % |
| ✅ Production | ≥ 92 | 10 | 4,2 % | 13 | 5,4 % |
| ⚠️ Review | 78 – <92 | 25 | 10,4 % | 26 | 10,8 % |
| ❌ Reject | < 78 | 205 | 85,4 % | 201 | 83,8 % |
| **⌀ Score** | | **66,6** | | **70,4** | |

**Lies diese Tabelle nicht als „85 % der Tiles sind kaputt.“** Lies sie als Geständnis des Instruments: Eine Einzelzell-Heuristik, auf assemblierungs-designte Kunst gerichtet, verwirft fast alles. Die Tabelle, die du wirklich lesen solltest, ist die stratifizierte:

| Stratum | Regel | n | ⌀ vorher | P / R / X vorher |
|---|---|---:|---:|---|
| Vollflächige Zellen | jede Kante ≥ 90 % opak | 121 | 70,4 | 10 / 19 / 92 |
| Fragmente | Assemblierungs-Teil auf leerer Umgebung | 119 | 62,7 | **0** / 6 / 113 |

Fragmente – Ecken, Kanten, Übergänge, Objektteile auf Transparenz – **können Einzelzell-Kantentests konstruktionsbedingt nicht bestehen** (ihre Umgebung *ist* die Transparenz, die der Test als Halo/Naht liest). Sie gingen 0-zu-119, vorher wie nachher. Selbst vollflächige Zellen fallen zu oft durch: §4.2 + §5 zeigen forensisch *warum*.

![Stratifizierte Gate-Verteilung](../case-studies/01/data/figures/gates-stratified.svg)

**Der Fix-Pass: +3,8 im Schnitt, 12 Gates rauf, 6 Gates runter.** Der offengelegte heuristische Pass (`fixlog.json`: 135 border-normalisiert, 115 despeckled, 53 unangetastet) verbesserte exakt seine Zielmetriken (Border +1,59, Artifact +1,49) – und verschlechterte gekoppelte (Seam −0,88 bei 105 verschlechterten Tiles, Fidelity −0,31). Pack G regredierte als Ganzes (71,3 → 70,4, Review 3 → 0). Die Degradationsrate (2,5 % der Tiles fielen ein Gate) rutscht gerade noch unter die 5-%-Validitätslatte des Design-Docs – aber die Lektion *ist* der Befund: **Pixel-Touch-ups ohne Degradations-Strafen und Nachbarschafts-Kontext bewegen den Schnitt, während sie Individuen brechen.** Genau dafür existiert Runner Bs Loss-Funktion (`calculatePipelineLoss`: Degradation ×10, Artefakt ×5, Constraints ×100) – und dafür ist nachbarschafts-bewusstes Fixen (die Set-/Map-Schritte des Doctors) da.

![Metrik-Mittelwerte vorher → nachher](../case-studies/01/data/figures/metrics-delta.svg)

### 4.2 Die Defekt-Taxonomie – und wo das Instrument danebenliegt

Prävalenz unter den 230 Tiles, die initial **nicht** bestanden (ein Tile kann mehrere Defekte tragen). Die rechte Spalte ist der Punkt dieser Studie: jeder „Defekt“ mit seiner **Störgrößen-Analyse**.

| # | Defektklasse | Metrik | Prävalenz | So sieht es im Spiel aus – und wann das Flag lügt |
|---|---|---|---:|---|
| 1 | **Naht-Diskontinuität** – Kantenpixel setzen sich nicht ins Nachbar-Tile fort | Seam | 74,3 % | flackernde Linien beim Kamera-Scroll – **ABER der Einzelzell-Test nimmt an, das Tile grenze an *sich selbst*.** Übergangs-Tiles (Gras→Erde *innerhalb* einer Zelle) und versetzte Muster (Läuferverband) fallen durch, obwohl sie sich perfekt assemblieren (§5.1: eine nahtlose Backsteinwand mit Score 44). Echtes Naht-Signal braucht den Kontext der *beabsichtigten* Nachbarn. |
| 2 | **Border-Verdunklung / Halo** – 1px dunklerer oder farbiger Saum an Tile-Kanten | Border | 58,7 % | sichtbares Raster über deiner Map – **ABER Outline-Stile setzen dunkle Outlines konstruktionsbedingt an Zellkanten** (§5.1: Mörtellinien werden als „Verdunklung“ gelesen), und die transparente Umgebung jedes Fragments liest sich als Halo (Fragmente: 75 % geflaggt). |
| 3 | **Artefakt** – Wasserzeichen, Kompressionsblöcke, Streupixel | Artifact | 50,0 % | offensichtliche Flecken, besonders auf flachem Schnee/Sand – **ABER die Heuristik (‖Pixel − 3×3-Median‖) schlägt bei knackigem Pixel-Art-Dithering und 1px-Highlights an**, die konstruktionsbedingt lokale Ausreißer *sind*. Echte Wasserzeichen wurden in keinem Pack gefunden; behandle diese Zeile als „Textur-Betriebsamkeit“, nicht als Schaden. |
| 4 | **Textil-Unregelmäßigkeit** – inkonsistente interne Texturfrequenz | Textile | 34,8 % | Tiles, die sich neben Geschwistern „falsch anfühlen“ – die am wenigsten konfundierte der sechs auf diesem Datensatz; trotzdem assemblierungs-blind (ein Eckstück *soll* über seine Fläche variieren). |
| 5 | **Muster-Wiederholung** – identische Merkmals-Wiederholung in der Kachelperiode | Pattern | 18,7 % | Spieler sehen nach Sekunden „das Raster“ – die übertragbarste Metrik hier; 43 Flags verdienen echtes Follow-up im VERIFIED-Durchgang. |
| 6 | **Fidelity-Verlust** – überglättete oder detail-zerstörte Pixel | Fidelity | 10,9 % | matschiges Terrain neben knackigen Sprites – konfundiert durch **absichtliche Flachfüllungen** (eine saubere Grasfüllung hat ~null Laplace-Energie, genau wie Blur-Schaden). 25 Flags, meist Füllungen. |

**Drei Überraschungen, die sich zu wissen lohnen:**

1. **Der schlimmste „Ausfall“ ist eine perfekt gute Backsteinwand.** Pack Hs `h-24` scort 44 (Reject) als Einzelzelle – Seam 1,5, der Metrik-Boden – während seine 3×3-Assembly nahtlos ist. Der Läuferverbands-Versatz legt verschiedene Backsteinphasen auf gegenüberliegende Kanten; der Test vergleicht ein Tile mit *sich selbst* statt mit seinen *Nachbarn*. Assemblierungs-Tiles brauchen Assemblierungs-Tests. Dieses eine Tile rechtfertigt die gesamte Stratifizierung.
2. **Fixen machte 6 Tiles schlechter.** Der heuristische Fix-Pass verbesserte seine Ziele und verschlechterte gekoppelte Metriken (Seam −0,88, 105 verschlechtert), ließ 6 Tiles ein Gate fallen und regredierte Pack G pauschal. „Einfach die Borders normalisieren“ ist keine Fix-Strategie – es ist eine Degradations-Strafen-Demo. (Runner Bs ×10-Degradations-Gewicht existiert genau aus diesem Grund.)
3. **Das einzige einsteigerfertige Pack fällt bei jedem Test durch.** Pack J liefert 101 vorgeschnittene, benannte, engine-lesbare Tiles – Gap 0 gelöst, H3 bestätigt, die Barriere *ist* eine Entscheidung. Es scort 0/24: Orthogonale Seam-/Border-Metriken sprechen keine isometrische Projektion (Diamant-Nachbarn, transparente Ecken). Richtiges Lieferformat, falsches Lineal – projektions-bewusste Metriken sind VERIFIED-Arbeit.

### 4.3 Pack-Übersicht

Schnitte sind Einzelzell-Scores der Pixel-Baseline – vergleiche *Zeilen* (welche Packs zu Fill vs. Fragment vs. Outline-Stil neigen), verwechsle niemals eine Spalte mit einem Qualitäts-Ranking.

| Pack | Pop.-Rang | Tiles | ⌀ vorher | Schlimmste Defektklasse | ⌀ nachher |
|---|---:|---:|---:|---|---:|
| A (16px Top-down-Farm) | #1 | 24 | 69,5 | Seam | 72,8 |
| B (16px Top-down saisonal/Dungeon) | — | 24 | 74,4 | Seam | 77,8 |
| C (16px Dungeon + Anim-Frames) | #3 | 24 | 67,4 | Seam | 72,3 |
| D (32px Top-down) | #4 | 24 | 64,3 | Seam | 69,8 |
| E (16px Sidescroller-Wald) | — | 24 | 65,6 | Seam | 70,9 |
| F (16px Plattformer-Höhlen) | #7 | 24 | 68,0 | Seam | 73,9 |
| G (16px RPG-Wald, .tsx-verifiziert) | #10 | 24 | 71,3 | Artifact | 70,4 ⚠️ regrediert |
| H (32px Plattformer, Outlines) | #14 | 24 | 60,4 | Border | 66,0 |
| I (16px Industrial, spärlich) | #23 | 24 | 67,4 | Border | 70,7 |
| J (64px isometrisch, lose) | #35 | 24 | 57,5 | Border | 59,6 |
| **Σ / ⌀** | | **240** | **66,6** | | **70,4** |

Production-Tiles vorher: 10 (B 5, A 2, D 1, F 2 – alle vollflächige Fills). Packs C, E, G, H, I, J: null. Die Streuung zwischen Packs (≈57–74) wird von der Streuung innerhalb der Packs gezwergt (44–96): **Die Zellrolle (Fill vs. Übergang vs. Fragment) sagt den Score weit besser voraus als die Pack-Identität.** Das ist selbst ein Befund: Readiness-Varianz lebt *in* Sheets, nicht zwischen Store-Seiten.

### 4.4 Audit des Lieferformats – Gap 0: Atomisierung

Bevor Qualität überhaupt messbar ist, müssen die meisten Packs *grafisch reverse-engineered* werden: Tiles kommen in Atlas-Sheets verschmolzen an, und jemand muss das Raster finden, die Teile schneiden, zuschneiden und benennen, bevor eine Engine – eine mathematische Maschine, die keine Ahnung hat, was das Bild darstellt – sie konsumieren kann. Kein Vorwurf an die Creator-Seite: Sheets sind rationaler Profi-Workflow. Das interessante Objekt ist die *Erwartung* – expertengefertigte Assets zu greifen fühlt sich an, als müsste es expertenwürdige Spiele produzieren; mechanisch kann es das nicht, bis die Experten-Arbeit irgendwo passiert.

**Zwei Durchläufe, ehrlich berichtet.** Die vorab registrierte Heuristik (`scripts/audit-delivery-format.ts`, Gradientenenergie-Rastererkennung) wurde unverändert ausgeführt – und sie versagt an echten Packs in beide Richtungen:

| Fehlermodus | Beispiel |
|---|---|
| Falsche Mikro-Perioden auf verrauschter/skalierter Kunst | E-Cover-Art → „4×4-Raster“ (130.560 Phantom-Zellen); G 3×-skalierte Sheets → „6×6“; C-Autotile-Sheet → „4×8“ |
| 3×-Vielfach-Perioden auf Autotile-Sheets | H-Terrain (echt 32) → „96×96“; F-Haupt-Tileset (echt 16) → „80×48“ |
| Verpasste spärliche-aber-ausgerichtete Raster | I-Industrial-Sheets (verifiziert 16-Raster) → „gepackt, 0 Zellen“ |
| Doc-/Mockup-Fehlalarme | Usage-Guides, Mockup-Cover, Baum-Art als „Raster-Atlasse“ klassifiziert |

Roher gepoolter Heuristik-Output: 30 % nur-Atlas · 556 lose Bilder · **242.126 „Tiles in Sheets“** – eine Phantomzahl, die wir uns weigern zu headlinen (reproduzierbar aufbewahrt in `case-studies/01/data/format-audit.json`). Die korrigierten Zählungen unten stammen aus dem handverifizierten Katalog (`scripts/atomize-cs01.mjs` + `data/registry.json`):

| Pack | Format (Tiles) | Tile-Sheets | Adressierbare Zellen | Nicht-leerer Pool | Lose vorgeschnittene Tiles |
|---|---|---:|---:|---:|---:|
| A | nur Atlas | 14 (16px) | 673 | 587 | 0 |
| B | nur Atlas | 16 (16px) | 3.304 | 2.839 | 0 |
| C | nur Atlas | 2 (16px) | 1.124 | 562 | 0 * |
| D | nur Atlas | 3 (32px) | 384 | 173 | 0 |
| E | nur Atlas | 3 (16px) | 2.004 | 1.069 | 0 |
| F | nur Atlas | 1 (16px) | 4.096 | 828 | 0 |
| G | nur Atlas | 2 (16/32px) | 260 | 227 | 0 |
| H | nur Atlas | 2 (32px) | 289 | 113 | 0 * |
| I | nur Atlas | 2 (16px) | 2.048 | 740 | 0 |
| J | **nur lose** | 0 | — | — | **101** |
| **Σ** | | **45** | **14.182** | **7.138** | **101** |

\* Packs C und H liefern hunderte lose *Bilder* – Animations-Frames, Sprite-Strips, UI – aber null lose *Tiles*. (Die „556 losen“ der Heuristik zählen Bilder; nur Js 101 sind Tiles. Die Unterscheidung zählt: Einen Charakter-Strip zu zerschneiden ist ein anderer Job als ein Tileset zu schneiden.)

**Gepoolt (kuriert): 9 von 10 Packs liefern Tiles nur im Atlas · 99,3 % des Tile-Contents (14.182 von 14.283 adressierbaren Einheiten) kommen *in* Sheets an.** Jedes Katalog-Sheet ist rasterausgerichtet und maschinell schneidbar, *sobald das Raster bekannt ist* – aber das Raster zu kennen kostete `.tsx`-Metadaten (nur G), Dateinamen-Hinweise (nur H) oder menschliche Overlay-Verifikation (alles andere), weil naive Erkennung versagt (Tabelle oben in §4.4). Diese Erkennungs-Lücke ist Gap 0s zweite Hälfte: nicht nur *Schneiden*, sondern *das Raster finden*.

**Die Hürde pro Pack, an den drei TileSmith-Schritten** (Quelle: `case-studies/01/data/gap0-steps.json` – alle Felder handverifiziert):

| Pack | (1) Reverse-Engineering: Raster bekannt? | Zu schneidende/benennende Zellen | (2) Logik: Blob-Regeln geliefert? | (3) Tagging/Export: Metadaten geliefert? |
|---|---|---:|---|---|
| A | ✖ Hand-Overlay (16px) | 673 | 🖼️ nur Bild (Bitmasken-Referenzdiagramme + Gif – User implementiert von Hand) | ✖ 0 Dateien |
| B | ✖ Hand-Overlay (16px) | 3.304 | ✖ keine (Blob-Layouts nur als Pixel) | ✖ 0 Dateien |
| C | ✖ Hand-Overlay (16px) | 1.124 | ✖ keine | ✖ 0 Dateien |
| D | ✖ Hand-Overlay (32px) | 384 | ✖ keine | ✖ 0 Dateien |
| E | ✖ Hand-Overlay (16px) | 2.004 | ✖ keine | ✖ 0 Dateien |
| F | ✖ Hand-Overlay (16px) | 4.096 | ✖ keine | ✖ 0 Dateien |
| G | ✅ `.tsx`-Tilewidth + Wangsets | 260 | ✅ Bild-Guides **+ maschinenlesbare Wangsets** (v01–v10 `.tsx`, Beispiel-`.tmx`) | ✅ 51 Dateien |
| H | ⚠️ Dateinamen-Hinweis (32×32) + Overlay | 289 | ✖ keine | ✖ 0 Dateien |
| I | ✖ Hand-Overlay (16px; Detektor versagte) | 2.048 | ✖ keine | ✖ 0 Dateien |
| J | ✅ n/a – vorgeschnitten, nichts zu schneiden | 0 (101 lose) | ✅ n/a – isometrisch, kein Blob-System | ✖ 0 Dateien (nur Namen) |

Drei Lesarten, eine pro Schritt:

1. **Reverse-Engineering ist 9 von 10 Mal nötig.** Nur G liefert das Raster in Maschinenform, und nur J überspringt das Schneiden ganz. Das größte einzelne Sheet (F: 4.096 Zellen, 828 nicht-leer) ist ein voller Arbeitstag Schneiden und Benennen *vor dem ersten Gameplay-Test* – bei jedem plausiblen Zellen-Satz.
2. **Die Logik existiert – als Bilder.** Pack As Bitmasken-Referenzdiagramme und Pack Gs Autotile-Guides sind exakt die „mathematischen Übergänge“, die Einsteiger programmieren müssen (die 47-Tile-Blob-Familie) – als Dokumentation gezeichnet, nicht als Regeln geliefert. Nur G liefert die Regeln zusätzlich in Maschinenform (Tiled-Wangsets). Für 8 von 10 Packs startet Schritt 2 bei null: User starrt auf Pixel, rederiviert die Kombinatorik, implementiert von Hand. Das ist der Aufgeben-aus-Frust-Schritt, gemessen: 7 Packs liefern *nichts*, 1 liefert Bilder, 1 (+J n/a) liefert Regeln. Ein unabhängiger Praktiker-Bericht über die Implementierung eines 47-Tile-Bitmasken-Sets meldet dieselbe Wand von der anderen Seite: Das Mappen von Bitmasken auf Tiles „took a lot of manual effort“ [2].
3. **Tagging/Export startet fast überall bei null.** 9 Packs liefern überhaupt keine maschinenlesbaren Metadaten – keine Tags (`"solid"`, `"water"`, `"ramp"`), kein JSON, kein enginefertiges Sidecar. Selbst Experten, die perfekt zeichnen (und diese Packs *sind* wunderschön gezeichnet), überlassen das Massen-Tagging und Formatieren dem User – die Profi-Drudgery, die das Projekt automatisieren will. Gs 51 `.tsx`/`.tmx`-Dateien sind die einsame Ausnahme, und sie dienen Tiled, nicht direkt Engines.

**Die Dedup-Bürde (neu):** Pack A liefert 7 byte-identische Dateipaare (`Basic Furniture.png` = `Basic_Furniture.png`, …) und B eines – User müssen Duplikate vor dem Import entdecken und auflösen. Einzeln kleinlich; exakt die automatisierbare Drudgery, die Profis outsourcen.

**Warum liefern Creator Atlasse statt gebrauchsfertiger Tiles?** *(Interpretation – siehe Grenzen)*

- **Es ist rationaler Profi-Workflow.** Künstler zeichnen in Sheets, exportieren einmal im Batch, halten File-Zahlen niedrig – und Engines wollen zur Laufzeit ohnehin Textur-Atlasse (Sprites, die sich einen Atlas teilen, können in einem einzigen Draw Call rendern [3]). Das Format stimmt; das *fehlende Stück* ist Atomisierungs-Tooling auf der Konsumentenseite.
- **Aber es externalisiert den harten Teil auf User.** Schneiden und Benennen ist Schritt eins; die Wand ist Autotiling-Kombinatorik: Zwei Bodentile-Typen brauchen ein 47-Tile-Blob-Set, um in jeder Konfiguration zu blenden (8-Nachbar-Bitmaske mit Reduktion [1][2]); vier Terrain-Typen mit Übergängen multiplizieren das weiter [2]. Einsteiger sehen „500 Tiles!“ und können trotzdem keinen begehbaren Boden bauen. Pack J beweist, dass die Alternative möglich ist (101 benannte lose Dateien) – die Barriere ist eine Entscheidung (H3 ✓), auch wenn Js Projektion eigene Metriken braucht.
- **Der Einwand des Experten.** Handgezeichnet und hand-assembliert bleibt an der Spitze besser – aber Massen-Tagging und Formatieren hunderter handgezeichneter Tiles in enginefertige Daten ist exakt die Arbeit, die professionelle Studios outsourcen. Automatisierbare Drudgery an beiden Enden.

Das ist Gap 0 für Tooling: Der Upload-Schritt der Pipeline (Raster/Grid-Erkennung → Atomisieren) existiert, damit Scoring, Fixen und Mappen bei *Tiles* starten, nicht bei einer Wand verschmolzener Pixel. Der Beitrag dieser Studie zu diesem Schritt ist eine Warnung: **Rastererkennung, die auf synthetischen Sheets funktioniert, versagt an echten – spärlicher Content, skalierte Exporte, Autotile-Vielfache und Doc-Art brechen sie alle.** Produktions-Atomisierung braucht die Verifiziert-Katalog-Behandlung (oder die Studio-Upload-Rastererkennung), nicht rohe Gradienten-Autokorrelation.

### 4.5 Sagt Popularität den Readiness-Bedarf voraus? *(vorab registriertes H1)*

**n = 8 Packs · Spearman-ρ = −0,62 · Permutations-p = 0,12 · partielles ρ (Atlas-Anteil kontrolliert, explorativ) = −0,42**

Urteil: **Nicht vereinbar mit H1 bei α = 0,05 – Popularität sagt Ausfälle hier nicht voraus; ehrlich berichten (ein Null-Ergebnis ist auch ein Befund).** Fail-Anteile: A 91,7 % · C 100 % · D 95,8 % · F 91,7 % · G 100 % · H 100 % · I 100 % · J 100 %.

![Popularität vs. Fail-Anteil](../case-studies/01/data/correlation-scatter.svg)

*(Streuungs-x-Achse: Popularitätsrang – weiter rechts = unbeliebter. Packs B und E ausgeschlossen: kein Rang nach Substitution.)*

Zwei Caveats machen dieses Null-Ergebnis *uninformativ* statt entscheidend, und beide werden offengelegt, nicht vergraben: **(1) Range-Restriktion** – da jedes Pack bei Einzelzell-Baseline-Scores 92–100 % durchfällt, bleibt fast keine Varianz, die Popularität erklären könnte; H1 wird erst mit einem assemblierungs-bewussten Scorer testbar, der Packs auffächert. **(2) Die Atlas-Anteil-Kontrolle ist schwach** – sie erbt die Phantom-Zählungen des heuristischen Audits, die die meisten Anteile nahe 1,0 sättigen. Ausreißer-Kandidaten via Residuum (H3): C, G, H – alle bei 100 % Fail-Anteil, d.h. die „Ausnahmen“ sind ein Artefakt gebundener Ränge, keine echten Abweichungen. H3s eigentliche Evidenz ist qualitativ und stärker: **Pack J liefert einsteigerfertig (101 lose Tiles)** – die Barriere ist eine Entscheidung, durch Existenz bewiesen.

### 4.6 Von der Hürde zu Stunden: die Zeitfrage, ehrlich eingegrenzt

Der Nordstern des Projekts ist **Zeit von der Grafik zum Gameplay** – und das Studienziel verlangt Beweis, dass das Tool sie drastisch verkürzt. Stand nach diesem Piloten: **Die Hürde ist in Arbeitseinheiten quantifiziert, nicht in Stunden.** Absichtlich: Zeit zu stoppen braucht einen kontrollierten Trial, und erfundene Einheiten-Sätze („eine Zelle dauert N Minuten“) würden die Headline fabrizieren, die die Studie erst verdienen soll.

Was die Einheiten bereits sagen: 14.182 adressierbare Zellen zum Schneiden/Benennen/Prüfen in 45 Sheets, 9 rückzuentwickelnde Raster, für 8 Packs aus Bildern-oder-nichts zu rederivierende Blob-Logik, für 9 Packs aus null zu schreibende Tags/Exporte – plus Dedup-Detektivarbeit (A: 7 Paare) und Qualitätsprüfung, die selbst Assemblierungs-Kontext braucht (§4.2). Bei *jedem* Einheitensatz oberhalb von Sekunden sind das Stunden bis Tage pro Pack vor dem Gameplay – passend zur qualitativen Klage (Einsteiger, die in Photoshop aufgeben), ohne sie zu messen vorzugeben.

**Vorab registriertes Follow-up: der zeitgesteuerte Trial (CS-02-Kandidat).** Protokoll-Skizze, hier vorab committet: Nimm 3 Sheets über den Schwierigkeitsbereich (dichten J-artigen Losesatz als Kontrolle; mittelgroßes F-Mainlev; spärlichen I-Industrial), definiere „gameplay-fertig“ als *geschnitten + benannt + rasterverifiziert + blob-gemappt + getaggt + engine-importierbar + QC-gegatet*, und miss zwei Pfade – (a) manuell (Bildeditor + handgeschriebene Regeln, N≥3 Praktiker, Screen-Recording) vs. (b) TileSmith Studio (Upload → Doctor → Set → Map → Export). Berichte mediane Stunden pro Pfad mit Ranges, niemals ein einzelnes „×N schneller“ ohne die Verteilung. *Dieser* Trial verdient den Zeitersparnis-Faktor; dieser Pilot verdient den Arbeitseinheiten-Nenner, durch den er teilen wird.

## 5. Drei Tiles, drei Geschichten

Konkrete Vignetten – der Kern der Studie. Alle Scores echt (Pixel-Baseline); Provenienz (Sheet + Zelle) in `data/registry.json`; forensische Renders wurden lokal erzeugt und per Auge verifiziert (nicht committed – nur Aggregate). Lies sie an den drei Schritten: 5.1 zeigt den *Prüfer*, der aus Mangel an Assemblierungs-Logik versagt (Schritt 2s Input); 5.2 zeigt ein Übergangs-Tile, das kein Zell-Grader beurteilen kann (Schritt 2s Daseinszweck); 5.3 zeigt, was heute besteht – und wie „saubere Tiles in Ruhe lassen“ aussieht.

### 5.1 `h-24` – die nahtlose Wand mit Score 44 (Pack H, 32×32)

- **Vorher: 44 (Reject)** – Seam 1,5/10 (der Metrik-Boden), Border 2,4, Artifact 5,9. Eine rosa Läuferverbands-Backsteinfüllung aus `Terrain (32x32).png`, Zelle (10; 8).
- **Forensik:** Die 3×3-Sheet-Assembly um die Zelle ist *nahtlos* – Backsteinreihen laufen über jede Grenze weiter. Das Flag ist reines Kontext-Artefakt: Läuferverband legt verschiedene Backsteinphasen an die linke vs. rechte Tile-Kante, und der Einzelzell-Test vergleicht das Tile mit *sich selbst*. Die dunklen Mörtellinien, die Zellkanten berühren, addieren einen Border-Störfaktor (Outline-Stil, kein Schaden).
- **Fix:** Border-Normalisierung + Despeckle angewendet (beide Metriken hatten geflaggt). Score bewegte sich von 44 in die ~50er: Pixel-Politur an einem Tile, dessen „Defekt“ der fehlende Nachbarschafts-Kontext des Tests ist. Der ehrliche Fix ist ein nachbarschafts-bewusster Naht-Test, keine Pixel-Chirurgie.
- **Lektion:** Dieses Tile allein invalidiert gepoolte Reject-Prozente als Readiness-Behauptungen – und validiert die Stratifizierung. In deiner eigenen QC: **Gates für Assemblierungs-Tiles niemals auf Einzelzell-Naht-Scores.**

### 5.2 `d-10` – die Plattformkante mit Score 49 (Pack D, 32×32)

- **Vorher: 49 (Reject)** – Seam 1,5, Border 2,1, Artifact 10,0. Eine Stein-Plattformkante aus `TX Tileset Stone Ground.png`, Zelle (6; 2): flache Steinfüllung mit schattierter Kante entlang zweier Seiten.
- **Forensik:** Ein *Übergangs*-Tile – seine linken/oberen Kanten (flache Füllung) *sollen* sich von seinen unteren/rechten Kanten (Plattform-Lippe) unterscheiden. Der Einzelzell-Naht-Test liest absichtliche Asymmetrie als Diskontinuität. Beachte auch die Sheet-Nachbarschafts-Falle: Nachbarzellen *im Sheet* sind andere Stücktypen, keine Map-Nachbarn – selbst ein 3×3-Sheet-Fenster kann dieses Tile nicht beurteilen. Nur der Kontext der beabsichtigten Nachbarn (Autotile-Regeln/Map) kann es.
- **Fix:** Border-Normalisierung feuerte; die Schattenlippe ist absichtliches Shading, also bedeutet „die Border fixen“ *die Art Direction beschädigen*. Der Pass verbesserte die Zahl und verschlechterte arguendo das Tile – die Degradations-Lektion en miniature.
- **Lektion:** Übergangsstücke sind die Mehrheit echter Tileset-Zellen (siehe die Pools in §4.4: Die meisten Sheets sind Kanten-/Ecken-/Übergangs-Sets). Jede QC, die „Übergang“ nicht von „kaputt“ unterscheiden kann, wird den Großteil eines guten Packs rot flaggen.

### 5.3 `b-11` – der Schnee-Fill, der bestand (Pack B, 16×16)

- **Vorher: 96 (Production)** – Seam/Border/Artifact alle 10,0. Eine blasse Schneefüllung mit sanften Wehen aus `snow tiles 2.png`, Zelle (5; 22).
- **Warum er besteht:** vollflächig, selbstähnlich, keine Outlines an Kanten, keine Dither-Spikes – exakt die Texturfamilie, auf die die Heuristiken kalibriert wurden. Seine 3×3-Assembly ist sauber, und der Einzelzell-Score auch. Übereinstimmung von Test und Realität, ausnahmsweise.
- **Fix:** keiner – keine Metrik flaggte, also rührte der Pass nichts an (53/240 Tiles übersprungen). Degradations-Disziplin wie designed: Das eine, was der heuristische Durchgang richtig kann, ist *saubere Tiles in Ruhe lassen*.
- **Lektion:** Die Baseline ist ein ordentlicher **Fill-Tile**-Grader und ein schlechter **Assemblierungs-Tile**-Grader. Alle 10 Pre-Fix-Production-Tiles sind Fills. Wenn dein Pack mostly Fills ist (offene Felder, Schnee, Sand), funktioniert Einzelzell-Gating heute; wenn es Übergänge und Outlines sind (Dungeons, Plattformer, Outline-Stile), brauchst du assemblierungs-bewusste QC – den VERIFIED-Durchgang.

## 6. Die 7-Punkte-Checkliste vor dem Veröffentlichen eines Gratis-Packs

Mit beliebigem Tooling nutzbar – dieser Abschnitt funktioniert ohne TileSmith. Aktualisiert mit der Evidenz dieser Studie (Assemblierungs-Kontext ist jetzt Punkte 0–1, kein Nachgedanke):

0. **Atomisieren vor allem:** Wenn das Pack als Atlas-Sheets liefert, etabliere das Raster (liefere eine `.tsx`/Raster-Notiz wie Pack G – es war das einzige Pack, bei dem das Raster null Reverse-Engineering brauchte) und schneide, bevor du irgendwas beurteilst. Bonus, wenn du die *Regeln* mitlieferst: Pack Gs Wangsets und Pack As Bitmasken-Diagramme sind die wertvollsten Dateien ihrer Packs für Einsteiger – maschinenlesbar schlägt Bild, Bild schlägt nichts. Die Qualität eines ungeschnittenen Sheets ist unmessbar, und dein Gameplay auch.
1. **Kanten-Kontinuitätstest mit ECHTEN Nachbarn:** Platziere das Tile mit seinen *beabsichtigten* Nachbarn (Autotile-Regeln, nicht Sheet-Nachbarschaft, nicht Self-Tiling). Nähte zeigen sich nur *in Gesellschaft* – und Self-Tiling-Tests flaggen Übergänge und versetzte Muster fälschlich (§5.1).
2. **1-Pixel-Border-Audit, stilbewusst:** Auf 800 % zoomen, alle vier Kanten ablaufen – aber erst entscheiden, ob Kantenverdunklung Schaden oder Outline-Stil ist. Outline-Packs werden jedes naive Border-Gate auslösen (§5.1).
3. **Komposit-Hintergrund-Test:** Transparente Tiles über je einem hellen, einem dunklen, einem gesättigten Hintergrund previewen – nicht über dem Blau des Stores. (Fragmente leben oder sterben mit ihrer Umgebung.)
4. **2×2-Wiederholungstest:** Das Tile 2×2 kacheln (und 4×4). Wenn du die Periode in 3 Sekunden spottest, tun Spieler es in 3 Sekunden. (Pattern war die am wenigsten konfundierte Metrik dieser Studie – vertrau ihr am meisten.)
5. **Dedupliziere deine Dateiliste:** 7 von Pack As Dateien sind byte-identische Paare unter verschiedenen Namen. Ein Hash-Pass vor dem Export erspart jedem Downloader dieselbe Detektivarbeit.
6. **Geschwister-Konsistenz:** Animations-Frames und Terrain-Varianten nebeneinander, gleicher Zoom – Texturfrequenz sollte matchen. (Pack Cs 190 Frame-Dateien vs. 2 Tileset-Sheets zeigen, wie frame-lastig „Tilemap“-Packs werden – auditiere Frames als *Sets*, denn ein gefixter Frame neben kaputten Geschwistern verschiebt nur das Flackern.)
7. **Gate es in CI:** Scores altern wie Milch; ein PR-Check hält Packs nach jedem Edit ehrlich – aber gate *Fills* auf Einzelzell-Scores und *Assemblierungs-Stücke* auf Assemblierungs-Tests, oder du flaggst deine eigene korrekte Kunst rot. (Das 6-Zeilen-YAML unten erledigt den Scoring-Teil.)

## 7. Studie reproduzieren & eigene Assets bewerten

**Voller Benchmark, lokal** (120 CC0-Fixtures, sechs Metriken, reproduzierbare Gates):

```bash
git clone --recurse-submodules https://github.com/KleeBlattSpace/gc-pipeline-benchmark.git
cd gc-pipeline-benchmark
npm install
npm run generate        # synthetische Fixtures aus CC0-Basis-Assets
npm run ground-truth    # erwartete Scores + Gates
npm run benchmark       # Runner-A-Scoring + Runner-B-Optimierung
npm run validate        # gegen Ground Truth verifizieren
```

**Diese Fallstudie, Ende zu Ende** (braucht die 10 Pack-Archive in `case-studies/01/raw/`, per `SUBSTITUTIONS.md` – Archive sind git-ignoriertes Arbeitsmaterial, niemals committed):

```bash
npm install
# 1. Extrahieren + Inventarisieren (Pfade in case-studies/01/SUBSTITUTIONS.md)
node scripts/inventory-pack-images.mjs            # 682 mitgelieferte Bilder, Maße
# 2. Gap-0-Audit, vorab registrierte Heuristik, unverändert ausgeführt
npx tsx scripts/audit-delivery-format.ts          # → data/format-audit.{json,md}
# 3. kurierte Atomisierung + geseedetes Sampling (Registry + Regeln in-file)
node scripts/atomize-cs01.mjs                     # → raw/<ID>/_tiles/ + data/registry.json
# 4. Bewerten vorher/nachher (öffentliche Baseline; --scorer core --require-core für VERIFIED)
node scripts/fix-pass-baseline.mjs                # → raw/<ID>/_fixed/ + data/fixlog.json
npx tsx scripts/case-study-batch.ts --manifest case-studies/01/data/manifest-scoring.json --out case-studies/01/data --scorer pixel
# 5. Stratifizieren + Korrelieren + Abbildungen
node scripts/stratify-cs01.mjs                    # → data/stratification.json
npx tsx scripts/analyze-correlation.ts --manifest case-studies/01/manifest-correlation.json --format-audit case-studies/01/data/format-audit.json
node scripts/make-cs01-figures.mjs                # → data/figures/*.svg
```

**Bewerte dein Pack kontinuierlich, gratis, in CI** – [TileSmith QC](https://github.com/KleeBlattSpace/tilesmith-actions) bei jedem Pull Request:

```yaml
- uses: KleeBlattSpace/tilesmith-actions@v1
  with:
    api-key: ${{ secrets.TILESMITH_API_KEY }}
    paths: 'assets/**'
```

Du bekommst eine PR-Tabelle pro Tile, ein Overlay-PNG pro Tile (Rahmenfarbe = Urteil), `report.json` und Workflow-Outputs. Gratis unter Fair Use; Bilder werden niemals gespeichert. (Nach dieser Studie: Interpretiere Einzelzell-Flags an Assemblierungs-Stücken mit der Störgrößen-Tabelle aus §4.2 in der Hand.)

## 8. Vom Messen zum Beheben – die ehrliche Brücke

Alles oben funktioniert, **ohne TileSmith irgendwas zu geben** – der Benchmark ist öffentlich, die QC-Action ist gratis, die Checkliste ist tool-agnostisch, und die härtesten Befunde dieser Studie betreffen *unsere eigene* öffentliche Baseline.

Aber beachte die Form des Problems, das dieser Pilot kartiert hat – es zerfällt in exakt drei Schritte, und jeder ist derzeit manuell: **(1) Reverse-Engineering** – das Raster zu finden besiegt naive Erkennung auf den meisten echten Sheets, und bis zu 4.096 Zellen pro Sheet zu schneiden/benennen ist pure Drudgery; **(2) Logik** – Blob-/Autotile-Regeln kommen als Bilder oder gar nicht, also rederivieren Einsteiger Kombinatorik von Hand (der Aufgeben-aus-Frust-Schritt), während sogar unser eigener Checker ohne Nachbarschafts-Kontext versagt („Reject 44“ an einer nahtlosen Wand); **(3) Tagging und Export** – 9 von 10 Packs liefern null maschinenlesbare Metadaten, also werden Massen-Tagging (`"solid"`, `"water"`, `"ramp"`) und enginefertige Sidecars von Grund auf geschrieben. Eine Übersetzungsmaschine zwischen Grafik und Code würde alle drei nehmen – pixelsauberes Schneiden, Rastererkennung plus Blob-Berechnung, automatische Tags plus JSON, das die Engine direkt versteht. In der TileSmith-Pipeline ist diese Maschine der **TileFix Doctor** (Upload → Doctor → Set → Map → Export), und er läuft lokal in deinem Browser – kein Account nötig für den Start. Pricing, vorab beantwortet (weil jemand fragen wird): Die Basis-Studio-Produkte – TileDoctor, TileSetCreator, Terrain Studio, TileMap Creator – sind gratis innerhalb eines Starter-Asset-Volumens, das kommenden Creatorn genug für den Anfang geben soll, und die GitHub-Workflow-Actions plus die Web-Demo sind ebenfalls gratis. (Die Rohbild-zu-enginefertig-Pipeline selbst läuft TileDoctor → TileSetCreator → Terrain Studio (teilweise); TileMap Creator baut downstream auf fertigen Tiles auf.) KleeBlatt Space tauscht keine Paywall (bezahlte Assets) gegen eine andere (bezahltes Tooling) – die Gates dieser Studie bleiben in deiner eigenen CI lauffähig, gratis. Wenn deine CI Review oder Reject sagt, ist der Doctor das Stück, das die Frage beantwortet, die diese Studie absichtlich offen lässt: *Kaputt – oder nur unassembliert, ungelabelt und unexportiert?*

Die Schleife schließt sich, wo sie anfing: gefixte Tiles, neu bewertet von der gratis Action in deinen eigenen PRs – und der VERIFIED-Durchgang dieser Studie, Re-Run mit gepinntem Core plus Doctor-Fix-Durchgang, wird zeigen, ob assemblierungs-bewusstes Tooling die Latte reißt, an der die Baseline scheiterte. Du musst uns nie irgendwas glauben.

## 9. Grenzen & Datenherkunft

**Herkunft (Pflichtformat per `docs/FIELD_STUDY_01.md`):**

| Feld | Wert |
|---|---|
| Datenstatus | **STRUCTURAL (v1.0)** – echte Packs/Inventar/Audit/Pilotscores; Scorer ist die öffentliche Pixel-Baseline, nicht publikationsreif |
| Stichprobengröße | 240 Tiles (24/Pack × 10), gepoolt aus 7.138 nicht-leeren Katalog-Zellen + 101 losen Dateien; 682 mitgelieferte Bilder inventarisiert |
| Auswahlkriterien | itch.io gratis · 2D · Tilemap, nach Popularität; Lizenz-Gate; max. 2 Packs/Creator; 8 exakt + 2 Gleich-Creator-Substitutionen (protokolliert, [`SUBSTITUTIONS.md`](../case-studies/01/SUBSTITUTIONS.md)) |
| Datensatz-Version | benchmark-v2-Fixture-Set (120 CC0-Fixtures, 16×16- + 64×64-Klassen) für den Scorer; CS-01-Registry v1 (45 Sheets, 14.182 adressierbare Zellen) für die Stichprobe |
| Pipeline-Version | `pixel-baseline@1` (öffentliche Heuristik, in-repo) + `fix-pass-baseline` (nur Border/Despeckle); `tilefix-core`-Submodul zur Laufzeit NICHT aufgelöst – VERIFIED braucht `--scorer core --require-core` |
| Aggregationslogik | Mittlerer Score pro Tile → Gate-Zählungen; Multi-Defekt-Zählung (Metrik < 7/10); Stratifizierung (vollflächig vs. Fragment) per Kanten-Opazitäts-Regel |
| Rohbilder | niemals in diesem Repository gespiegelt (nur Hashes + Sheet-/Zell-Provenienz, in `data/*.json`) |
| Datendateien | `case-studies/01/data/`: `batch-results.json` (480 bewertete Tiles: 240 vorher + 240 nachher) · `tables.md` · `registry.json` · `gap0-steps.json` (Studio-Schritt-Readiness pro Pack) · `fixlog.json` · `stratification.json` · `format-audit.json` · `correlation.json` + Streuungs-SVG · `figures/` (abstrakte SVGs) · `manifest-scoring.json` · `manifest-correlation.json` (unter `case-studies/01/`) |

**Grenzen:** In diesem Piloten wird keine Zeit gestoppt – Arbeitseinheiten (§4.4–4.6) sind die quantifizierte Hürde, und jeder Einheiten-Satz oder „×N schneller“-Faktor wartet auf den vorab registrierten zeitgesteuerten Trial; Framing: Readiness ≠ Kunstqualität – Readiness-Gates messen Engine-Fertigkeit, niemals künstlerischen Wert – ein Reject-Tile kann großartige Kunst sein; die Pixel-Baseline ist eine auf synthetische Texturen kalibrierte Einzelzell-Heuristik – an assemblierungs-designter Kunst werden ihre Seam-/Border-/Artifact-Flags von den Störgrößen in §4.2 dominiert (fehlender Assemblierungs-Kontext, Outline-Stile, Dithering), also dürfen Gate-Prozente nicht als Pack-Readiness-Urteile zitiert werden; der heuristische Raster-Detektor halluziniert Raster (Docs, skalierte Kunst) und verpasst echte (spärliche Sheets) – kurierte Katalog-Zählungen supersedieren ihn; Pack J (isometrisch) braucht projektions-bewusste Metriken, die der Baseline fehlen; das H1-Null ist range-restringiert und uninformativ (n = 8, Fail-Anteil 92–100 %); der Fix-Durchgang sind zwei Pixel-Ops, nicht der Doctor – sein kleines Netto-Delta (+3,8) bei 6 Gate-Drops demonstriert Metrik-Kopplung, kein Produktions-Fixen; B/E-Substitutionen kosteten zwei Korrelations-Ränge (protokolliert, niemals imputiert); „Warum Creator Atlasse liefern“ (§4.4) ist Interpretation, keine Umfragedaten; n = 10 Packs ist ein Pilot – der 50-Pack-Sweep aus Feldstudie 01 ist das Follow-up, und der VERIFIED-Rerun (gepinnter Core + Doctor-Durchgang) ist der erforderliche nächste Pass auf derselben Stichprobe. Jenseits von CS-01s Scope liegen zwei weitere Hindernisse, die das Projektziel nennt: der Aufwand, Assets *überhaupt erst zu erstellen*, und – downstream fertiger Tiles – das Authoring geschichteter Weltmaps im großen Stil (hunderte Tiles plus Atlas, Metadaten und Ordner, von Hand in Engine-Layer gemappt; generative Bildtools emittieren heute überhaupt keine engine-geschichteten Maps). Beides ist Folgestudien-Terrain; CS-01 misst nur das mittlere Segment: rohe Tiles zu fertigen Tiles.

## 10. Credits & Lizenz

- Text und aggregierte Daten: **CC BY 4.0**.
- Benchmark-Fixtures: **CC0**, Basis-Assets von [Kenney](https://kenney.nl) (`assets/base/KENNEY_LICENSE.txt`).
- Pack-Quellen: einzeln credited in [`case-studies/01/SOURCES.md`](../case-studies/01/SOURCES.md) (alle 10 Packs abgerufen 2026-09-07; Lizenzen pro Pack aus beiliegenden Readmes + Store-Seiten). Besonderer Dank an die Creator – Cup Nooble, Pixel_Poem, Cainos, Anokolisa, Szadi art., Seliel the Shaper, Pixel Frog, 0x72, Devil's Workshop –, deren Gratis-Packs diese Studie tragen; nichts hier bewertet ihre Kunst, nur was rohe Downloads von Usern und Tooling verlangen.
- Scoring & Optimierung: [TileSmith GC-Pipeline Benchmark](../README.md) · CI-Scoring: [TileSmith QC](https://github.com/KleeBlattSpace/tilesmith-actions) · Fix-Pipeline: [TileSmith Studio](https://tilesmith.kleeblatt.space), mit 🍀 gemacht von [KleeBlattSpace](https://github.com/KleeBlattSpace).

## 11. Referenzen

Nur Hintergrund-Behauptungen – alle Messungen sind die eigenen der Studie (§9). Abgerufen 2026-09-07.

- [1] Red Blob Games, „Autotiling“ – Bitmasken-zu-Tileset-Kombinatorik (4 Nachbarn → 16 Tiles; 8 Nachbarn → 47 mit Reduktion; Engine-Layout-Notizen). <https://www.redblobgames.com/articles/autotile/claude/>
- [2] Excalibur.js, „Dual Tilemap Autotiling Technique“ – Blob-/Bitmasken-Praxis (~47–56 Tiles), Komplexitätswachstum bei mehreren Terrains und der manuelle Bitmasken-Mapping-Aufwand. <https://excaliburjs.com/blog/Dual%20Tilemap%20Autotiling%20Technique/>
- [3] Game-Developers.org, „What Is Sprite Atlas in Unity? The Complete Technical Guide“ – Atlas-Batching-Mechanik (Shared-Atlas-Sprites rendern in einem einzigen Draw Call). <https://game-developers.org/what-is-sprite-atlas-in-unity>
