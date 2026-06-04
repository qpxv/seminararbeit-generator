# Leitfaden Extraction Prompt

Copy the prompt below and paste it into any AI (Claude, ChatGPT, etc.) together with your Leitfaden PDF.
The AI will output a JSON block. Save that JSON as `lib/leitfaden-format.json` in the project root.
The DOCX generator will automatically pick it up on the next run.

---

## Prompt (copy everything between the dashes)

---

Du bist ein präziser Assistent. Ich gebe dir den Text eines Hochschul-Leitfadens für wissenschaftliche Seminararbeiten.
Extrahiere daraus **alle** formalen Vorgaben und gib sie als **einziges valides JSON-Objekt** zurück — kein Text davor oder danach, keine Markdown-Backticks.

Halte dich exakt an dieses Schema (alle Felder sind optional — lass weg, was im Leitfaden nicht steht):

```json
{
  "deckblatt": {
    "logoBreite": 280,
    "logoHoehe": 84,
    "zeigeMatrikelnummer": true,
    "zeigeSemester": true,
    "zeigeStudiengang": true,
    "zeigeBetreuer": true,
    "zeigeAbgabedatum": true,
    "titelFettgedruckt": true,
    "reihenfolge": ["logo", "hochschule", "modul", "titel", "student", "betreuer", "datum"]
  },
  "schrift": {
    "art": "Times New Roman",
    "groesse": 12,
    "zeilenabstand": 1.5,
    "absatzAbstand": 6
  },
  "seitenraender": {
    "oben": 2.5,
    "unten": 2.5,
    "links": 3.0,
    "rechts": 2.5
  },
  "seitenzahlen": {
    "ab": "inhaltsverzeichnis",
    "format": "arabisch",
    "position": "unten-mitte"
  },
  "gliederung": {
    "maxEbenen": 3,
    "nummerierungsstil": "1.1.1",
    "inhaltsverzeichnisErforderlich": true,
    "abbildungsverzeichnisErforderlich": false,
    "tabellenverzeichnisErforderlich": false
  },
  "zitierung": {
    "stil": "APA 7",
    "fussnoten": false,
    "direktZitatEinzug": true,
    "direktZitatAbGrenze": 40,
    "quellenImText": true
  },
  "literaturverzeichnis": {
    "ueberschrift": "Literaturverzeichnis",
    "haengenderEinzug": true,
    "alphabetischSortiert": true
  },
  "sonstiges": {
    "mindestSeitenanzahl": 10,
    "maxSeitenanzahl": 20,
    "sprache": "de",
    "eigenstaendigkeitserklaerungErforderlich": true,
    "abstrakt": false,
    "quellenMindestanzahl": 5
  }
}
```

Wichtige Hinweise:
- Alle Seitenränder in Zentimetern (cm)
- Schriftgröße in Punkt (pt)
- Zeilenabstand als Faktor (1.0, 1.5, 2.0)
- Falls der Leitfaden einen Wert nicht nennt, lass das Feld komplett weg
- Gib NUR das JSON zurück

Hier ist der Leitfaden-Text:

[LEITFADEN-TEXT HIER EINFÜGEN]

---

## After you get the JSON

1. Save the output as `lib/leitfaden-format.json`
2. Restart the dev server (`npm run dev`)
3. Generate a new document — the DOCX will use your Leitfaden's exact formatting rules
