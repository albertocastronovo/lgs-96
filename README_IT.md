# LGS-96

Leggi in altre lingue:
- :us: [English](README.md)

LGS-96 è un'estensione di Chrome che mostra le informazioni sulla RAL trovate nella descrizione degli annunci di LinkedIn
direttamente sulle card nei risultati di ricerca.  
L'obiettivo di questo progetto è aiutarti a risparmiare tempo, passando oltre le opportunità non adeguate alle tue aspettative sulla retribuzione.  
L'estensione prende il suo nome dal **D.Lgs. 96/2026**, la legge italiana in merito alla trasparenza retributiva. Questa legge
obbligherebbe le aziende a indicare i range retributivi negli annunci di lavoro (o, comunque, di comunicarli prima del primo colloquio); tuttavia, molte aziende non lo fanno ancora.

**LGS-96 non è in alcun modo collegato, finanziato, o affiliato con LinkedIn.**

## Caratteristiche

- Un badge colorato su ogni card mostra le informazioni sulla retribuzione nel testo dell'inserzione:
  - :green_circle: verde: un intervallo di RAL ragionevolmente contenuto;
  - :yellow_circle: giallo: un intervallo di RAL esteso o un singolo valore indicativo;
  - :red_circle: rosso: nessuna informazione sulla RAL;
  - :white_circle: grigio: l'estensione non ha potuto verificare le informazioni sulla retribuzione a causa di un errore.
- L'estensione verifica se la card contiene già informazioni sull'intervallo di retribuzione; se non le contiene,
  manda una richiesta alle API di LinkedIn e legge la descrizione completa dell'inserzione (con controlli per evitare il rate-limit del sito), estraendone l'intervallo retributivo, con una valuta predefinita in base alla regione dell'utente e supporto per inserzioni in italiano e inglese;
- Controllo della frequenza massima delle richieste al sito (Lenta / Media / Veloce) dalle impostazioni dell'estensione per evitare il rate-limit di LinkedIn;
- **Cache locale** dei risultati (fino a 3 giorni; può essere disattivata e/o svuotata dalle impostazioni);
- interfaccia in **italiano** e **inglese**;
- clicca sulla bandiera sul badge colorato per **Segnalare un risultato errato**.

## Installare l'estensione

### Dal Chrome Web Store (raccomandato)

Scarica l'estensione [qui!](https://google.com)

### Dal codice sorgente

1. Scarica o clona questa repo;
2. Apri `chrome://extensions` nel browser;
3. Abilita la **Modalità sviluppatore** in alto a destra;
4. Clicca su **Carica estensione non pacchettizzata** e seleziona la cartella `extension/` di questo progetto.

## Come si usa

Cliccando l'icona dell'estensione in alto a destra, puoi accedere alle sue impostazioni:
<img src="readme_pictures/lgs96_settings.png" width="200">  
- **Lingua: **
- **Frequenza richieste: **
- **Cache locale: **
- **Cache cloud: **
- **Pulisci cache: **
- **Offrimi un caffè: ** la funzionalità più importante di tutta l'estensione - ti manda alla mia [pagina di Ko-Fi](https://ko-fi.com/albertocastronovo) :heart:  

Una volta configurata, apri semplicemente LinkedIn e la vedrai funzionare!  
Le pagine attualmente supportate sono:
- [`linkedin.com/jobs/`](https://www.linkedin.com/jobs/) (funziona sulle 1-3 card all'inizio della pagina)
- [`linkedin.com/search/results/all/`](https://www.linkedin.com/search/results/all/) (funziona nella sezione _Offerte di lavoro_)

- [`linkedin.com/jobs/search-results/`](https://www.linkedin.com/jobs/search-results/)

- [`linkedin.com/jobs/collections/recommended`](https://www.linkedin.com/jobs/collections/recommended)

## Privacy

L'estensione usa lo storage locale del browser per salvare i risultati della scansione degli annunci di lavoro e le tue impostazioni.  
**Le descrizioni degli annunci sono analizzate in modo transitorio e non sono mai salvate o inviate in alcun modo.**  
Le uniche destinazioni di rete sono LinkedIn (annunci di lavoro pubblici) e, quando invii una segnalazione di errore, il servizio di [FormSubmit](https://formsubmit.co/) per l'invio di email.

## Sviluppo

Il progetto consiste principalmente in JavaScript senza pacchetti e dipendenze particolari. I test possono essere avviati tramite:

```
node --test tests/salary-parser.test.js tests/cache.test.js tests/scheduler.test.js tests/feedback.test.js tests/localization.test.js tests/routes.test.js tests/fixture-cards.test.js tests/fixtures-sanitized.test.js tests/cloud-cache.test.js
```

Di seguito sono elencati alcuni script accessori:
- `node scripts/generate-locales.js` — scrive i file in `extension/_locales/` a partire dai file YAML di localizzazione in `extension/localization/`.
- `node scripts/sanitize-fixtures.js` — esegue un parsing delle pagine HTML in `pages/` per renderle completamente anonime
  (toglie nomi di script, informazioni personali e di contatto).
- `node scripts/package.js` — crea lo ZIP dell'estensione nella cartella `dist/` e ne stampa l'hash.

## Licenza

[MIT](LICENSE)
