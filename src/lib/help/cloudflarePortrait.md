Portraits und Figuren malt **FLUX.2 klein** auf Cloudflare Workers AI. Der kostenlose Tarif
reicht dafür: Cloudflare schenkt jeden Tag 10.000 „Neuronen". Ein Portrait kostet rund 105 davon,
eine Figur aus dem Portrait etwas mehr — das sind knapp hundert Bilder am Tag. Eine Kreditkarte
braucht es nicht.

Die App braucht zwei Angaben: die **Account-ID** und einen **API-Token**.

## 1. Konto anlegen

1. [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) öffnen.
2. E-Mail-Adresse und Passwort eingeben, **Sign up** wählen.
3. Die Bestätigungsmail von Cloudflare öffnen und den Link darin anklicken.

Fragt Cloudflare danach nach einer Domain oder einem Website-Plan: überspringen. Für Workers AI
wird keine Domain gebraucht.

## 2. Token und Account-ID holen

1. Im [Cloudflare-Dashboard](https://dash.cloudflare.com/) links **AI → Workers AI** öffnen.
2. **Use REST API** wählen.
3. **Create a Workers AI API Token** wählen, die vorausgefüllten Angaben so lassen und
   **Create API Token** bestätigen. Dieser Weg vergibt genau die Rechte, die die App braucht.
4. **Copy API Token** — den Token gleich in die App eintragen (Schritt 3).
   Cloudflare zeigt ihn **nur dieses eine Mal**. Die Token-Liste unter *API Tokens* zeigt später
   nur noch Name und ID, nicht den Token selbst. Ist er weg: beim Token **Roll** wählen, das
   erzeugt einen neuen.
5. Auf derselben Seite steht unter **Get Account ID** die Account-ID (32 Zeichen aus Ziffern
   und den Buchstaben a–f). Auch sie kopieren. Sie steht außerdem in der Adresszeile des
   Dashboards: `dash.cloudflare.com/<Account-ID>/…`.

Wer den Token lieber von Hand baut: unter
[My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens) **Create Token** wählen
und die Vorlage **Workers AI** nehmen.

## 3. In der App eintragen

1. Rechts im KI-Bereich das Zahnrad **⚙** (LLM-Einstellungen) öffnen.
2. Unten unter **Bildgenerierung** als Anbieter **Cloudflare FLUX** wählen.
3. Die Account-ID ins Feld **Account**, den Token ins Feld **Token** einfügen.
4. **Speichern**.

Der Token liegt danach im Schlüsselbund des Betriebssystems, nicht im Vault — er wandert also
nicht mit, wenn du den Vault weitergibst. Das Feld zeigt dann „•••••• gespeichert".

## Wenn es nicht klappt

Die genaue Anfrage und Cloudflares Antwort samt Fehlercode stehen im Reiter **Debug** des
KI-Bereichs — der Token erscheint dort nicht.

- **„Cloudflare FLUX ist nicht eingerichtet"** — Account-ID oder Token fehlen. Beides eintragen
  und **Speichern** drücken.
- **„Authentication error (10000)"** — Cloudflare lehnt den Token ab. Meist wurde die Token-ID
  aus der Liste statt des Tokens eingetragen, oder Token und Account-ID gehören zu verschiedenen
  Konten. In den Einstellungen **Token löschen**, einen neuen erstellen (Schritt 2) und eintragen.
- **„Could not route …"** oder **HTTP 404** — die Account-ID stimmt nicht. Noch einmal von der
  Workers-AI-Seite kopieren, ohne Leerzeichen.
- **„Your output has been flagged" (3030)** — Cloudflares Inhaltsfilter hat das Bild gesperrt. Er
  schlägt schon bei harmlosen Wörtern an, etwa bei Beschreibungen von Haut und Körper oder bei
  Namen wie „Oath of Devotion". Die Felder **Aussehen** und **Zusätzlich** bzw. den Prompt
  umformulieren und erneut generieren.
- **HTTP 429** oder ein Hinweis auf das Kontingent — die 10.000 Neuronen des Tages sind
  verbraucht. Sie füllen sich um 00:00 UTC (1 bzw. 2 Uhr deutscher Zeit) wieder auf.
